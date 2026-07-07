import { useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard, SteplyButton, SteplyCard, StatusPill, TimerCircle } from './SteplyPrimitives';
import { PoseOverlay } from './pose/PoseOverlay';
import { READY_HOLD_SECONDS, evaluateSetupReadiness } from '../pose/poseQuality';
import { recommendationLabel } from '../pose/recommendationRules';
import { roundMetric, statusFromScore } from '../utils/format';
import { movementTests } from '../data/movementTests';
import standingPostureGuide from '../assets/movement-guides/standing-posture-check.png';
import chairStandGuide from '../assets/movement-guides/chair-stand-check.png';
import standingReferenceOverlay from '../assets/movement-guides/standing-reference-overlay.png';

// Set to true when local pose-worker instrumentation is needed.
const SHOW_DEBUG_TOOLS = false;

const movementGuideContent = {
  four_stage_balance: {
    image: standingPostureGuide,
    alt: '4-stage balance standing guide from front and side views',
    steps: [
      'Start with your feet side by side, then follow the stance shown on the screen.',
      'Keep a chair or wall within reach for semi-tandem, tandem, and one-leg stances.',
      'If you sway, place your foot down and reset slowly.',
    ],
    tip: 'Steply watches how you settle into the stance and how gently you hold it.',
    setup: {
      title: 'Front-view setup',
      body: 'Place your phone about 1.5m away and make sure your full body is visible.',
      points: [
        'Keep your feet and ankles inside the bottom of the frame.',
        'Stand near a chair or wall if you need support.',
        'Use the large screen for simple step-by-step guidance.',
      ],
    },
  },
  standing_posture: {
    image: standingPostureGuide,
    alt: 'Standing posture alignment guide from front and side views',
    steps: [
      'Stand comfortably with your feet about shoulder-width apart.',
      'Relax your shoulders and look forward.',
      'Hold still gently while the camera checks the view.',
    ],
    tip: 'A full-body view helps the posture guide stay clear.',
    setup: {
      title: 'Front-view setup',
      body: 'Adjust the camera so your head, shoulders, hips, knees, and feet are visible.',
      points: [
        'Keep both feet inside the camera view.',
        'Leave a little space above your head and below your feet.',
        'Stand comfortably until the countdown begins.',
      ],
    },
  },
  chair_stand: {
    image: chairStandGuide,
    alt: 'Chair stand guide showing standing, sitting, and standing again',
    steps: [
      'Before starting, fold your arms comfortably across your chest.',
      'Stand and sit without rushing.',
      'Keep both feet flat and your chest comfortably open.',
    ],
    tip: 'Use the floor through both feet and avoid dropping quickly into the chair.',
    setup: {
      title: 'Side-view setup',
      body: 'Place the camera to the side so sitting and standing are easy to see.',
      points: [
        'Keep the chair, hips, knees, ankles, and feet visible.',
        'Sit comfortably near the front of the chair before starting.',
        'Only one person should be in the camera view.',
      ],
    },
  },
};

function percent(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

function phaseLabel(phase) {
  if (phase === 'standing') return 'Standing';
  if (phase === 'rising') return 'Rising';
  if (phase === 'seated') return 'Seated';
  if (phase === 'walking') return 'Walking';
  if (phase === 'unknown') return 'Searching';
  return 'Waiting';
}

function setupStatusLabel(setupCheck, isRunning, hasFrame) {
  if (isRunning) return 'Mission in progress';
  if (!hasFrame) return 'Waiting for camera';
  if (setupCheck.isReady) return 'Ready';
  return 'Adjust position';
}

function SetupChecklistItem({ label, passed }) {
  return (
    <li className={passed ? 'setup-checklist-item setup-checklist-item--passed' : 'setup-checklist-item'}>
      <span>{passed ? '✓' : '!'}</span>
      {label}
    </li>
  );
}

function setupChecklistItems(testType, checks) {
  if (testType === 'standing_posture' || testType === 'balance_hold' || testType === 'four_stage_balance') {
    return [
      { label: 'One person in view', passed: checks.singlePersonStable },
      { label: 'Facing the camera', passed: checks.correctDirection },
      { label: 'Full body visible', passed: checks.fullBodyVisible },
      { label: 'Feet inside the frame', passed: checks.lowerBodyVisible },
      { label: 'Good camera distance', passed: checks.properDistance },
      { label: 'Clear body tracking', passed: checks.goodVisibility && checks.stablePose },
    ];
  }

  return [
    { label: 'One person in view', passed: checks.singlePersonStable },
    { label: 'Side view ready', passed: checks.correctDirection },
    { label: 'Chair and body visible', passed: checks.fullBodyVisible },
    { label: 'Knees and ankles visible', passed: checks.lowerBodyVisible },
    { label: 'Good camera distance', passed: checks.properDistance },
    { label: 'Movement tracking is clear', passed: checks.goodVisibility && checks.stablePose },
  ];
}

function userFriendlyStatus(state, remoteCameraFrame, frameLoadError) {
  if (frameLoadError) return 'The camera view did not load. Check the phone connection and try again.';
  if (!remoteCameraFrame?.src) return 'Connect your phone camera, then stand where your full body is visible.';
  if (state.warningMessage) return state.warningMessage;
  if (!state.isFullBodyVisible) return 'Take one small step back so your full body is visible.';
  if (state.postureMessage) return state.postureMessage;
  return 'You’re doing well. Keep your eyes forward and move gently.';
}

function localizedSetupText(message) {
  if (!message) return message;
  const text = String(message);
  if (text.includes('Great. Hold still')) return 'Great. Hold still gently for three seconds.';
  if (text.includes('only one person')) return 'Keep only one person in the camera view.';
  if (text.includes('full body')) return 'Step back a little so your full body is visible.';
  if (text.includes('knees and ankles')) return 'Adjust the camera angle so your knees and ankles are visible.';
  if (text.includes('brighter space') || text.includes('camera steady')) return 'Use a brighter space and keep the camera steady.';
  if (text.includes('Stand sideways')) return 'Turn sideways so sitting and standing are easy to see.';
  if (text.includes('Stand where')) return 'Stand where your full body is visible.';
  if (text.includes('camera frame')) return 'Fit your full body inside the camera frame.';
  return text;
}

export function AnalysisPanel({
  remoteCameraFrame,
  remoteCameraStatus,
  selectedTest,
  onSelectTest,
  poseAnalysis,
  missionPreviewActive = false,
  onPreviewMissionStart,
  onPreviewResult,
}) {
  const [frameLoadError, setFrameLoadError] = useState('');
  const [readyHoldSeconds, setReadyHoldSeconds] = useState(0);
  const [qualityWarning, setQualityWarning] = useState('');
  const [setupImageFrame, setSetupImageFrame] = useState(null);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(true);
  const [referenceOverlayOpacity, setReferenceOverlayOpacity] = useState(0.38);
  const previousSetupSampleRef = useRef(null);
  const readyStartedAtRef = useRef(null);
  const autoStartRequestedRef = useRef(false);
  const badQualityStartedAtRef = useRef(null);
  const setupImageInputRef = useRef(null);

  const state = poseAnalysis?.analysisState || {};
  const result = poseAnalysis?.analysisResult || null;
  const isMissionRunning = Boolean(poseAnalysis?.isRunning || missionPreviewActive);

  const displayFrame = setupImageFrame || remoteCameraFrame;
  const isSetupImageMode = Boolean(setupImageFrame?.src);
  const score = displayFrame?.src ? Math.round((state.confidence || 0) * 100) : 0;
  const status = state.warningMessage ? 'practice_needed' : statusFromScore(score || 72);
  const durationSeconds = state.durationSeconds || poseAnalysis?.durationSeconds || result?.durationSeconds || 30;

  const analysisElapsedSeconds = Number.isFinite(Number(state.elapsedSeconds))
    ? Math.floor(Number(state.elapsedSeconds))
    : 0;

  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(0);
  const timerStartedAtRef = useRef(null);

  const selectedTestInfo = movementTests.find((test) => test.id === selectedTest);
  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = selectedTest === 'four_stage_balance'
    ? 'Hold Time'
    : state.primaryLabel
    || selectedTestInfo?.primaryMetric?.label
    || 'Chair Stands';

  useEffect(() => {
    if (!isMissionRunning) {
      timerStartedAtRef.current = null;
      setDisplayElapsedSeconds(Math.min(durationSeconds, analysisElapsedSeconds));
      return undefined;
    }

    if (!timerStartedAtRef.current) {
      timerStartedAtRef.current = performance.now() - analysisElapsedSeconds * 1000;
    }

    const tick = () => {
      const nextElapsedSeconds = Math.floor(
        (performance.now() - timerStartedAtRef.current) / 1000
      );

      setDisplayElapsedSeconds(
        Math.min(durationSeconds, Math.max(0, nextElapsedSeconds))
      );
    };

    tick();

    const intervalId = window.setInterval(tick, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isMissionRunning, durationSeconds, analysisElapsedSeconds]);

  const elapsedSeconds = displayElapsedSeconds;

  const frameKb = remoteCameraFrame?.byteLength
    ? Math.round(remoteCameraFrame.byteLength / 1024)
    : '-';

  const receivedTime = remoteCameraFrame?.receivedAt
    ? new Date(remoteCameraFrame.receivedAt).toLocaleTimeString()
    : '-';

  const resultLevel = result?.recommendationLevel
    ? recommendationLabel(result.recommendationLevel)
    : '-';

  const cameraStatusText = isSetupImageMode
    ? 'Setup image preview'
    : frameLoadError || remoteCameraStatus || 'Waiting for phone camera';
  const friendlyStatus = missionPreviewActive
    ? 'Hold this position gently. You’re doing well. Keep your eyes forward.'
    : userFriendlyStatus(state, displayFrame, frameLoadError);
  const startAnalysis = poseAnalysis?.startAnalysis;
  const setupCheck = useMemo(() => evaluateSetupReadiness({
    landmarks: poseAnalysis?.landmarks || [],
    testType: selectedTest,
    previousSample: previousSetupSampleRef.current,
    strictStability: !isMissionRunning,
  }), [isMissionRunning, poseAnalysis?.landmarks, selectedTest]);
  const displaySetupCheck = missionPreviewActive
    ? {
      ...setupCheck,
      isReady: true,
      readyScore: 1,
      warnings: [],
      mainMessage: 'Hold this position gently. You’re doing well. Keep your eyes forward.',
      checks: Object.fromEntries(Object.keys(setupCheck.checks || {}).map((key) => [key, true])),
    }
    : setupCheck;
  const setupStatus = isSetupImageMode
    ? 'Image check'
    : setupStatusLabel(displaySetupCheck, isMissionRunning, Boolean((displayFrame?.src || missionPreviewActive) && !frameLoadError));
  const setupChecklist = setupChecklistItems(selectedTest, displaySetupCheck.checks);
  const setupCountdown = displaySetupCheck.isReady && !isMissionRunning && !isSetupImageMode
    ? Math.max(1, READY_HOLD_SECONDS - Math.floor(readyHoldSeconds))
    : null;
  const setupMessage = isMissionRunning
    ? (qualityWarning || friendlyStatus)
    : displayFrame?.src && !frameLoadError
      ? isSetupImageMode
        ? 'Setup image checked. Start the real mission with the live camera.'
        : localizedSetupText(displaySetupCheck.mainMessage)
      : friendlyStatus;

  useEffect(() => {
    setFrameLoadError('');
  }, [remoteCameraFrame?.sequence, remoteCameraFrame?.src]);

  useEffect(() => () => {
    if (setupImageFrame?.src) URL.revokeObjectURL(setupImageFrame.src);
  }, [setupImageFrame?.src]);

  useEffect(() => {
    if (setupCheck.sample?.bodyBox) previousSetupSampleRef.current = setupCheck.sample;
  }, [setupCheck.sample]);

  useEffect(() => {
    readyStartedAtRef.current = null;
    autoStartRequestedRef.current = false;
    setReadyHoldSeconds(0);
    setQualityWarning('');
    badQualityStartedAtRef.current = null;
  }, [selectedTest, poseAnalysis?.analysisResult]);

  useEffect(() => {
    if (isMissionRunning || poseAnalysis?.analysisResult || !remoteCameraFrame?.src || isSetupImageMode || frameLoadError) {
      readyStartedAtRef.current = null;
      autoStartRequestedRef.current = false;
      setReadyHoldSeconds(0);
      return undefined;
    }

    if (!displaySetupCheck.isReady) {
      readyStartedAtRef.current = null;
      autoStartRequestedRef.current = false;
      setReadyHoldSeconds(0);
      return undefined;
    }

    if (!readyStartedAtRef.current) readyStartedAtRef.current = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - readyStartedAtRef.current) / 1000;
      setReadyHoldSeconds(Math.min(READY_HOLD_SECONDS, elapsed));
      if (elapsed >= READY_HOLD_SECONDS && !autoStartRequestedRef.current) {
        autoStartRequestedRef.current = true;
        startAnalysis?.();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [
    frameLoadError,
    poseAnalysis?.analysisResult,
    isMissionRunning,
    remoteCameraFrame?.src,
    isSetupImageMode,
    startAnalysis,
    displaySetupCheck.isReady,
  ]);

  const handleSetupImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (setupImageFrame?.src) URL.revokeObjectURL(setupImageFrame.src);
    const src = URL.createObjectURL(file);
    setFrameLoadError('');
    setSetupImageFrame({
      src,
      blob: file,
      receivedAt: Date.now(),
      sequence: `setup-${Date.now()}`,
    });
    poseAnalysis?.previewSetupFrame?.(file);
  };

  const clearSetupImage = () => {
    if (setupImageFrame?.src) URL.revokeObjectURL(setupImageFrame.src);
    setSetupImageFrame(null);
    setQualityWarning('');
  };

  useEffect(() => {
    if (!isMissionRunning) {
      badQualityStartedAtRef.current = null;
      setQualityWarning('');
      return;
    }

    if (displaySetupCheck.isReady) {
      badQualityStartedAtRef.current = null;
      setQualityWarning('');
      return;
    }

    if (!badQualityStartedAtRef.current) {
      badQualityStartedAtRef.current = performance.now();
      return;
    }

    const badQualitySeconds = (performance.now() - badQualityStartedAtRef.current) / 1000;
    if (badQualitySeconds >= 1.2) {
      const mainWarning = localizedSetupText(displaySetupCheck.warnings[0]) || 'Body tracking is a little unclear. Adjust your position and try again.';
      setQualityWarning(
        mainWarning.includes('full body')
          ? 'Body tracking is a little unclear. Adjust your position and try again.'
          : mainWarning
      );
    }
  }, [isMissionRunning, displaySetupCheck.isReady, displaySetupCheck.warnings]);

  const selectedTestTitle = selectedTestInfo?.title || selectedTest?.replaceAll('_', ' ') || 'Remote Camera';
  const selectedTestDuration = selectedTestInfo?.duration || `${durationSeconds} sec`;
  const movementGuide = movementGuideContent[selectedTest] || movementGuideContent.chair_stand;
  const canUseReferenceOverlay = selectedTest === 'standing_posture' || selectedTest === 'four_stage_balance';
  return (
    <div className="analysis-layout analysis-layout--guided distance-mode distance-mode--analysis">
      <SteplyCard className="arena-card arena-card--guided">
        <div className="arena-card__topbar">
          <div>
            <div className="eyebrow">{isMissionRunning ? 'Balance Mission' : 'Camera Setup'}</div>
            <h2>{isMissionRunning ? 'Today’s Balance Mission' : selectedTestTitle}</h2>
          </div>
          <StatusPill status={status}>{isMissionRunning ? 'Mission in progress' : setupStatus}</StatusPill>
        </div>

        <div className="analysis-test-tabs analysis-test-tabs--guided" aria-label="Movement test selection">
          {movementTests.map((test, index) => (
            <button
              key={test.id}
              type="button"
              className={`analysis-test-tab ${selectedTest === test.id ? 'analysis-test-tab--active' : ''}`}
              onClick={() => onSelectTest?.(test.id)}
            >
              <strong>{index + 1}. {test.title}</strong>
              <span>{test.duration}</span>
            </button>
          ))}
        </div>

        <div className="analysis-guided-body">
          <SteplyCard className="movement-guide-card">
            <h3>{isMissionRunning ? 'Follow the stance' : 'Set up your space'}</h3>

            <div className="movement-guide-visual">
              <img
                className="movement-guide-image"
                src={movementGuide.image}
                alt={movementGuide.alt}
              />
            </div>

            <ul className="movement-guide-list">
              {movementGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>

            <div className="movement-guide-tip">
              <strong>Tip</strong>
              <p>{movementGuide.tip}</p>
            </div>

            <div className="movement-setup-guide">
              <strong>{movementGuide.setup.title}</strong>
              <p>{movementGuide.setup.body}</p>
              <ul>
                {movementGuide.setup.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </SteplyCard>

          <div className="analysis-main-zone">
            <div className="arena-stage arena-stage--camera arena-stage--guided">
              {displayFrame?.src ? (
                <div className="remote-camera-layer">
                  <img
                    className="remote-camera-frame"
                    src={displayFrame.src}
                    alt={isSetupImageMode ? 'Uploaded setup preview' : 'Camera stream from the phone'}
                    onLoad={() => setFrameLoadError('')}
                    onError={() => setFrameLoadError('Frame received, but the browser could not decode the image.')}
                  />
                  {canUseReferenceOverlay && showReferenceOverlay ? (
                    <img
                      className="reference-pose-overlay"
                      src={standingReferenceOverlay}
                      alt="Standing posture reference overlay"
                      style={{ opacity: referenceOverlayOpacity }}
                    />
                  ) : null}
                  <PoseOverlay landmarks={poseAnalysis?.landmarks || []} frameSize={poseAnalysis?.frameSize} />
                </div>
              ) : (
                <>
                  <div className="stage-grid" aria-hidden="true" />
                  <div className="coach-figure coach-figure--stage" aria-label="Movement guide figure">
                    <span className="coach-head" />
                    <span className="coach-body" />
                    <span className="coach-arm coach-arm--left" />
                    <span className="coach-arm coach-arm--right" />
                    <span className="coach-leg coach-leg--left" />
                    <span className="coach-leg coach-leg--right" />
                    <span className="chair-seat" />
                    <span className="chair-leg chair-leg--left" />
                    <span className="chair-leg chair-leg--right" />
                  </div>
                  <div className="stage-pulse" />
                </>
              )}

              <div className="guided-camera-focus" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>

              {selectedTest === 'four_stage_balance' ? (
                <div className={isMissionRunning ? 'foot-placement-guide foot-placement-guide--active' : 'foot-placement-guide'} aria-hidden="true">
                  <span className="foot-placement-guide__foot foot-placement-guide__foot--back" />
                  <span className="foot-placement-guide__foot foot-placement-guide__foot--front" />
                  <strong>Tandem stance</strong>
                </div>
              ) : null}

              <div className="guided-camera-message">
                <span className="guided-camera-icon">▶</span>
                <div>
                  <strong>{setupMessage}</strong>
                  <p>
                    {isMissionRunning
                      ? 'Hold this position gently and keep your eyes forward.'
                      : isSetupImageMode
                        ? 'This image is only for checking setup.'
                      : displaySetupCheck.isReady
                        ? 'The mission can begin when you press the ready button.'
                        : movementGuide.setup.body}
                  </p>
                </div>
              </div>

              <div className="remote-camera-badge">
                <span
                  className={
                    displayFrame?.src && !frameLoadError
                      ? 'remote-camera-dot remote-camera-dot--live'
                      : 'remote-camera-dot'
                  }
                />
                {cameraStatusText}
              </div>
            </div>

            <p className="coach-message coach-message--guided">
              {setupMessage}
            </p>

            <SteplyCard className="setup-guide-card">
              <div className="setup-guide-card__header">
                <div>
                  <div className="eyebrow">{isMissionRunning ? 'Mission Guidance' : 'Camera Setup'}</div>
                  <h3>{setupStatus}</h3>
                </div>
                <div className={displaySetupCheck.isReady ? 'setup-countdown setup-countdown--ready' : 'setup-countdown'}>
                  {setupCountdown || Math.round(displaySetupCheck.readyScore * 100)}
                  <span>{setupCountdown ? 'sec' : 'ready'}</span>
                </div>
              </div>

              <ul className="setup-checklist">
                {setupChecklist.map((item) => (
                  <SetupChecklistItem key={item.label} label={item.label} passed={item.passed} />
                ))}
              </ul>

              {displaySetupCheck.warnings[0] && !isMissionRunning ? (
                <p className="setup-warning">{localizedSetupText(displaySetupCheck.warnings[0])}</p>
              ) : null}

              {qualityWarning ? (
                <p className="setup-warning setup-warning--active">{qualityWarning}</p>
              ) : null}

              <div className="setup-image-actions">
                <input
                  ref={setupImageInputRef}
                  type="file"
                  accept="image/*"
                  className="setup-image-input"
                  onChange={handleSetupImageChange}
                />
                <SteplyButton
                  type="button"
                  variant="secondary"
                  onClick={() => setupImageInputRef.current?.click()}
                >
                  Check a setup image
                </SteplyButton>
                <SteplyButton
                  type="button"
                  variant="ghost"
                  onClick={clearSetupImage}
                  disabled={!setupImageFrame}
                >
                  Clear image
                </SteplyButton>
              </div>

              <div className="reference-overlay-controls">
                <label className="reference-overlay-toggle">
                  <input
                    type="checkbox"
                    checked={showReferenceOverlay}
                    disabled={!canUseReferenceOverlay}
                    onChange={(event) => setShowReferenceOverlay(event.target.checked)}
                  />
                  Standing guide overlay
                </label>
                <label className="reference-overlay-opacity">
                  Overlay strength
                  <input
                    type="range"
                    min="0.15"
                    max="0.7"
                    step="0.05"
                    value={referenceOverlayOpacity}
                    disabled={!canUseReferenceOverlay || !showReferenceOverlay}
                    onChange={(event) => setReferenceOverlayOpacity(Number(event.target.value))}
                  />
                </label>
              </div>
            </SteplyCard>

            <div className="analysis-controls analysis-controls--guided">
              <SteplyButton
                onClick={() => {
                  if (!remoteCameraFrame?.src && onPreviewMissionStart) {
                    onPreviewMissionStart();
                    return;
                  }
                  poseAnalysis?.startAnalysis?.();
                }}
                disabled={isSetupImageMode || isMissionRunning || (!remoteCameraFrame?.src && !onPreviewMissionStart) || !displaySetupCheck.isReady}
              >
                {isSetupImageMode ? 'Live camera needed' : displaySetupCheck.isReady ? 'I’m Ready' : 'Adjust camera position'}
              </SteplyButton>

              <SteplyButton
                variant="secondary"
                onClick={() => {
                  if (missionPreviewActive && onPreviewResult) {
                    onPreviewResult();
                    return;
                  }
                  poseAnalysis?.finishAnalysis?.();
                }}
                disabled={!isMissionRunning}
              >
                See Today’s Recommendation
              </SteplyButton>

              <SteplyButton variant="ghost" onClick={poseAnalysis?.resetAnalysis}>
                Reset setup
              </SteplyButton>

              {SHOW_DEBUG_TOOLS ? (
                <>
                  <SteplyButton variant="ghost" onClick={poseAnalysis?.probeDebug}>
                    Debug Probe
                  </SteplyButton>

                  <SteplyButton
                    variant="secondary"
                    onClick={poseAnalysis?.addManualRepetition}
                    disabled={!poseAnalysis?.isRunning}
                  >
                    +1 Rep Adjust
                  </SteplyButton>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </SteplyCard>

      <aside className="analysis-side analysis-side--guided">
        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card">
          <div className="eyebrow">Live Status</div>
          <h3>Large, simple numbers</h3>

          <div className="guided-status-row">
            <span>Time</span>
            <strong>{elapsedSeconds} / {durationSeconds}s</strong>
          </div>

          <div className="guided-status-row">
            <span>{primaryLabel}</span>
            <strong>{roundMetric(primaryValue, 0)}</strong>
          </div>
        </SteplyCard>

        <TimerCircle
          value={elapsedSeconds}
          max={durationSeconds}
          label="sec"
          score={roundMetric(primaryValue, 0)}
        />

        <MetricCard
          value={roundMetric(primaryValue, 0)}
          label={primaryLabel}
          detail={`${elapsedSeconds} / ${durationSeconds}s`}
          accent
        />

        {result ? (
          <SteplyCard className="feedback-stack feedback-stack--result-mini">
            <div className="eyebrow">Final Result</div>
            <h3>{resultLevel}</h3>
            <ul>
              <li>
                {result.primaryLabel || 'Final reps'}:{' '}
                {roundMetric(result.primaryValue ?? result.repetitionCount, 0)}
              </li>
              <li>
                Average pace:{' '}
                {result.averageRepSeconds ? `${result.averageRepSeconds.toFixed(1)} sec/rep` : '-'}
              </li>
              <li>
                {result.armUseDisqualified
                  ? 'Arm support detected: official score is 0'
                  : 'No arm-support disqualification'}
              </li>
            </ul>
          </SteplyCard>
        ) : null}

        {poseAnalysis?.error ? (
          <SteplyCard className="feedback-stack feedback-stack--warning">
            <div className="eyebrow">MediaPipe</div>
            <h3>Analysis Error</h3>
            <p>{poseAnalysis.error}</p>
          </SteplyCard>
        ) : null}

        {SHOW_DEBUG_TOOLS ? (
          <SteplyCard className="feedback-stack feedback-stack--analysis">
            <div className="eyebrow">Developer Details</div>
            <h3>Analysis Details</h3>
            <ul>
              <li>Phase: {phaseLabel(state.phase)}</li>
              <li>Pose confidence: {percent(state.confidence)}</li>
              <li>Worker: {poseAnalysis?.workerStatus || 'booting'}</li>
              <li>Frame size: {frameKb} KB</li>
              <li>Frame #{remoteCameraFrame?.sequence || '-'} · {receivedTime}</li>
              <li>{state.isArmUseSuspected ? 'Arm support suspected: yes' : 'Arm support suspected: no'}</li>
              <li>Trunk center: {percent(state.trunkLeanScore)}</li>
              <li>Left-right symmetry: {percent(state.symmetryScore)}</li>
              <li>Sway stability: {percent(state.stabilityScore)}</li>
            </ul>
          </SteplyCard>
        ) : null}

        {SHOW_DEBUG_TOOLS && poseAnalysis?.debugLog?.length ? (
          <SteplyCard className="feedback-stack feedback-stack--analysis">
            <div className="eyebrow">Debug</div>
            <h3>MediaPipe Loader Trace</h3>
            <ul>
              {poseAnalysis.debugLog.slice(-8).map((entry) => (
                <li key={`${entry.at}-${entry.event}`}>
                  <strong>{entry.event}</strong>: {JSON.stringify(entry.details)}
                </li>
              ))}
            </ul>
          </SteplyCard>
        ) : null}
      </aside>
    </div>
  );
}
