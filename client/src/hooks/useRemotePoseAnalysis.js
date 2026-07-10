import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const initialState = {
  repetitionCount: 0,
  elapsedSeconds: 0,
  confidence: 0,
  isFullBodyVisible: false,
  warningMessage: 'After QR linking, the PC starts analysis when phone camera frames arrive.',
  postureMessage: 'Waiting for analysis.',
  isArmUseSuspected: false,
  isStandingOrRising: false,
  phase: 'waiting',
};

const MAX_REMOTE_FRAME_AGE_MS = 500;

function recommendationLevelForFallback(testType, state) {
  const primaryValue = Number(state.primaryValue ?? state.repetitionCount ?? 0);
  if (!state.isFullBodyVisible) return 'recheck';
  if (testType === 'standing_posture' || testType === 'balance_hold') {
    if (primaryValue >= 80) return 'steady';
    if (primaryValue >= 60) return 'practice_needed';
    return 'recheck';
  }
  if (primaryValue >= 12) return 'steady';
  if (primaryValue >= 8) return 'practice_needed';
  return 'recheck';
}

function fallbackResultFromState({ selectedTest, state, durationSeconds, startedAt }) {
  const testType = selectedTest || 'chair_stand';
  const primaryValue = Number(state.primaryValue ?? state.repetitionCount ?? 0);
  const primaryLabel = state.primaryLabel
    || (testType === 'standing_posture'
      ? 'Posture Score'
      : testType === 'four_stage_balance'
        ? 'Tandem Hold Seconds'
        : 'Chair Stands');
  const recommendationLevel = recommendationLevelForFallback(testType, state);
  return {
    testType,
    primaryValue,
    primaryLabel,
    repetitionCount: primaryValue,
    durationSeconds,
    confidence: state.confidence || 0,
    trackingQualityScore: state.trackingQualityScore ?? state.confidence ?? 0,
    trackingQualitySummary: state.trackingQualitySummary || null,
    trunkLeanScore: state.trunkLeanScore || 0,
    symmetryScore: state.symmetryScore || 0,
    stabilityScore: state.stabilityScore || 0,
    recommendationLevel,
    summaryMessage: `${primaryLabel} ${primaryValue} measured. The browser completed the timed check.`,
    startedAt: startedAt || Date.now() - durationSeconds * 1000,
    completedAt: Date.now(),
  };
}

function createPoseWorker() {
  return new Worker(new URL('../pose/poseLandmarker.worker.js', import.meta.url), { type: 'module' });
}

function timingFromFrameMessage(message) {
  const receivedAt = Number(message?.receivedAt);
  const analyzedAt = Number(message?.analyzedAt);
  if (!Number.isFinite(receivedAt) || !Number.isFinite(analyzedAt)) return null;
  return {
    source: message.source || message.type,
    sequence: message.sequence ?? null,
    receivedAt,
    analyzedAt,
    latencyMs: Math.max(0, analyzedAt - receivedAt),
  };
}

function isRemoteFrameStale(frame, now = Date.now()) {
  const receivedAt = Number(frame?.receivedAt);
  if (!Number.isFinite(receivedAt)) return false;
  return now - receivedAt > MAX_REMOTE_FRAME_AGE_MS;
}

export function useRemotePoseAnalysis({
  session,
  selectedTest,
  remoteCameraFrame,
  autoStart = true,
  onFinalResult,
  onFrameProcessed,
}) {
  const workerRef = useRef(null);
  const lastSubmittedFrameRef = useRef(0);
  const runningRef = useRef(false);
  const startedAtRef = useRef(0);
  const autoFinishedRef = useRef(false);
  const analysisStateRef = useRef(initialState);
  const finishFallbackTimerRef = useRef(null);
  const recoverableErrorCountRef = useRef(0);
  const [workerStatus, setWorkerStatus] = useState('booting');
  const [analysisState, setAnalysisState] = useState(initialState);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [landmarks, setLandmarks] = useState([]);
  const [rawLandmarks, setRawLandmarks] = useState([]);
  const [analysisLandmarks, setAnalysisLandmarks] = useState([]);
  const [analysisRawLandmarks, setAnalysisRawLandmarks] = useState([]);
  const [frameSize, setFrameSize] = useState(null);
  const [processingStats, setProcessingStats] = useState(null);
  const [trackingQuality, setTrackingQuality] = useState(null);
  const [cameraReadiness, setCameraReadiness] = useState(null);
  const [smoothingStats, setSmoothingStats] = useState(null);
  const [brightnessStats, setBrightnessStats] = useState(null);
  const [brightnessCalibration, setBrightnessCalibration] = useState(null);
  const [frameTiming, setFrameTiming] = useState(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  useEffect(() => {
    const worker = createPoseWorker();
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'booted') setWorkerStatus('booted');
      if (message.type === 'debug') {
        setDebugLog((current) => [...current.slice(-19), message]);
      }
      if (message.type === 'frame-skipped') {
        setDebugLog((current) => [...current.slice(-19), {
          type: 'debug',
          event: 'pose-frame-skipped',
          details: {
            source: message.source || 'unknown',
            reason: message.reason || 'stale',
            ageMs: Math.round(message.ageMs || 0),
            maxFrameAgeMs: message.maxFrameAgeMs,
            receivedAt: message.receivedAt,
            skippedAt: message.at,
          },
          at: message.at || Date.now(),
        }]);
      }
      if (message.type === 'ready') {
        setError('');
        setWorkerStatus('ready');
      }
      if (message.type === 'pose-frame') {
        recoverableErrorCountRef.current = 0;
        setError('');
        setLandmarks(message.landmarks || []);
        setRawLandmarks(message.rawLandmarks || []);
        if (message.frameSize) setFrameSize(message.frameSize);
        const timing = timingFromFrameMessage(message);
        setFrameTiming(timing);
        onFrameProcessed?.({
          ...(timing || {}),
          source: message.source || 'pose-frame',
          sequence: message.sequence ?? null,
          cameraFrameSequence: message.cameraFrameSequence ?? message.sequence ?? null,
          mobileSequence: message.mobileSequence ?? null,
          receivedAt: message.receivedAt,
          analyzedAt: message.analyzedAt,
        });
        setWorkerStatus(runningRef.current ? 'tracking' : 'previewing');
      }
      if (message.type === 'session-started') {
        if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
        finishFallbackTimerRef.current = null;
        runningRef.current = true;
        startedAtRef.current = message.startedAt || Date.now();
        autoFinishedRef.current = false;
        setError('');
        setIsRunning(true);
        setAnalysisResult(null);
        setProcessingStats(null);
        setTrackingQuality(null);
        setCameraReadiness(null);
        setSmoothingStats(null);
        setBrightnessStats(null);
        setFrameTiming(null);
        setAnalysisLandmarks([]);
        setAnalysisRawLandmarks([]);
        if (message.state) {
          analysisStateRef.current = message.state;
          setAnalysisState(message.state);
        }
      }
      if (message.type === 'analysis-frame') {
        recoverableErrorCountRef.current = 0;
        setError('');
        if (message.state) {
          analysisStateRef.current = message.state;
          setAnalysisState(message.state);
        }
        setAnalysisLandmarks(message.landmarks || []);
        setAnalysisRawLandmarks(message.rawLandmarks || []);
        if (message.frameSize) setFrameSize(message.frameSize);
        if (message.processing) setProcessingStats(message.processing);
        setTrackingQuality(message.trackingQuality || null);
        setCameraReadiness(message.cameraReadiness || null);
        setSmoothingStats(message.smoothing || null);
        if ('brightness' in message) setBrightnessStats(message.brightness || null);
        if ('brightnessCalibration' in message) setBrightnessCalibration(message.brightnessCalibration || null);
        setFrameTiming(timingFromFrameMessage(message));
        setWorkerStatus('analyzing');
      }
      if (message.type === 'preview-frame') {
        recoverableErrorCountRef.current = 0;
        setError('');
        setAnalysisLandmarks(message.landmarks || []);
        setAnalysisRawLandmarks(message.rawLandmarks || []);
        if (message.frameSize) setFrameSize(message.frameSize);
        setTrackingQuality(message.trackingQuality || null);
        setCameraReadiness(message.cameraReadiness || null);
        setSmoothingStats(message.smoothing || null);
        if ('brightness' in message) setBrightnessStats(message.brightness || null);
        if ('brightnessCalibration' in message) setBrightnessCalibration(message.brightnessCalibration || null);
        setFrameTiming(timingFromFrameMessage(message));
        setWorkerStatus('previewing');
      }
      if (message.type === 'session-finished') {
        if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
        finishFallbackTimerRef.current = null;
        runningRef.current = false;
        startedAtRef.current = 0;
        setIsRunning(false);
        setAnalysisResult(message.result || null);
        if (message.state) setAnalysisState(message.state);
        setWorkerStatus('finished');
        onFinalResult?.(message.result);
      }
      if (message.type === 'session-reset') {
        if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
        finishFallbackTimerRef.current = null;
        runningRef.current = false;
        startedAtRef.current = 0;
        autoFinishedRef.current = false;
        setIsRunning(false);
        setAnalysisResult(null);
        setProcessingStats(null);
        setTrackingQuality(null);
        setCameraReadiness(null);
        setSmoothingStats(null);
        setBrightnessStats(null);
        setBrightnessCalibration(null);
        setFrameTiming(null);
        setError('');
        analysisStateRef.current = message.state || initialState;
        setAnalysisState(message.state || initialState);
        setLandmarks([]);
        setRawLandmarks([]);
        setAnalysisLandmarks([]);
        setAnalysisRawLandmarks([]);
        setFrameSize(null);
        setDebugLog([]);
        recoverableErrorCountRef.current = 0;
        setWorkerStatus('ready');
      }
      if (message.type === 'error') {
        if (message.recoverable) {
          recoverableErrorCountRef.current += 1;
          setDebugLog((current) => [...current.slice(-19), {
            type: 'debug',
            event: 'recoverable-pose-frame-error',
            details: {
              source: message.source || 'unknown',
              error: message.error || 'Pose frame failed.',
              count: recoverableErrorCountRef.current,
            },
            at: message.at || Date.now(),
          }]);
          if (recoverableErrorCountRef.current < 8) {
            setWorkerStatus(runningRef.current ? 'analyzing' : 'previewing');
            return;
          }
        }
        setError(message.error || 'Pose analysis failed.');
        setWorkerStatus('error');
      }
    };

    worker.postMessage({ type: 'init' });

    return () => {
      if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, [onFinalResult, onFrameProcessed]);

  const startAnalysis = useCallback(() => {
    if (!workerRef.current || !session?.id) return;
    setError('');
    setAnalysisResult(null);
    setProcessingStats(null);
    setTrackingQuality(null);
    setCameraReadiness(null);
    setSmoothingStats(null);
    setBrightnessStats(null);
    setFrameTiming(null);
    analysisStateRef.current = initialState;
    setLandmarks([]);
    setRawLandmarks([]);
    setAnalysisLandmarks([]);
    setAnalysisRawLandmarks([]);
    setFrameSize(null);
    lastSubmittedFrameRef.current = 0;
    autoFinishedRef.current = false;
    recoverableErrorCountRef.current = 0;
    const userId = session.profile?.id || session.id;
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    workerRef.current.postMessage({
      type: 'start-session',
      userId,
      selectedTest,
      startedAt,
    });
  }, [selectedTest, session?.id, session?.profile?.id]);

  const finishAnalysis = useCallback(() => {
    if (!workerRef.current || autoFinishedRef.current) return;
    autoFinishedRef.current = true;
    workerRef.current.postMessage({ type: 'finish-session', completedAt: Date.now() });
    if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
    finishFallbackTimerRef.current = window.setTimeout(() => {
      if (!runningRef.current) return;
      const fallbackResult = fallbackResultFromState({
        selectedTest,
        state: analysisStateRef.current,
        durationSeconds: analysisStateRef.current.durationSeconds || 30,
        startedAt: startedAtRef.current,
      });
      runningRef.current = false;
      startedAtRef.current = 0;
      setIsRunning(false);
      setAnalysisResult(fallbackResult);
      setWorkerStatus('finished');
      onFinalResult?.(fallbackResult);
    }, 1200);
  }, [onFinalResult, selectedTest]);

  const resetAnalysis = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'reset-session' });
  }, []);

  const probeDebug = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'debug-probe' });
  }, []);

  const addManualRepetition = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'manual-repetition' });
  }, []);

  const previewSetupFrame = useCallback((frame) => {
    if (!workerRef.current || !frame) return;
    setError('');
    workerRef.current.postMessage({
      type: 'preview-frame',
      frame,
      receivedAt: Date.now(),
      selectedTest,
    });
  }, [selectedTest]);

  useEffect(() => {
    if (!workerRef.current) return;
    runningRef.current = false;
    startedAtRef.current = 0;
    autoFinishedRef.current = false;
    if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
    finishFallbackTimerRef.current = null;
    setIsRunning(false);
    setAnalysisResult(null);
    setProcessingStats(null);
    setTrackingQuality(null);
    setCameraReadiness(null);
    setSmoothingStats(null);
    setBrightnessStats(null);
    setBrightnessCalibration(null);
    setFrameTiming(null);
    analysisStateRef.current = initialState;
    setAnalysisState(initialState);
    setLandmarks([]);
    setRawLandmarks([]);
    setAnalysisLandmarks([]);
    setAnalysisRawLandmarks([]);
    setFrameSize(null);
    setError('');
    lastSubmittedFrameRef.current = 0;
    workerRef.current.postMessage({ type: 'reset-session' });
  }, [selectedTest]);

  useEffect(() => {
    if (!remoteCameraFrame?.src || !session?.id) return;
    if (isRemoteFrameStale(remoteCameraFrame)) return;
    if (autoStart && !runningRef.current && !analysisResult) {
      startAnalysis();
      return;
    }
    const frameKey = remoteCameraFrame.sequence || remoteCameraFrame.receivedAt || remoteCameraFrame.src;
    if (lastSubmittedFrameRef.current === frameKey) return;
    lastSubmittedFrameRef.current = frameKey;
    if (!runningRef.current) {
      if (analysisResult) return;
      workerRef.current?.postMessage({
        type: 'preview-frame',
        frame: remoteCameraFrame.blob || remoteCameraFrame.src,
        receivedAt: remoteCameraFrame.receivedAt || Date.now(),
        cameraFrameSequence: remoteCameraFrame.sequence,
        mobileSequence: remoteCameraFrame.mobileSequence || null,
        selectedTest,
      });
      return;
    }
    workerRef.current?.postMessage({
      type: 'frame',
      frame: remoteCameraFrame.blob || remoteCameraFrame.src,
      receivedAt: remoteCameraFrame.receivedAt || Date.now(),
      cameraFrameSequence: remoteCameraFrame.sequence,
      mobileSequence: remoteCameraFrame.mobileSequence || null,
      selectedTest,
    });
  }, [
    analysisResult,
    autoStart,
    remoteCameraFrame?.blob,
    remoteCameraFrame?.mobileSequence,
    remoteCameraFrame?.receivedAt,
    remoteCameraFrame?.sequence,
    remoteCameraFrame?.src,
    selectedTest,
    session?.id,
    startAnalysis,
  ]);

  const durationSeconds = analysisState.durationSeconds || analysisResult?.durationSeconds || 30;
  const progress = Math.min(100, Math.round(((analysisState.elapsedSeconds || 0) / durationSeconds) * 100));

  useEffect(() => {
    if (!isRunning || !durationSeconds || autoFinishedRef.current) return undefined;

    const tick = () => {
      const startedAt = startedAtRef.current;
      if (!startedAt || autoFinishedRef.current) return;
      const elapsedSeconds = Math.min(durationSeconds, Math.floor((Date.now() - startedAt) / 1000));
      setAnalysisState((current) => {
        if ((current.elapsedSeconds || 0) === elapsedSeconds) return current;
        const next = { ...current, elapsedSeconds, durationSeconds };
        analysisStateRef.current = next;
        return next;
      });
      if (elapsedSeconds >= durationSeconds) finishAnalysis();
    };

    tick();
    const intervalId = window.setInterval(tick, 500);
    return () => window.clearInterval(intervalId);
  }, [durationSeconds, finishAnalysis, isRunning]);

  return useMemo(() => ({
    workerStatus,
    analysisState,
    analysisResult,
    landmarks,
    rawLandmarks,
    analysisLandmarks,
    analysisRawLandmarks,
    frameSize,
    processingStats,
    trackingQuality,
    cameraReadiness,
    smoothingStats,
    brightnessStats,
    brightnessCalibration,
    frameTiming,
    error,
    debugLog,
    isRunning,
    progress,
    startAnalysis,
    finishAnalysis,
    resetAnalysis,
    probeDebug,
    addManualRepetition,
    previewSetupFrame,
    durationSeconds,
  }), [
    workerStatus,
    analysisState,
    analysisResult,
    landmarks,
    rawLandmarks,
    analysisLandmarks,
    analysisRawLandmarks,
    frameSize,
    processingStats,
    trackingQuality,
    cameraReadiness,
    smoothingStats,
    brightnessStats,
    brightnessCalibration,
    frameTiming,
    error,
    debugLog,
    isRunning,
    progress,
    startAnalysis,
    finishAnalysis,
    resetAnalysis,
    probeDebug,
    addManualRepetition,
    previewSetupFrame,
    durationSeconds,
  ]);
}
