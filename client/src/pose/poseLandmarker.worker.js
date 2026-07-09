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
const MAX_INPUT_FRAME_AGE_MS = 500;
const BRIGHTNESS_SAMPLE_INTERVAL_MS = 333;
const BRIGHTNESS_CALIBRATION_TARGET = 0.5;
const BRIGHTNESS_CALIBRATION_MIN_SAMPLES = 4;
const BRIGHTNESS_CALIBRATION_SAMPLE_LIMIT = 24;
const BRIGHTNESS_CALIBRATION_MAX_CORRECTION = 0.18;
const BRIGHTNESS_CORRECTION_HARD_LOW = 0.12;
const BRIGHTNESS_CORRECTION_HARD_HIGH = 0.97;
const PREVIEW_QUALITY_INTERVAL_MS = 250;
const ANALYSIS_QUALITY_INTERVAL_MS = 200;
const CHAIR_STAND_MOVEMENT_INTERVAL_MS = MIN_FRAME_INTERVAL_MS;
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
let latestBrightnessSample = null;
let latestBrightnessSampleAt = 0;
let brightnessCalibrationSamples = [];
let brightnessCalibration = null;
let latestPreviewQualityAt = 0;
let latestAnalysisQualityAt = 0;
let latestMovementAnalysisAt = 0;
let latestAnalysisQualityPayload = null;
let brightnessCanvas = null;
let brightnessContext = null;
let pendingPreviewFrame = null;
let pendingAnalysisFrame = null;
let framePumpScheduled = false;

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

function resetBrightnessSampling() {
  latestBrightnessSample = null;
  latestBrightnessSampleAt = 0;
}

function resetPipelineCadence() {
  latestPreviewQualityAt = 0;
  latestAnalysisQualityAt = 0;
  latestMovementAnalysisAt = 0;
}

function resetCachedAnalysisQuality() {
  latestAnalysisQualityPayload = null;
}

function shouldRunPreviewQualityPipeline(now = Date.now()) {
  if (!latestPreviewQualityAt || now - latestPreviewQualityAt >= PREVIEW_QUALITY_INTERVAL_MS) {
    latestPreviewQualityAt = now;
    return true;
  }
  return false;
}

function shouldRunAnalysisQualityPipeline(now = Date.now()) {
  if (frameSequence === 0 || !latestAnalysisQualityAt || now - latestAnalysisQualityAt >= ANALYSIS_QUALITY_INTERVAL_MS) {
    latestAnalysisQualityAt = now;
    return true;
  }
  return false;
}

function movementAnalysisIntervalMs() {
  return selectedTest === 'chair_stand'
    ? CHAIR_STAND_MOVEMENT_INTERVAL_MS
    : ANALYSIS_QUALITY_INTERVAL_MS;
}

function usesFastRawAnalysis() {
  return selectedTest === 'chair_stand';
}

function shouldRunMovementAnalysisPipeline(now = Date.now()) {
  if (frameSequence === 0 || !latestMovementAnalysisAt || now - latestMovementAnalysisAt >= movementAnalysisIntervalMs()) {
    latestMovementAnalysisAt = now;
    return true;
  }
  return false;
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clampValue(value, 0, 1);
}

function lightingLevelForBrightness(brightness) {
  if (!finiteNumber(brightness)) return 'unknown';
  if (brightness < 0.16) return 'too_dark';
  if (brightness < 0.28) return 'dim';
  if (brightness > 0.92) return 'too_bright';
  if (brightness > 0.82) return 'bright';
  return 'ok';
}

function buildBrightnessCalibration(updatedAt = Date.now()) {
  const averageBrightness = average(brightnessCalibrationSamples);
  if (!finiteNumber(averageBrightness)) return null;
  const sampleCount = brightnessCalibrationSamples.length;
  const correctionReady = sampleCount >= BRIGHTNESS_CALIBRATION_MIN_SAMPLES;
  const correction = correctionReady
    ? clampValue(
      BRIGHTNESS_CALIBRATION_TARGET - averageBrightness,
      -BRIGHTNESS_CALIBRATION_MAX_CORRECTION,
      BRIGHTNESS_CALIBRATION_MAX_CORRECTION,
    )
    : 0;

  return {
    sampleCount,
    correctionReady,
    averageBrightness,
    targetBrightness: BRIGHTNESS_CALIBRATION_TARGET,
    correction,
    calibratedAverageBrightness: clamp01(averageBrightness + correction),
    lightingLevel: lightingLevelForBrightness(averageBrightness),
    lightingOk: averageBrightness >= 0.16 && averageBrightness <= 0.92,
    updatedAt,
  };
}

function recordBrightnessCalibrationSample(brightness, sampledAt = Date.now()) {
  if (!finiteNumber(brightness)) return brightnessCalibration;
  brightnessCalibrationSamples.push(brightness);
  while (brightnessCalibrationSamples.length > BRIGHTNESS_CALIBRATION_SAMPLE_LIMIT) {
    brightnessCalibrationSamples.shift();
  }
  brightnessCalibration = buildBrightnessCalibration(sampledAt);
  return brightnessCalibration;
}

function resetBrightnessCalibration() {
  brightnessCalibrationSamples = [];
  brightnessCalibration = null;
}

function brightnessQualityContext(sample, { updateCalibration = false } = {}) {
  const rawBrightness = finiteNumber(sample?.value) ? Number(sample.value) : null;
  const sampledAt = sample?.sampledAt || Date.now();
  const calibration = updateCalibration && sample?.fresh
    ? recordBrightnessCalibrationSample(rawBrightness, sampledAt)
    : brightnessCalibration;
  const canApplyCorrection = (
    finiteNumber(rawBrightness)
    && calibration?.correctionReady
    && rawBrightness >= BRIGHTNESS_CORRECTION_HARD_LOW
    && rawBrightness <= BRIGHTNESS_CORRECTION_HARD_HIGH
  );
  const appliedCorrection = canApplyCorrection ? calibration.correction : 0;
  const correctedBrightness = finiteNumber(rawBrightness)
    ? clamp01(rawBrightness + appliedCorrection)
    : rawBrightness;

  return {
    brightnessForQuality: correctedBrightness,
    brightness: {
      raw: rawBrightness,
      corrected: correctedBrightness,
      correction: appliedCorrection,
      correctionApplied: Boolean(canApplyCorrection && Math.abs(appliedCorrection) > 0.001),
      sampledAt,
      calibrationSampleCount: calibration?.sampleCount || 0,
    },
    brightnessCalibration: calibration,
  };
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
  resetCachedAnalysisQuality();
  resetBrightnessSampling();
  resetBrightnessCalibration();
  resetPipelineCadence();
}

function inputReceivedAt(message, fallback = Date.now()) {
  const receivedAt = Number(message?.receivedAt);
  return Number.isFinite(receivedAt) ? receivedAt : fallback;
}

function frameAgeMs(receivedAt, now = Date.now()) {
  const timestamp = Number(receivedAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, now - timestamp);
}

function isStaleFrameMessage(message, now = Date.now()) {
  return frameAgeMs(inputReceivedAt(message, now), now) > MAX_INPUT_FRAME_AGE_MS;
}

function isStaleDetectedFrame(detected, now = Date.now()) {
  return frameAgeMs(detected?.inputReceivedAt, now) > MAX_INPUT_FRAME_AGE_MS;
}

function postFrameSkipped({ message, detected, source, reason, now = Date.now() }) {
  const receivedAt = detected?.inputReceivedAt ?? inputReceivedAt(message, now);
  postMessage({
    type: 'frame-skipped',
    source,
    reason,
    receivedAt,
    ageMs: frameAgeMs(receivedAt, now),
    maxFrameAgeMs: MAX_INPUT_FRAME_AGE_MS,
    at: now,
  });
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

function shouldBlockMovementFrame(readiness) {
  return (
    !readiness?.fullBodyVisible
    || !readiness?.feetVisible
    || !readiness?.singlePersonDetected
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

function buildCachedAnalysisQualityPayload({ smoothed, detected }) {
  const cached = latestAnalysisQualityPayload || {};
  return {
    ...smoothed,
    cameraReadiness: cached.cameraReadiness || null,
    trackingQuality: cached.trackingQuality || null,
    trackingQualityScore: cached.trackingQualityScore ?? detected.confidence ?? 0,
    brightness: cached.brightness || null,
    brightnessCalibration: cached.brightnessCalibration || brightnessCalibration,
  };
}

function cacheAnalysisQualityPayload(qualityPayload, brightnessContext) {
  latestAnalysisQualityPayload = {
    cameraReadiness: qualityPayload.cameraReadiness,
    trackingQuality: qualityPayload.trackingQuality,
    trackingQualityScore: qualityPayload.trackingQualityScore,
    brightness: brightnessContext?.brightness || null,
    brightnessCalibration: brightnessContext?.brightnessCalibration || null,
    cachedAt: Date.now(),
  };
}

function buildPoseQualityPayload({
  detected,
  timestampMs,
  poseCount,
  brightness,
  brightnessStats = null,
  brightnessCalibration = null,
  smoothed = null,
}) {
  const smoothedPose = smoothed || poseSmoother.smooth(detected.landmarks, { timestampMs });
  const readiness = evaluateCameraReadiness({
    landmarks: smoothedPose.landmarks,
    testType: selectedTest,
    previousSample: latestQualitySample,
    poseCount,
    brightness,
    strictStability: true,
  });
  const trackingQuality = {
    ...readiness.trackingQuality,
    rawBrightness: brightnessStats?.raw ?? null,
    correctedBrightness: brightnessStats?.corrected ?? null,
    brightnessCorrection: brightnessStats?.correction ?? 0,
    brightnessCalibration,
  };
  const cameraReadiness = {
    ...readiness,
    trackingQuality,
    brightness: brightnessStats,
    brightnessCalibration,
  };
  latestQualitySample = readiness.sample;
  return {
    ...smoothedPose,
    cameraReadiness,
    trackingQuality,
    trackingQualityScore: readiness.trackingQualityScore,
  };
}

async function estimateFrameBrightness(bitmap) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const width = 24;
    const height = 24;
    if (!brightnessCanvas) {
      brightnessCanvas = new OffscreenCanvas(width, height);
      brightnessContext = brightnessCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!brightnessContext) return null;
    brightnessContext.drawImage(bitmap, 0, 0, width, height);
    const { data } = brightnessContext.getImageData(0, 0, width, height);
    let luma = 0;
    for (let index = 0; index < data.length; index += 4) {
      luma += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
    }
    return luma / (data.length / 4);
  } catch (_) {
    return null;
  }
}

async function sampledFrameBrightness(bitmap, now = Date.now()) {
  if (
    latestBrightnessSample !== null
    && now - latestBrightnessSampleAt < BRIGHTNESS_SAMPLE_INTERVAL_MS
  ) {
    return {
      value: latestBrightnessSample,
      sampledAt: latestBrightnessSampleAt,
      fresh: false,
    };
  }
  const brightness = await estimateFrameBrightness(bitmap);
  latestBrightnessSample = brightness;
  latestBrightnessSampleAt = now;
  return {
    value: brightness,
    sampledAt: now,
    fresh: true,
  };
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
  const receivedAt = inputReceivedAt(message);
  const bitmap = await imageBitmapFromFrame(message.frame);
  const timestampMs = nextMediaPipeTimestampMs(receivedAt);
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
    inputReceivedAt: receivedAt,
    cameraFrameSequence: message.cameraFrameSequence ?? message.sequence ?? null,
    mobileSequence: message.mobileSequence ?? null,
    landmarks,
    poseCount: result.landmarks?.length || 0,
    confidence,
    inferenceDurationMs: inferenceEndedAt - inferenceStartedAt,
  };
}

function postPoseFrame({ source, detected, bitmap, sequence = null, analyzedAt = Date.now() }) {
  postMessage({
    type: 'pose-frame',
    source,
    sequence,
    cameraFrameSequence: detected.cameraFrameSequence,
    mobileSequence: detected.mobileSequence,
    landmarks: detected.landmarks,
    rawLandmarks: detected.landmarks,
    confidence: detected.confidence,
    frameSize: { width: bitmap.width, height: bitmap.height },
    receivedAt: detected.inputReceivedAt,
    analyzedAt,
  });
}

async function handlePreviewFrame(message) {
  const now = Date.now();
  if (session?.active) return;
  if (isStaleFrameMessage(message, now)) {
    postFrameSkipped({
      message,
      source: 'preview-frame',
      reason: 'stale-before-inference',
      now,
    });
    return;
  }
  if (isAnalyzingFrame) return;
  if (now - latestAnalyzeAt < MIN_FRAME_INTERVAL_MS) return;
  latestAnalyzeAt = now;
  isAnalyzingFrame = true;
  setSelectedTest(message.selectedTest);

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    if (isStaleDetectedFrame(detected)) {
      postFrameSkipped({
        message,
        detected,
        source: 'preview-frame',
        reason: 'stale-after-inference',
      });
      return;
    }
    postPoseFrame({
      source: 'preview-frame',
      detected,
      bitmap,
    });
    if (!shouldRunPreviewQualityPipeline()) return;
    const brightnessSample = await sampledFrameBrightness(bitmap);
    const brightnessContext = brightnessQualityContext(brightnessSample, { updateCalibration: true });
    const qualityPayload = buildPoseQualityPayload({
      detected,
      timestampMs: detected.timestampMs,
      poseCount: detected.poseCount,
      brightness: brightnessContext.brightnessForQuality,
      brightnessStats: brightnessContext.brightness,
      brightnessCalibration: brightnessContext.brightnessCalibration,
    });
    const analyzedAt = Date.now();
    if (isStaleDetectedFrame(detected, analyzedAt)) {
      postFrameSkipped({
        message,
        detected,
        source: 'preview-frame',
        reason: 'stale-before-quality-post',
        now: analyzedAt,
      });
      return;
    }
    postMessage({
      type: 'preview-frame',
      landmarks: qualityPayload.landmarks,
      rawLandmarks: qualityPayload.rawLandmarks,
      confidence: detected.confidence,
      trackingQualityScore: qualityPayload.trackingQualityScore,
      trackingQuality: qualityPayload.trackingQuality,
      cameraReadiness: qualityPayload.cameraReadiness,
      brightness: brightnessContext.brightness,
      brightnessCalibration: brightnessContext.brightnessCalibration,
      smoothing: qualityPayload.smoothing,
      frameSize: { width: bitmap.width, height: bitmap.height },
      receivedAt: detected.inputReceivedAt,
      cameraFrameSequence: detected.cameraFrameSequence,
      mobileSequence: detected.mobileSequence,
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
    scheduleFramePump();
  }
}

async function handleFrame(message) {
  const now = Date.now();
  latestFrameAt = now;
  if (!session?.active) return;
  if (isStaleFrameMessage(message, now)) {
    postFrameSkipped({
      message,
      source: 'analysis-frame',
      reason: 'stale-before-inference',
      now,
    });
    return;
  }
  if (isAnalyzingFrame) return;
  if (now - latestAnalyzeAt < MIN_FRAME_INTERVAL_MS) return;
  latestAnalyzeAt = now;
  isAnalyzingFrame = true;

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    const timestampMs = detected.timestampMs;
    const nextSequence = frameSequence + 1;
    if (isStaleDetectedFrame(detected)) {
      postFrameSkipped({
        message,
        detected,
        source: 'analysis-frame',
        reason: 'stale-after-inference',
      });
      return;
    }
    postPoseFrame({
      source: 'analysis-frame',
      detected,
      bitmap,
      sequence: nextSequence,
    });
    if (!shouldRunMovementAnalysisPipeline()) return;

    if (usesFastRawAnalysis()) {
      const trackingQuality = {
        trackingQualityScore: detected.confidence,
        level: 'raw',
        fastPath: true,
      };
      const poseFrame = {
        timestampMs,
        landmarks: detected.landmarks,
        rawLandmarks: detected.landmarks,
        confidence: detected.confidence,
        metrics: null,
        landmarkSeries: null,
        trackingQuality,
        trackingQualityScore: detected.confidence,
        cameraReadiness: null,
      };
      let state = analyzer.addFrame(poseFrame);
      state = {
        ...state,
        trackingQualityScore: detected.confidence,
        trackingQuality,
        cameraReadiness: null,
      };
      recordSessionQuality({
        trackingQualityScore: detected.confidence,
        trackingQuality,
      }, true);

      frameSequence = nextSequence;
      const analyzedAt = Date.now();
      if (isStaleDetectedFrame(detected, analyzedAt)) {
        postFrameSkipped({
          message,
          detected,
          source: 'analysis-frame',
          reason: 'stale-before-analysis-post',
          now: analyzedAt,
        });
        return;
      }
      const processing = recordProcessingTelemetry({
        analyzedAt,
        inferenceDurationMs: detected.inferenceDurationMs,
      });

      postMessage({
        type: 'analysis-frame',
        sequence: frameSequence,
        state,
        landmarks: detected.landmarks,
        rawLandmarks: detected.landmarks,
        confidence: detected.confidence,
        trackingQualityScore: detected.confidence,
        trackingQuality,
        cameraReadiness: null,
        brightness: null,
        brightnessCalibration: null,
        smoothing: null,
        frameSize: { width: bitmap.width, height: bitmap.height },
        receivedAt: detected.inputReceivedAt,
        cameraFrameSequence: detected.cameraFrameSequence,
        mobileSequence: detected.mobileSequence,
        analyzedAt,
        processing,
      });

      if (session?.active && (state.elapsedSeconds || 0) >= (state.durationSeconds || 30)) {
        debug('session-auto-finish', {
          selectedTest,
          elapsedSeconds: state.elapsedSeconds,
          durationSeconds: state.durationSeconds,
          fastPath: true,
        });
        finishSession({ completedAt: timestampMs });
      }
      return;
    }

    const smoothed = poseSmoother.smooth(detected.landmarks, { timestampMs });
    const shouldRefreshQuality = shouldRunAnalysisQualityPipeline() || !latestAnalysisQualityPayload;
    let qualityPayload = null;
    let brightnessStats = latestAnalysisQualityPayload?.brightness || null;
    let brightnessCalibrationStats = latestAnalysisQualityPayload?.brightnessCalibration || brightnessCalibration;

    if (shouldRefreshQuality) {
      const brightnessSample = await sampledFrameBrightness(bitmap);
      const brightnessContext = brightnessQualityContext(brightnessSample);
      qualityPayload = buildPoseQualityPayload({
        detected,
        timestampMs,
        poseCount: detected.poseCount,
        brightness: brightnessContext.brightnessForQuality,
        brightnessStats: brightnessContext.brightness,
        brightnessCalibration: brightnessContext.brightnessCalibration,
        smoothed,
      });
      cacheAnalysisQualityPayload(qualityPayload, brightnessContext);
      brightnessStats = brightnessContext.brightness;
      brightnessCalibrationStats = brightnessContext.brightnessCalibration;
      recordSessionQuality(qualityPayload.cameraReadiness, !shouldBlockFrame(qualityPayload.cameraReadiness));
    } else {
      qualityPayload = buildCachedAnalysisQualityPayload({ smoothed, detected });
    }

    const blockedFrame = shouldBlockMovementFrame(qualityPayload.cameraReadiness);
    let poseFrame = null;
    let state = null;
    if (blockedFrame) {
      state = stateForCameraIssue(timestampMs, qualityPayload.cameraReadiness);
    } else {
      const steadiFrame = steadiLandmarkSeries.push({
        sequence: nextSequence,
        timestampMs,
        receivedAt: detected.inputReceivedAt,
        landmarks: qualityPayload.landmarks,
        confidence: qualityPayload.trackingQualityScore,
      }, { includeSeriesFrames: false });
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
        brightness: brightnessStats,
        brightnessCalibration: brightnessCalibrationStats,
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
    if (isStaleDetectedFrame(detected, analyzedAt)) {
      postFrameSkipped({
        message,
        detected,
        source: 'analysis-frame',
        reason: 'stale-before-analysis-post',
        now: analyzedAt,
      });
      return;
    }
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
      brightness: brightnessStats,
      brightnessCalibration: brightnessCalibrationStats,
      smoothing: qualityPayload.smoothing,
      frameSize: { width: bitmap.width, height: bitmap.height },
      receivedAt: detected.inputReceivedAt,
      cameraFrameSequence: detected.cameraFrameSequence,
      mobileSequence: detected.mobileSequence,
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
    scheduleFramePump();
  }
}

function hasQueuedFrameMessage() {
  return Boolean(pendingAnalysisFrame || pendingPreviewFrame);
}

function clearQueuedFrameMessages() {
  pendingPreviewFrame = null;
  pendingAnalysisFrame = null;
  framePumpScheduled = false;
}

function dropStaleQueuedFrameMessages() {
  const now = Date.now();
  if (pendingPreviewFrame && isStaleFrameMessage(pendingPreviewFrame, now)) {
    postFrameSkipped({
      message: pendingPreviewFrame,
      source: 'preview-frame',
      reason: 'stale-in-queue',
      now,
    });
    pendingPreviewFrame = null;
  }
  if (pendingAnalysisFrame && isStaleFrameMessage(pendingAnalysisFrame, now)) {
    postFrameSkipped({
      message: pendingAnalysisFrame,
      source: 'analysis-frame',
      reason: 'stale-in-queue',
      now,
    });
    pendingAnalysisFrame = null;
  }
}

function nextQueuedFrameMessage() {
  if (session?.active) {
    const message = pendingAnalysisFrame;
    pendingAnalysisFrame = null;
    pendingPreviewFrame = null;
    return message;
  }
  const message = pendingPreviewFrame;
  pendingPreviewFrame = null;
  return message;
}

async function processQueuedFrameMessage() {
  framePumpScheduled = false;
  if (isAnalyzingFrame) {
    scheduleFramePump();
    return;
  }

  dropStaleQueuedFrameMessages();
  if (!hasQueuedFrameMessage()) return;

  const elapsedSinceAnalysisMs = Date.now() - latestAnalyzeAt;
  if (elapsedSinceAnalysisMs < MIN_FRAME_INTERVAL_MS) {
    scheduleFramePump(MIN_FRAME_INTERVAL_MS - elapsedSinceAnalysisMs);
    return;
  }

  const message = nextQueuedFrameMessage();
  if (!message) return;
  if (message.type === 'frame') {
    await handleFrame(message);
  } else {
    await handlePreviewFrame(message);
  }

  if (hasQueuedFrameMessage()) scheduleFramePump();
}

function scheduleFramePump(delayMs = 0) {
  if (framePumpScheduled || isAnalyzingFrame) return;
  framePumpScheduled = true;
  setTimeout(() => {
    processQueuedFrameMessage().catch((error) => {
      framePumpScheduled = false;
      debug('frame-pump-failed', {
        message: error.message || 'Pose frame pump failed.',
        stack: error.stack || null,
      });
      postMessage({ type: 'error', error: error.message || 'Pose frame pump failed.', recoverable: true, at: Date.now() });
    });
  }, Math.max(0, delayMs));
}

function queueFrameMessage(message) {
  const source = message.type === 'frame' ? 'analysis-frame' : 'preview-frame';
  const now = Date.now();
  if (isStaleFrameMessage(message, now)) {
    postFrameSkipped({
      message,
      source,
      reason: 'stale-before-queue',
      now,
    });
    return;
  }
  if (message.type === 'frame') {
    pendingAnalysisFrame = message;
  } else {
    pendingPreviewFrame = message;
  }
  scheduleFramePump();
}

function startSession(message) {
  const startedAt = message.startedAt || Date.now();
  setSelectedTest(message.selectedTest || 'chair_stand');
  clearQueuedFrameMessages();
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
  resetCachedAnalysisQuality();
  resetBrightnessSampling();
  resetPipelineCadence();
  resetSessionQuality();
  resetProcessingTelemetry();
  postMessage({ type: 'session-started', startedAt, state: analyzer.getCurrentState(startedAt) });
}

function finishSession(message) {
  if (!session?.active) return;
  const completedAt = message.completedAt || Date.now();
  const qualitySummary = sessionTrackingQualitySummary();
  const fastRawAnalysis = usesFastRawAnalysis();
  const invalidSession = !fastRawAnalysis && shouldInvalidateSession(qualitySummary);
  const analyzerResult = invalidSession ? null : analyzer.finishSession(completedAt);
  const resultTrackingQualityScore = qualitySummary.sampleCount
    ? qualitySummary.trackingQualityScore
    : analyzerResult?.confidence ?? 0;
  const result = invalidSession
    ? invalidTrackingResult(completedAt, qualitySummary)
    : {
      ...analyzerResult,
      trackingQualityScore: resultTrackingQualityScore,
      trackingQualitySummary: qualitySummary,
      trackingQualityWarning: !fastRawAnalysis && resultTrackingQualityScore < 0.8
        ? 'Low-confidence movement tracking. Staff should review before using this result.'
        : null,
      testFlags: {
        ...(analyzerResult?.testFlags || {}),
        trackingQualityCaution: !fastRawAnalysis && resultTrackingQualityScore < 0.8,
        fastRawAnalysis,
      },
    };
  session = session ? { ...session, active: false, completedAt } : null;
  postMessage({ type: 'session-finished', completedAt, result, state: analyzer.getCurrentState(completedAt) });
}

function resetSession() {
  clearQueuedFrameMessages();
  analyzer = createMovementAnalyzer(selectedTest);
  analyzer.reset();
  session = null;
  frameSequence = 0;
  latestFrameAt = 0;
  latestAnalyzeAt = 0;
  steadiLandmarkSeries.reset();
  poseSmoother.reset();
  latestQualitySample = null;
  resetCachedAnalysisQuality();
  resetBrightnessSampling();
  resetBrightnessCalibration();
  resetPipelineCadence();
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
    if (message.type === 'preview-frame') queueFrameMessage(message);
    if (message.type === 'start-session') startSession(message);
    if (message.type === 'frame') queueFrameMessage(message);
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
