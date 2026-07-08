import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  connectProfile,
  createSession,
  getAllHistory,
  getNetworkInfo,
  getSessionStatus,
  postFinalAnalysis,
  postRealtimeAnalysis,
  selectTest,
} from '../api/steplyApi';
import { buildRealtimePayload } from '../data/demoAnalysis';
import { buildDemoHistoryItems } from '../data/demoHistory';
import { demoProfile } from '../data/demoProfile';
import { useRemotePoseAnalysis } from './useRemotePoseAnalysis';
import { recommendationLabel, recommendationTemplatesForResult, resultFlagsFor, testLabel } from '../pose/recommendationRules';
import { buildAssessmentResult } from '../pose/assessmentRules';

function normalizeFrameSource(frame, mimeType = 'image/jpeg') {
  if (typeof frame !== 'string') return '';
  const value = frame.trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  return `data:${mimeType || 'image/jpeg'};base64,${value}`;
}

function shouldUseDemoHistoryFixture() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demoHistory') === '1';
}

function initialSelectedTestFromUrl() {
  if (typeof window === 'undefined') return 'four_stage_balance';
  const requestedTest = new URLSearchParams(window.location.search).get('test');
  return ['four_stage_balance', 'chair_stand', 'timed_up_and_go'].includes(requestedTest)
    ? requestedTest
    : 'four_stage_balance';
}

function pairingTokenFromQrPayload(qrPayload) {
  if (!qrPayload) return '';
  try {
    return JSON.parse(qrPayload).pairingToken || '';
  } catch (_) {
    return '';
  }
}

function dashboardWebSocketUrl(bundle) {
  const value = bundle?.dashboardWsPath || bundle?.wsUrl || '';
  if (!value || !value.startsWith('/')) return value;
  if (typeof window === 'undefined') return value;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${value}`;
}

export function useSteplyDashboard() {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [sessionBundle, setSessionBundle] = useState(null);
  const [selectedTest, setSelectedTest] = useState(initialSelectedTestFromUrl);
  const [liveResult, setLiveResult] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historySource, setHistorySource] = useState({
    type: 'external_injection',
    label: 'Waiting for phone-provided history',
    persistent: false,
  });
  const [remoteCameraFrame, setRemoteCameraFrame] = useState(null);
  const [remoteCameraStatus, setRemoteCameraStatus] = useState('Phone camera is not connected yet.');
  const [activeStep, setActiveStep] = useState('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const pendingFrameMetaRef = useRef(null);
  const frameObjectUrlRef = useRef(null);

  const session = sessionBundle?.session || null;

  const refreshHistory = useCallback(async () => {
    // Display-only injection point. In production, these items should be supplied by
    // the Kotlin phone app, which owns persistent personal history storage.
    if (shouldUseDemoHistoryFixture()) {
      setHistoryItems(buildDemoHistoryItems());
      setHistorySource({
        type: 'development_fixture',
        label: 'Synthetic injected browser fixture',
        persistent: false,
      });
      return;
    }

    try {
      // Development adapter only: the current PC history endpoint is not the
      // authoritative store and will be removed in the storage cleanup pass.
      const data = await getAllHistory();
      setHistoryItems((data.items || []).slice().reverse());
      setHistorySource(data.source || {
        type: 'temporary_pc_display_adapter',
        label: 'Temporary PC display feed',
        persistent: false,
      });
    } catch (err) {
      console.warn(err);
    }
  }, []);

  const handlePoseFinalResult = useCallback(async (result) => {
    if (!session?.id || !result) return;

    const resultTestType = result.testType || selectedTest;
    const baseResult = { ...result, testType: resultTestType };
    const assessmentResult = buildAssessmentResult({
      result: baseResult,
      profile: session.profile,
      historyItems,
    });
    const enrichedResult = {
      ...baseResult,
      ...assessmentResult,
      rawAnalysisResult: baseResult,
    };
    const templates = recommendationTemplatesForResult(enrichedResult);
    const primaryValue = result.primaryValue ?? result.repetitionCount ?? 0;
    const primaryLabel = result.primaryLabel || 'Measured Value';
    const payload = {
      ...enrichedResult,
      sessionId: session.id,
      userId: session.profile?.id || session.id,
      testType: resultTestType,
      testLabel: testLabel(resultTestType),
      score: Math.round(((result.trackingQualityScore ?? result.confidence) || 0) * 100),
      count: primaryValue,
      message: assessmentResult.seniorMessage
        || `${recommendationLabel(result.recommendationLevel)}: ${result.summaryMessage || `${primaryLabel} ${primaryValue} measured.`}`,
      features: {
        chairStandCount: resultTestType === 'chair_stand' ? result.repetitionCount : undefined,
        tugTimeSeconds: resultTestType === 'timed_up_and_go' ? result.primaryValue : undefined,
        primaryValue,
        primaryLabel,
        trunkLean: result.trunkLeanScore,
        symmetry: result.symmetryScore,
        stability: result.stabilityScore,
        confidence: result.confidence,
        primaryWeakness: assessmentResult.primaryWeakness,
        fallRiskLevel: assessmentResult.fallRiskLevel,
      },
      flags: resultFlagsFor(enrichedResult, resultTestType),
      recommendations: templates,
    };

    setFinalResult(payload);
    setActiveStep('result');
    try {
      const saved = await postFinalAnalysis(payload);
      setFinalResult(saved.result);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    }
  }, [historyItems, refreshHistory, selectedTest, session?.id, session?.profile]);

  const poseAnalysis = useRemotePoseAnalysis({
    session,
    selectedTest,
    remoteCameraFrame,
    autoStart: false,
    onFinalResult: handlePoseFinalResult,
  });

  useEffect(() => {
    getNetworkInfo().then(setNetworkInfo).catch(console.warn);
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => () => {
    if (socketRef.current) socketRef.current.close();
    if (frameObjectUrlRef.current) URL.revokeObjectURL(frameObjectUrlRef.current);
  }, []);

  const wireSocket = useCallback((bundle) => {
    if (socketRef.current) socketRef.current.close();
    if (frameObjectUrlRef.current) {
      URL.revokeObjectURL(frameObjectUrlRef.current);
      frameObjectUrlRef.current = null;
    }
    pendingFrameMetaRef.current = null;
    const wsUrl = dashboardWebSocketUrl(bundle);
    if (!wsUrl) return;

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          const meta = pendingFrameMetaRef.current || {};
          pendingFrameMetaRef.current = null;
          const blob = event.data instanceof Blob
            ? event.data
            : new Blob([event.data], { type: meta.mimeType || 'image/jpeg' });
          const nextUrl = URL.createObjectURL(blob);
          const previousUrl = frameObjectUrlRef.current;
          frameObjectUrlRef.current = nextUrl;
          if (previousUrl) URL.revokeObjectURL(previousUrl);

          setRemoteCameraFrame({
            src: nextUrl,
            blob,
            receivedAt: meta.receivedAt || Date.now(),
            byteLength: meta.byteLength || blob.size,
            sequence: meta.sequence || Date.now(),
          });
          setRemoteCameraStatus('Receiving live phone camera stream');
          setActiveStep((current) => current === 'exercise' ? current : 'analysis');
          return;
        }

        const message = JSON.parse(event.data);
        if (message.type === 'session') {
          setSessionBundle((prev) => prev ? { ...prev, session: message.session } : prev);
          if (message.session?.selectedTest) setSelectedTest(message.session.selectedTest);
        }
        if (message.type === 'realtime') {
          setLiveResult(message.result);
          setActiveStep((current) => current === 'exercise' ? current : 'analysis');
          if (message.session) setSessionBundle((prev) => prev ? { ...prev, session: message.session } : prev);
        }
        if (message.type === 'final') {
          setFinalResult(message.result);
          setActiveStep('result');
          refreshHistory();
        }
        if (message.type === 'session-cleared') {
          setSessionBundle(null);
          setLiveResult(null);
          setFinalResult(null);
          setHistoryItems([]);
          if (frameObjectUrlRef.current) {
            URL.revokeObjectURL(frameObjectUrlRef.current);
            frameObjectUrlRef.current = null;
          }
          pendingFrameMetaRef.current = null;
          setRemoteCameraFrame(null);
          setRemoteCameraStatus('Phone session ended. PC temporary personal data was cleared.');
          setActiveStep('start');
        }
        if (message.type === 'remote-camera-frame-meta') {
          pendingFrameMetaRef.current = message;
        }
        if (message.type === 'remote-camera-frame') {
          // Backward compatibility for older server builds that still send base64 JSON.
          const frameSrc = normalizeFrameSource(message.frame, message.mimeType);
          if (!frameSrc) return;
          setRemoteCameraFrame({
            src: frameSrc,
            receivedAt: message.receivedAt,
            byteLength: message.byteLength,
            sequence: message.sequence || message.receivedAt,
          });
          setRemoteCameraStatus('Receiving phone camera stream');
          setActiveStep((current) => current === 'exercise' ? current : 'analysis');
        }
        if (message.type === 'remote-camera-status') {
          setRemoteCameraStatus(message.message || 'Phone camera status changed.');
        }
      } catch (err) {
        console.warn(err);
      }
    };
  }, [refreshHistory]);

  const handleCreateSession = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const bundle = await createSession();
      setSessionBundle(bundle);
      setLiveResult(null);
      setFinalResult(null);
      if (frameObjectUrlRef.current) {
        URL.revokeObjectURL(frameObjectUrlRef.current);
        frameObjectUrlRef.current = null;
      }
      pendingFrameMetaRef.current = null;
      setRemoteCameraFrame(null);
      setRemoteCameraStatus('Scan the QR code to show the phone camera here.');
      wireSocket(bundle);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [wireSocket]);


  const handleRefreshSession = useCallback(async () => {
    if (!session?.id) {
      setError('Create a QR session first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await getSessionStatus(session.id);
      setSessionBundle((prev) => prev ? { ...prev, session: data.session } : prev);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [session?.id]);

  const handleConnectDemoProfile = useCallback(async () => {
    if (!session?.id) return;
    setBusy(true);
    setError('');
    try {
      const result = await connectProfile(session.id, demoProfile, pairingTokenFromQrPayload(sessionBundle?.qrPayload));
      setSessionBundle((prev) => ({ ...prev, session: result.session }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [session?.id, sessionBundle?.qrPayload]);

  const handleSelectTest = useCallback(async (testId) => {
    setSelectedTest(testId);
    setLiveResult(null);
    setFinalResult(null);
    setActiveStep(remoteCameraFrame ? 'analysis' : 'start');
    setError('');
    if (!session?.id) return;
    try {
      const result = await selectTest(session.id, testId);
      setSessionBundle((prev) => ({ ...prev, session: result.session }));
    } catch (err) {
      setError(err.message);
    }
  }, [session?.id]);

  const handleDemoRealtime = useCallback(async () => {
    if (!session?.id) {
      setError('Create a session before sending realtime results.');
      return;
    }
    const payload = buildRealtimePayload(session.id, selectedTest);
    setLiveResult(payload);
    setActiveStep('analysis');
    try {
      await postRealtimeAnalysis(payload);
    } catch (err) {
      setError(err.message);
    }
  }, [session?.id, selectedTest]);

  const handleSaveFinal = useCallback(async () => {
    if (!session?.id) {
      setError('Create a session before saving final results.');
      return;
    }
    const base = liveResult || buildRealtimePayload(session.id, selectedTest);
    const payload = {
      ...base,
      endedAt: Date.now(),
      score: base.score || 85,
      message: base.message || 'Movement check complete. Keep practicing gently.',
    };
    setFinalResult(payload);
    setActiveStep('result');
    try {
      const result = await postFinalAnalysis(payload);
      setFinalResult(result.result);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    }
  }, [session?.id, selectedTest, liveResult, refreshHistory]);

  const handleCopyPayload = useCallback(async () => {
    if (!sessionBundle?.qrPayload) return;
    try {
      await navigator.clipboard.writeText(sessionBundle.qrPayload);
    } catch (_) {
      setError('Clipboard is unavailable. Select and copy the QR payload manually.');
    }
  }, [sessionBundle?.qrPayload]);

  const canStart = Boolean(session?.id && selectedTest);

  return useMemo(() => ({
    networkInfo,
    sessionBundle,
    session,
    selectedTest,
    liveResult,
    finalResult,
    historyItems,
    historySource,
    remoteCameraFrame,
    remoteCameraStatus,
    poseAnalysis,
    activeStep,
    busy,
    error,
    canStart,
    setActiveStep,
    handleCreateSession,
    handleConnectDemoProfile,
    handleSelectTest,
    handleDemoRealtime,
    handleSaveFinal,
    handleCopyPayload,
    handleRefreshSession,
  }), [
    networkInfo,
    sessionBundle,
    session,
    selectedTest,
    liveResult,
    finalResult,
    historyItems,
    historySource,
    remoteCameraFrame,
    remoteCameraStatus,
    poseAnalysis,
    activeStep,
    busy,
    error,
    canStart,
    handleCreateSession,
    handleConnectDemoProfile,
    handleSelectTest,
    handleDemoRealtime,
    handleSaveFinal,
    handleCopyPayload,
    handleRefreshSession,
  ]);
}
