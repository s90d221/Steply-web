import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MediaPipePoseNames } from './poseLandmarks';
import { createMovementAnalyzer } from './movementAnalyzers';
import { PoseLandmarkSeries, normalizePoseLandmarks } from './poseTimeSeries';
import wasmModuleLoaderUrl from '../vendor/mediapipe/wasm/vision_wasm_module_internal.js?url';
import wasmModuleBinaryUrl from '../vendor/mediapipe/wasm/vision_wasm_module_internal.wasm?url';

const DEFAULT_MODEL_PATH = '/models/pose_landmarker_lite.task';
const DEFAULT_WASM_PATH = '/wasm';
const MIN_FRAME_INTERVAL_MS = 95;
const PROCESSING_TELEMETRY_SAMPLE_LIMIT = 60;
const PROCESSING_TELEMETRY_REPORT_INTERVAL = 20;

let landmarker = null;
let selectedTest = 'chair_stand';
let analyzer = createMovementAnalyzer(selectedTest);
let steadiLandmarkSeries = new PoseLandmarkSeries();
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

async function initLandmarker(config = {}) {
  if (initialized && landmarker) return;
  if (initializing) return initializing;

  initializing = (async () => {
    const preferredDelegates = config.delegate
      ? [config.delegate]
      : ['GPU', 'CPU'];
    debug('landmarker-init-start', {
      modelAssetPath: config.modelAssetPath || DEFAULT_MODEL_PATH,
      delegates: preferredDelegates,
    });
    let lastError = null;
    for (const delegate of preferredDelegates) {
      try {
        debug('landmarker-delegate-attempt', { delegate });
        const vision = await resolveVisionFileset(config);
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: config.modelAssetPath || DEFAULT_MODEL_PATH,
            delegate,
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        debug('landmarker-delegate-ready', { delegate, runningMode: 'VIDEO' });
        break;
      } catch (error) {
        lastError = error;
        debug('landmarker-delegate-failed', {
          delegate,
          message: error.message || 'Delegate initialization failed.',
          stack: error.stack || null,
        });
      }
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

async function imageBitmapFromFrame(frame) {
  if (frame instanceof Blob) {
    return createImageBitmap(frame);
  }

  if (frame instanceof ArrayBuffer) {
    return createImageBitmap(new Blob([frame], { type: 'image/jpeg' }));
  }

  if (typeof frame === 'string') {
    const response = await fetch(frame);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  throw new Error('Unsupported camera frame type.');
}

async function detectPoseFromFrame(message) {
  await initLandmarker(message.config || {});
  const bitmap = await imageBitmapFromFrame(message.frame);
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

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    const analyzedAt = Date.now();
    postMessage({
      type: 'preview-frame',
      landmarks: detected.landmarks,
      confidence: detected.confidence,
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
    postMessage({ type: 'error', error: error.message || 'Pose preview failed.', at: Date.now() });
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
    const landmarks = detected.landmarks;
    const confidence = detected.confidence;
    const nextSequence = frameSequence + 1;
    const steadiFrame = steadiLandmarkSeries.push({
      sequence: nextSequence,
      timestampMs,
      receivedAt: message.receivedAt || timestampMs,
      landmarks,
      confidence,
    });
    const poseFrame = {
      timestampMs,
      landmarks: steadiFrame.frame.landmarks,
      confidence,
      metrics: steadiFrame.metrics,
      landmarkSeries: steadiFrame.series,
    };
    const state = analyzer.addFrame(poseFrame);
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
      landmarks: poseFrame.landmarks,
      confidence,
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
    postMessage({ type: 'error', error: error.message || 'Pose analysis failed.', at: Date.now() });
  } finally {
    if (bitmap) bitmap.close?.();
    isAnalyzingFrame = false;
  }
}

function startSession(message) {
  const startedAt = message.startedAt || Date.now();
  selectedTest = message.selectedTest || 'chair_stand';
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
  resetProcessingTelemetry();
  postMessage({ type: 'session-started', startedAt, state: analyzer.getCurrentState(startedAt) });
}

function finishSession(message) {
  if (!session?.active) return;
  const completedAt = message.completedAt || Date.now();
  const result = {
    ...analyzer.finishSession(completedAt),
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
