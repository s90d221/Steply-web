import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MediaPipePoseNames } from './poseLandmarks';
import { createMovementAnalyzer } from './movementAnalyzers';
import { PoseLandmarkSeries, normalizePoseLandmarks } from './poseTimeSeries';
import { createPoseSmootherForTest } from './poseSmoother';
import {
  TRACKING_QUALITY_MIN_RESULT,
  evaluateCameraReadiness,
} from './trackingQuality';
import wasmModuleLoaderUrl from '../vendor/mediapipe/wasm/vision_wasm_module_internal.js?url';
import wasmModuleBinaryUrl from '../vendor/mediapipe/wasm/vision_wasm_module_internal.wasm?url';

const DEFAULT_MODEL_PATH = '/models/pose_landmarker_lite.task';
const MODEL_PATHS_BY_QUALITY = {
  accurate: ['/models/pose_landmarker_heavy.task', '/models/pose_landmarker_full.task', DEFAULT_MODEL_PATH],
  balanced: ['/models/pose_landmarker_full.task', DEFAULT_MODEL_PATH],
  fast: [DEFAULT_MODEL_PATH],
};
const DEFAULT_WASM_PATH = '/wasm';
const MIN_FRAME_INTERVAL_MS = 66;
const MIN_POSE_CONFIDENCE = 0.65;
const PROCESSING_TELEMETRY_SAMPLE_LIMIT = 60;
const PROCESSING_TELEMETRY_REPORT_INTERVAL = 20;
const SESSION_LOW_QUALITY_RATIO_LIMIT = 0.35;
const SESSION_MIN_ACCEPTED_FRAMES = 3;

let landmarker = null;
let selectedTest = 'chair_stand';
let analyzer = createMovementAnalyzer(selectedTest);
let steadiLandmarkSeries = new PoseLandmarkSeries();
let poseSmoother = createPoseSmootherForTest(selectedTest);
let initialized = false;
let initializing = null;
let session = null;
let latestFrameAt = 0;
let latestAnalyzeAt = 0;
let latestMediaPipeTimestampMs = 0;
let frameSequence = 0;
let isAnalyzingFrame = false;
let processedFrameWallTimes = [];
let inferenceDurationsMs = [];
let latestQualitySample = null;
let sessionQuality = null;

function normalizeBasePath(path) {
  return String(path || '').replace(/\/$/, '');
}

function debug(event, details = {}) {
  postMessage({
    type: 'debug',
    event,
    details,
    at: Date.now(),
  });
}

function defaultWasmPath() {
  return DEFAULT_WASM_PATH;
}

function modelQuality(config = {}) {
  const requested = String(config.modelQuality || config.quality || 'balanced').toLowerCase();
  return MODEL_PATHS_BY_QUALITY[requested] ? requested : 'balanced';
}

function modelAssetCandidates(config = {}) {
  if (config.modelAssetPath) return [config.modelAssetPath];
  return MODEL_PATHS_BY_QUALITY[modelQuality(config)] || MODEL_PATHS_BY_QUALITY.balanced;
}

async function probeAsset(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error.message || 'fetch failed',
    };
  }
}

async function probeWasmBasePath(basePath) {
  const normalized = normalizeBasePath(basePath);
  const [moduleLoader, moduleWasm, classicLoader, classicWasm] = await Promise.all([
    probeAsset(`${normalized}/vision_wasm_module_internal.js`),
    probeAsset(`${normalized}/vision_wasm_module_internal.wasm`),
    probeAsset(`${normalized}/vision_wasm_internal.js`),
    probeAsset(`${normalized}/vision_wasm_internal.wasm`),
  ]);

  debug('wasm-assets-probed', {
    basePath: normalized,
    moduleLoader,
    moduleWasm,
    classicLoader,
    classicWasm,
  });
}

async function resolveVisionFileset(config = {}) {
  const basePath = normalizeBasePath(config.wasmPath || defaultWasmPath());
  const useBundledWasm = !config.wasmPath;
  debug('fileset-resolve-start', {
    workerLocation: self.location.href,
    basePath,
    useBundledWasm,
    useModule: true,
  });
  if (!useBundledWasm) await probeWasmBasePath(basePath);
  const fileset = useBundledWasm
    ? {
        wasmLoaderPath: wasmModuleLoaderUrl,
        wasmBinaryPath: wasmModuleBinaryUrl,
      }
    : await FilesetResolver.forVisionTasks(basePath, true);
  debug('fileset-resolve-complete', {
    wasmLoaderPath: fileset.wasmLoaderPath,
    wasmBinaryPath: fileset.wasmBinaryPath,
    assetLoaderPath: fileset.assetLoaderPath || null,
    assetBinaryPath: fileset.assetBinaryPath || null,
  });
  const module = await import(/* @vite-ignore */ fileset.wasmLoaderPath.toString());
  self.ModuleFactory = module.default || globalThis.ModuleFactory;
  debug('module-factory-loaded', {
    loaderPath: fileset.wasmLoaderPath,
    hasDefaultExport: typeof module.default === 'function',
    hasSelfModuleFactory: typeof self.ModuleFactory === 'function',
    hasGlobalModuleFactory: typeof globalThis.ModuleFactory === 'function',
  });
  return {
    ...fileset,
    // tasks-vision checks self.ModuleFactory even when no loader path is given.
    // We pre-load the ES module above to avoid Vite/public script loading issues.
    wasmLoaderPath: '',
  };
}

async function usableModelCandidates(config = {}) {
  const candidates = modelAssetCandidates(config);
  const probed = [];
  for (const modelAssetPath of candidates) {
    const probe = await probeAsset(modelAssetPath);
    probed.push(probe);
  }
  debug('pose-model-assets-probed', {
    requestedQuality: modelQuality(config),
    candidates: probed,
  });
  const available = probed
    .filter((probe) => probe.ok && !String(probe.contentType || '').includes('text/html'))
    .map((probe) => probe.url);
  return [...new Set([...available, ...candidates])];
}

async function initLandmarker(config = {}) {
  if (initialized && landmarker) return;
  if (initializing) return initializing;

  initializing = (async () => {
    const preferredDelegates = config.delegate
      ? [config.delegate]
      : ['GPU', 'CPU'];
    const modelCandidates = await usableModelCandidates(config);
    debug('landmarker-init-start', {
      requestedQuality: modelQuality(config),
      modelCandidates,
      delegates: preferredDelegates,
      thresholds: {
        minPoseDetectionConfidence: config.minPoseDetectionConfidence || MIN_POSE_CONFIDENCE,
        minPosePresenceConfidence: config.minPosePresenceConfidence || MIN_POSE_CONFIDENCE,
        minTrackingConfidence: config.minTrackingConfidence || MIN_POSE_CONFIDENCE,
      },
    });
    const vision = await resolveVisionFileset(config);
    let lastError = null;
    for (const modelAssetPath of modelCandidates) {
      for (const delegate of preferredDelegates) {
        try {
          debug('landmarker-delegate-attempt', { delegate, modelAssetPath });
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath,
              delegate,
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: config.minPoseDetectionConfidence || MIN_POSE_CONFIDENCE,
            minPosePresenceConfidence: config.minPosePresenceConfidence || MIN_POSE_CONFIDENCE,
            minTrackingConfidence: config.minTrackingConfidence || MIN_POSE_CONFIDENCE,
          });
          debug('landmarker-delegate-ready', { delegate, modelAssetPath, runningMode: 'VIDEO' });
          break;
        } catch (error) {
          lastError = error;
          debug('landmarker-delegate-failed', {
            delegate,
            modelAssetPath,
            message: error.message || 'Delegate initialization failed.',
            stack: error.stack || null,
          });
        }
      }
      if (landmarker) break;
    }

    if (!landmarker) throw lastError || new Error('PoseLandmarker initialization failed.');
    initialized = true;
    debug('landmarker-init-complete');
    postMessage({ type: 'ready', at: Date.now() });
  })();

  try {
    await initializing;
  } catch (error) {
    debug('landmarker-init-failed', {
      message: error.message || 'PoseLandmarker initialization failed.',
      stack: error.stack || null,
    });
    throw error;
  } finally {
    initializing = null;
  }
}

function closeLandmarker() {
  try {
    landmarker?.close?.();
  } catch (_) {
    // Ignore close failures; the next init creates a fresh MediaPipe graph.
  }
  landmarker = null;
  initialized = false;
  initializing = null;
}

function nextMediaPipeTimestampMs(candidateTimestampMs) {
  const candidate = Number.isFinite(candidateTimestampMs) ? candidateTimestampMs : Date.now();
  latestMediaPipeTimestampMs = Math.max(candidate, latestMediaPipeTimestampMs + 1);
  return latestMediaPipeTimestampMs;
}

function normalizeLandmarks(rawLandmarks = []) {
  return normalizePoseLandmarks(rawLandmarks.map((landmark, index) => ({
    name: MediaPipePoseNames[index] || `landmark_${index}`,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: Number.isFinite(landmark.visibility) ? landmark.visibility : 0,
  })));
}

function resetProcessingTelemetry() {
  processedFrameWallTimes = [];
  inferenceDurationsMs = [];
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function recordProcessingTelemetry({ analyzedAt, inferenceDurationMs }) {
  processedFrameWallTimes.push(analyzedAt);
  inferenceDurationsMs.push(inferenceDurationMs);
  while (processedFrameWallTimes.length > PROCESSING_TELEMETRY_SAMPLE_LIMIT) processedFrameWallTimes.shift();
  while (inferenceDurationsMs.length > PROCESSING_TELEMETRY_SAMPLE_LIMIT) inferenceDurationsMs.shift();

  const firstWallTime = processedFrameWallTimes[0];
  const latestWallTime = processedFrameWallTimes.at(-1);
  const observedDurationMs = latestWallTime - firstWallTime;
  const processedFps = observedDurationMs > 0
    ? (processedFrameWallTimes.length - 1) * 1000 / observedDurationMs
    : null;
  const telemetry = {
    processedFrameCount: processedFrameWallTimes.length,
    processedFps,
    averageInferenceMs: average(inferenceDurationsMs),
    latestInferenceMs: inferenceDurationMs,
    minFrameIntervalMs: MIN_FRAME_INTERVAL_MS,
    configuredMaxFps: 1000 / MIN_FRAME_INTERVAL_MS,
  };

  if (frameSequence > 0 && frameSequence % PROCESSING_TELEMETRY_REPORT_INTERVAL === 0) {
    debug('pose-processing-rate', telemetry);
  }

  return telemetry;
}

function setSelectedTest(nextSelectedTest) {
  const next = nextSelectedTest || selectedTest || 'chair_stand';
  if (next === selectedTest) return;
  selectedTest = next;
  poseSmoother = createPoseSmootherForTest(selectedTest);
  latestQualitySample = null;
}

function resetSessionQuality() {
  sessionQuality = {
    sampleCount: 0,
    acceptedFrameCount: 0,
    lowQualityFrameCount: 0,
    cautionFrameCount: 0,
    totalTrackingQualityScore: 0,
    currentLowQualityStreak: 0,
    longestLowQualityStreak: 0,
    latestReadiness: null,
  };
}

function recordSessionQuality(readiness, accepted) {
  if (!sessionQuality) resetSessionQuality();
  const trackingQualityScore = readiness?.trackingQualityScore ?? readiness?.trackingQuality?.trackingQualityScore ?? 0;
  sessionQuality.sampleCount += 1;
  sessionQuality.totalTrackingQualityScore += trackingQualityScore;
  if (accepted) {
    sessionQuality.acceptedFrameCount += 1;
    sessionQuality.currentLowQualityStreak = 0;
  } else {
    sessionQuality.lowQualityFrameCount += 1;
    sessionQuality.currentLowQualityStreak += 1;
    sessionQuality.longestLowQualityStreak = Math.max(
      sessionQuality.longestLowQualityStreak,
      sessionQuality.currentLowQualityStreak,
    );
  }
  if (readiness?.trackingQuality?.level === 'caution') sessionQuality.cautionFrameCount += 1;
  sessionQuality.latestReadiness = readiness;
}

function sessionTrackingQualitySummary() {
  if (!sessionQuality?.sampleCount) {
    return {
      sampleCount: 0,
      acceptedFrameCount: 0,
      lowQualityFrameCount: 0,
      cautionFrameCount: 0,
      lowQualityRatio: 1,
      trackingQualityScore: 0,
      longestLowQualityStreak: 0,
    };
  }
  return {
    sampleCount: sessionQuality.sampleCount,
    acceptedFrameCount: sessionQuality.acceptedFrameCount,
    lowQualityFrameCount: sessionQuality.lowQualityFrameCount,
    cautionFrameCount: sessionQuality.cautionFrameCount,
    lowQualityRatio: sessionQuality.lowQualityFrameCount / sessionQuality.sampleCount,
    trackingQualityScore: sessionQuality.totalTrackingQualityScore / sessionQuality.sampleCount,
    longestLowQualityStreak: sessionQuality.longestLowQualityStreak,
  };
}

function shouldBlockFrame(readiness) {
  return (
    !readiness?.fullBodyVisible
    || !readiness?.feetVisible
    || !readiness?.singlePersonDetected
    || !readiness?.brightnessOk
    || (readiness?.trackingQualityScore ?? 0) < TRACKING_QUALITY_MIN_RESULT
  );
}

function shouldInvalidateSession(summary) {
  return (
    summary.acceptedFrameCount < SESSION_MIN_ACCEPTED_FRAMES
    || summary.trackingQualityScore < TRACKING_QUALITY_MIN_RESULT
    || summary.lowQualityRatio >= SESSION_LOW_QUALITY_RATIO_LIMIT
  );
}

function invalidTrackingResult(completedAt, summary, reason = 'camera_tracking_quality') {
  return {
    testType: selectedTest,
    invalid: true,
    invalidReason: reason,
    primaryValue: null,
    primaryLabel: 'Camera Check',
    repetitionCount: 0,
    durationSeconds: analyzer.getCurrentState(completedAt)?.durationSeconds || 30,
    confidence: summary.trackingQualityScore,
    trackingQualityScore: summary.trackingQualityScore,
    trackingQualitySummary: summary,
    recommendationLevel: 'recheck',
    clinicalResultAvailable: false,
    testFlags: {
      cameraSetupNeeded: true,
      clinicalResultAvailable: false,
      trackingQualityTooLow: true,
      invalidReason: reason,
    },
    summaryMessage: "Let's adjust the camera and try again.",
    seniorMessage: "Let's adjust the camera and try again.",
    staffMessage: `Tracking quality was ${Math.round((summary.trackingQualityScore || 0) * 100)}%; no screening result was generated.`,
    professionalNotes: 'Pose tracking quality was below the assessment threshold. No fall-risk classification or weakness result should be used from this session.',
    startedAt: session?.startedAt || null,
    completedAt,
  };
}

function stateForCameraIssue(timestampMs, readiness) {
  const current = analyzer.getCurrentState(timestampMs);
  return {
    ...current,
    confidence: readiness?.trackingQualityScore ?? 0,
    trackingQualityScore: readiness?.trackingQualityScore ?? 0,
    trackingQuality: readiness?.trackingQuality || null,
    cameraReadiness: readiness,
    isFullBodyVisible: Boolean(readiness?.fullBodyVisible),
    warningMessage: readiness?.message || "Let's adjust the camera and try again.",
    postureMessage: 'Tracking is paused until the full body and both feet are clear.',
    phase: 'camera_check',
    trackingPaused: true,
  };
}

function buildPoseQualityPayload({ detected, timestampMs, poseCount, brightness }) {
  const smoothed = poseSmoother.smooth(detected.landmarks, { timestampMs });
  const readiness = evaluateCameraReadiness({
    landmarks: smoothed.landmarks,
    testType: selectedTest,
    previousSample: latestQualitySample,
    poseCount,
    brightness,
    strictStability: true,
  });
  latestQualitySample = readiness.sample;
  return {
    ...smoothed,
    cameraReadiness: readiness,
    trackingQuality: readiness.trackingQuality,
    trackingQualityScore: readiness.trackingQualityScore,
  };
}

async function estimateFrameBrightness(bitmap) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const width = 24;
    const height = 24;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    let luma = 0;
    for (let index = 0; index < data.length; index += 4) {
      luma += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
    }
    return luma / (data.length / 4);
  } catch (_) {
    return null;
  }
}

async function imageBitmapFromFrame(frame) {
  const createBitmap = async (source) => {
    try {
      return await createImageBitmap(source, {
        imageOrientation: 'from-image',
        colorSpaceConversion: 'default',
      });
    } catch (_) {
      return createImageBitmap(source);
    }
  };

  if (frame instanceof Blob) {
    return createBitmap(frame);
  }

  if (frame instanceof ArrayBuffer) {
    return createBitmap(new Blob([frame], { type: 'image/jpeg' }));
  }

  if (typeof frame === 'string') {
    const response = await fetch(frame);
    const blob = await response.blob();
    return createBitmap(blob);
  }

  throw new Error('Unsupported camera frame type.');
}

async function detectPoseFromFrame(message) {
  await initLandmarker(message.config || {});
  const bitmap = await imageBitmapFromFrame(message.frame);
  const brightness = await estimateFrameBrightness(bitmap);
  const timestampMs = nextMediaPipeTimestampMs(message.receivedAt || Date.now());
  const inferenceStartedAt = Date.now();
  const result = landmarker.detectForVideo(bitmap, timestampMs);
  const inferenceEndedAt = Date.now();
  const rawLandmarks = result.landmarks?.[0] || [];
  const landmarks = normalizeLandmarks(rawLandmarks);
  const visibilityValues = rawLandmarks
    .map((point) => point.visibility)
    .filter((value) => Number.isFinite(value));
  const confidence = visibilityValues.length
    ? visibilityValues.reduce((sum, value) => sum + value, 0) / visibilityValues.length
    : rawLandmarks.length ? 1 : 0;

  return {
    bitmap,
    timestampMs,
    landmarks,
    poseCount: result.landmarks?.length || 0,
    brightness,
    confidence,
    inferenceDurationMs: inferenceEndedAt - inferenceStartedAt,
  };
}

async function handlePreviewFrame(message) {
  const now = Date.now();
  if (session?.active) return;
  if (isAnalyzingFrame) return;
  if (now - latestAnalyzeAt < MIN_FRAME_INTERVAL_MS) return;
  latestAnalyzeAt = now;
  isAnalyzingFrame = true;
  setSelectedTest(message.selectedTest);

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    const qualityPayload = buildPoseQualityPayload({
      detected,
      timestampMs: detected.timestampMs,
      poseCount: detected.poseCount,
      brightness: detected.brightness,
    });
    const analyzedAt = Date.now();
    postMessage({
      type: 'preview-frame',
      landmarks: qualityPayload.landmarks,
      rawLandmarks: qualityPayload.rawLandmarks,
      confidence: detected.confidence,
      trackingQualityScore: qualityPayload.trackingQualityScore,
      trackingQuality: qualityPayload.trackingQuality,
      cameraReadiness: qualityPayload.cameraReadiness,
      smoothing: qualityPayload.smoothing,
      frameSize: { width: bitmap.width, height: bitmap.height },
      receivedAt: detected.timestampMs,
      analyzedAt,
    });
  } catch (error) {
    if (/Packet timestamp mismatch|WaitUntilIdle failed|CalculatorGraph::Run\(\) failed/.test(error.message || '')) {
      closeLandmarker();
    }
    debug('preview-analysis-failed', {
      message: error.message || 'Pose preview failed.',
      stack: error.stack || null,
    });
    postMessage({
      type: 'error',
      error: error.message || 'Pose preview failed.',
      recoverable: true,
      source: 'preview-frame',
      at: Date.now(),
    });
  } finally {
    if (bitmap) bitmap.close?.();
    isAnalyzingFrame = false;
  }
}

async function handleFrame(message) {
  const now = Date.now();
  latestFrameAt = now;
  if (!session?.active) return;
  if (isAnalyzingFrame) return;
  if (now - latestAnalyzeAt < MIN_FRAME_INTERVAL_MS) return;
  latestAnalyzeAt = now;
  isAnalyzingFrame = true;

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    const timestampMs = detected.timestampMs;
    const confidence = detected.confidence;
    const qualityPayload = buildPoseQualityPayload({
      detected,
      timestampMs,
      poseCount: detected.poseCount,
      brightness: detected.brightness,
    });
    const blockedFrame = shouldBlockFrame(qualityPayload.cameraReadiness);
    recordSessionQuality(qualityPayload.cameraReadiness, !blockedFrame);
    const nextSequence = frameSequence + 1;
    let poseFrame = null;
    let state = null;
    if (blockedFrame) {
      state = stateForCameraIssue(timestampMs, qualityPayload.cameraReadiness);
    } else {
      const steadiFrame = steadiLandmarkSeries.push({
        sequence: nextSequence,
        timestampMs,
        receivedAt: message.receivedAt || timestampMs,
        landmarks: qualityPayload.landmarks,
        confidence: qualityPayload.trackingQualityScore,
      });
      poseFrame = {
        timestampMs,
        landmarks: steadiFrame.frame.landmarks,
        rawLandmarks: qualityPayload.rawLandmarks,
        confidence: qualityPayload.trackingQualityScore,
        metrics: steadiFrame.metrics,
        landmarkSeries: steadiFrame.series,
        trackingQuality: qualityPayload.trackingQuality,
        trackingQualityScore: qualityPayload.trackingQualityScore,
        cameraReadiness: qualityPayload.cameraReadiness,
      };
      state = analyzer.addFrame(poseFrame);
      state = {
        ...state,
        trackingQualityScore: qualityPayload.trackingQualityScore,
        trackingQuality: qualityPayload.trackingQuality,
        cameraReadiness: qualityPayload.cameraReadiness,
        trackingQualityWarning: qualityPayload.trackingQuality?.level === 'caution'
          ? 'Low-confidence movement tracking. Staff should review before using this result.'
          : null,
      };
    }
    frameSequence = nextSequence;
    const analyzedAt = Date.now();
    const processing = recordProcessingTelemetry({
      analyzedAt,
      inferenceDurationMs: detected.inferenceDurationMs,
    });

    postMessage({
      type: 'analysis-frame',
      sequence: frameSequence,
      state,
      landmarks: poseFrame?.landmarks || qualityPayload.landmarks,
      rawLandmarks: qualityPayload.rawLandmarks,
      confidence: qualityPayload.trackingQualityScore,
      trackingQualityScore: qualityPayload.trackingQualityScore,
      trackingQuality: qualityPayload.trackingQuality,
      cameraReadiness: qualityPayload.cameraReadiness,
      smoothing: qualityPayload.smoothing,
      frameSize: { width: bitmap.width, height: bitmap.height },
      receivedAt: timestampMs,
      analyzedAt,
      processing,
    });

    if (session?.active && (state.elapsedSeconds || 0) >= (state.durationSeconds || 30)) {
      debug('session-auto-finish', {
        selectedTest,
        elapsedSeconds: state.elapsedSeconds,
        durationSeconds: state.durationSeconds,
      });
      finishSession({ completedAt: timestampMs });
    }
  } catch (error) {
    if (/Packet timestamp mismatch|WaitUntilIdle failed|CalculatorGraph::Run\(\) failed/.test(error.message || '')) {
      closeLandmarker();
    }
    debug('frame-analysis-failed', {
      message: error.message || 'Pose analysis failed.',
      stack: error.stack || null,
    });
    postMessage({
      type: 'error',
      error: error.message || 'Pose analysis failed.',
      recoverable: true,
      source: 'camera-frame',
      at: Date.now(),
    });
  } finally {
    if (bitmap) bitmap.close?.();
    isAnalyzingFrame = false;
  }
}

function startSession(message) {
  const startedAt = message.startedAt || Date.now();
  setSelectedTest(message.selectedTest || 'chair_stand');
  analyzer = createMovementAnalyzer(selectedTest);
  session = {
    active: true,
    userId: message.userId || 'remote-user',
    selectedTest,
    startedAt,
  };
  analyzer.startSession(session.userId, startedAt);
  frameSequence = 0;
  steadiLandmarkSeries.reset();
  poseSmoother.reset();
  latestQualitySample = null;
  resetSessionQuality();
  resetProcessingTelemetry();
  postMessage({ type: 'session-started', startedAt, state: analyzer.getCurrentState(startedAt) });
}

function finishSession(message) {
  if (!session?.active) return;
  const completedAt = message.completedAt || Date.now();
  const qualitySummary = sessionTrackingQualitySummary();
  const invalidSession = shouldInvalidateSession(qualitySummary);
  const analyzerResult = invalidSession ? null : analyzer.finishSession(completedAt);
  const result = invalidSession
    ? invalidTrackingResult(completedAt, qualitySummary)
    : {
      ...analyzerResult,
      trackingQualityScore: qualitySummary.trackingQualityScore,
      trackingQualitySummary: qualitySummary,
      trackingQualityWarning: qualitySummary.trackingQualityScore < 0.8
        ? 'Low-confidence movement tracking. Staff should review before using this result.'
        : null,
      testFlags: {
        ...(analyzerResult?.testFlags || {}),
        trackingQualityCaution: qualitySummary.trackingQualityScore < 0.8,
      },
    };
  session = session ? { ...session, active: false, completedAt } : null;
  postMessage({ type: 'session-finished', completedAt, result, state: analyzer.getCurrentState(completedAt) });
}

function resetSession() {
  analyzer = createMovementAnalyzer(selectedTest);
  analyzer.reset();
  session = null;
  frameSequence = 0;
  latestFrameAt = 0;
  latestAnalyzeAt = 0;
  steadiLandmarkSeries.reset();
  poseSmoother.reset();
  latestQualitySample = null;
  resetSessionQuality();
  isAnalyzingFrame = false;
  resetProcessingTelemetry();
  postMessage({ type: 'session-reset', state: analyzer.getCurrentState(Date.now()) });
}

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'debug-probe') {
      await probeWasmBasePath(message.wasmPath || defaultWasmPath());
    }
    if (message.selectedTest) setSelectedTest(message.selectedTest);
    if (message.type === 'init') await initLandmarker(message.config || {});
    if (message.type === 'preview-frame') await handlePreviewFrame(message);
    if (message.type === 'start-session') startSession(message);
    if (message.type === 'frame') await handleFrame(message);
    if (message.type === 'manual-repetition') {
      const state = analyzer.addManualRepetition();
      postMessage({ type: 'analysis-frame', sequence: frameSequence, state, landmarks: [], receivedAt: Date.now(), analyzedAt: Date.now() });
    }
    if (message.type === 'finish-session') finishSession(message);
    if (message.type === 'reset-session') resetSession();
  } catch (error) {
    debug('worker-message-failed', {
      messageType: message.type,
      message: error.message || 'Pose worker failed.',
      stack: error.stack || null,
    });
    postMessage({ type: 'error', error: error.message || 'Pose worker failed.', at: Date.now() });
  }
};

debug('worker-booted', { workerLocation: self.location.href, defaultWasmPath: defaultWasmPath() });
postMessage({ type: 'booted', at: Date.now() });
