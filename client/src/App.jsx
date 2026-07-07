import { useEffect, useMemo, useRef, useState } from 'react';
import { useSteplyDashboard } from './hooks/useSteplyDashboard';
import { SessionRail } from './components/SessionRail';
import { StartPanel } from './components/StartPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ResultPanel } from './components/ResultPanel';
import { ExercisePanel } from './components/ExercisePanel';
import { JourneyFlow } from './components/JourneyFlow';
import { ProgressPanel } from './components/ProgressPanel';
import { ContextNav } from './components/ContextNav';
import { CareDashboard } from './components/CareDashboard';
import { ReportsPanel } from './components/ReportsPanel';
import { buildDemoFinalResult, centerParticipants } from './data/serviceModels';
import { buildDemoHistoryItems } from './data/demoHistory';
import './styles/app.css';

function emergencyExerciseResult(dashboard) {
  const state = dashboard.poseAnalysis?.analysisState || {};
  const testType = dashboard.selectedTest || 'four_stage_balance';
  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = state.primaryLabel || (testType === 'four_stage_balance' ? 'Hold Time' : 'Chair Stands');
  const recommendationLevel = state.isFullBodyVisible ? 'practice_needed' : 'recheck';

  return {
    testType,
    primaryValue,
    primaryLabel,
    repetitionCount: primaryValue,
    durationSeconds: state.durationSeconds || dashboard.poseAnalysis?.durationSeconds || 30,
    confidence: state.confidence || 0,
    trunkLeanScore: state.trunkLeanScore || 0,
    symmetryScore: state.symmetryScore || 0,
    stabilityScore: state.stabilityScore || 0,
    recommendationLevel,
    summaryMessage: `${primaryLabel} ${primaryValue} measured.`,
    completedAt: Date.now(),
  };
}

function screenConfigFromUrl() {
  if (typeof window === 'undefined') {
    return {
      screen: '',
      demoMode: false,
      context: 'home',
      activeStep: 'start',
      reportMode: 'family',
      participantId: null,
      missionPreview: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen') || '';
  const demoMode = params.get('demoUi') === '1' || Boolean(screen);

  const config = {
    screen,
    demoMode,
    context: 'home',
    activeStep: 'start',
    reportMode: 'family',
    participantId: null,
    missionPreview: false,
  };

  if (screen === 'setup') {
    config.activeStep = 'analysis';
  } else if (screen === 'mission') {
    config.activeStep = 'analysis';
    config.missionPreview = true;
  } else if (screen === 'result') {
    config.activeStep = 'result';
  } else if (screen === 'exercise') {
    config.activeStep = 'exercise';
  } else if (screen === 'progress') {
    config.activeStep = 'progress';
  } else if (screen === 'care') {
    config.context = 'care';
  } else if (screen === 'participant') {
    config.context = 'care';
    config.participantId = centerParticipants[0]?.id || null;
  } else if (screen === 'family') {
    config.context = 'reports';
    config.reportMode = 'family';
  } else if (screen === 'professional') {
    config.context = 'reports';
    config.reportMode = 'professional';
  }

  return config;
}

function shouldShowExercisePanel(dashboard) {
  const state = dashboard.poseAnalysis?.analysisState || {};
  const durationSeconds = state.durationSeconds || dashboard.poseAnalysis?.durationSeconds || 30;
  const timedOut = durationSeconds > 0 && (state.elapsedSeconds || 0) >= durationSeconds;

  return dashboard.activeStep === 'exercise'
    || dashboard.poseAnalysis?.workerStatus === 'finished'
    || Boolean(dashboard.poseAnalysis?.analysisResult)
    || timedOut;
}

function shouldShowAnalysisPanel(dashboard, hasStartedTest) {
  return hasStartedTest && dashboard.activeStep === 'analysis';
}

function usePreviewPoseAnalysis(basePoseAnalysis, missionPreviewActive) {
  const [previewElapsed, setPreviewElapsed] = useState(12);

  useEffect(() => {
    if (!missionPreviewActive) {
      setPreviewElapsed(12);
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setPreviewElapsed((current) => (current >= 27 ? 12 : current + 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [missionPreviewActive]);

  return useMemo(() => {
    if (!missionPreviewActive) return basePoseAnalysis;

    return {
      ...basePoseAnalysis,
      isRunning: true,
      workerStatus: 'analyzing',
      durationSeconds: 30,
      analysisState: {
        ...(basePoseAnalysis?.analysisState || {}),
        durationSeconds: 30,
        elapsedSeconds: previewElapsed,
        primaryLabel: 'Hold Time',
        primaryValue: Math.min(10, previewElapsed),
        confidence: 0.92,
        isFullBodyVisible: true,
        warningMessage: '',
        postureMessage: 'Hold this position gently.',
        stabilityScore: 0.78,
        phase: 'standing',
      },
    };
  }, [basePoseAnalysis, missionPreviewActive, previewElapsed]);
}

export default function App() {
  const dashboard = useSteplyDashboard();
  const initialConfigRef = useRef(screenConfigFromUrl());
  const initialConfig = initialConfigRef.current;
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [hasStartedTest, setHasStartedTest] = useState(
    initialConfig.activeStep === 'analysis' || initialConfig.missionPreview,
  );
  const [activeContext, setActiveContext] = useState(initialConfig.context);
  const [reportMode, setReportMode] = useState(initialConfig.reportMode);
  const [participantId, setParticipantId] = useState(initialConfig.participantId);
  const [missionPreviewActive, setMissionPreviewActive] = useState(initialConfig.missionPreview);
  const previousSessionIdRef = useRef(dashboard.session?.id);

  const displayPoseAnalysis = usePreviewPoseAnalysis(dashboard.poseAnalysis, missionPreviewActive);
  const isMobileConnected = Boolean(dashboard.session?.profile || dashboard.remoteCameraFrame?.src);
  const demoHistoryItems = useMemo(() => buildDemoHistoryItems(), []);
  const displayHistoryItems = initialConfig.demoMode && dashboard.historyItems.length === 0
    ? demoHistoryItems
    : dashboard.historyItems;
  const displayHistorySource = initialConfig.demoMode && dashboard.historyItems.length === 0
    ? { type: 'visual_review_fixture', label: 'UI-ready visual review data', persistent: false }
    : dashboard.historySource;
  const demoFinalResult = useMemo(
    () => buildDemoFinalResult(dashboard.selectedTest || 'four_stage_balance'),
    [dashboard.selectedTest],
  );
  const displayFinalResult = dashboard.finalResult || dashboard.poseAnalysis?.analysisResult || (
    initialConfig.demoMode ? demoFinalResult : null
  );

  useEffect(() => {
    dashboard.setActiveStep(initialConfig.activeStep);
    // Initial URL-driven visual states are applied once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dashboard.activeStep, activeContext, reportMode, participantId]);

  useEffect(() => {
    if (isMobileConnected) setIsQrModalOpen(false);
  }, [isMobileConnected]);

  useEffect(() => {
    if (previousSessionIdRef.current === dashboard.session?.id) return;
    previousSessionIdRef.current = dashboard.session?.id;
    setHasStartedTest(false);
    setMissionPreviewActive(false);
  }, [dashboard.session?.id]);

  const handleStartTest = () => {
    setActiveContext('home');
    setHasStartedTest(true);
    setMissionPreviewActive(false);
    dashboard.handleSelectTest('four_stage_balance');
    dashboard.setActiveStep('analysis');
  };

  const handleNavigate = (view) => {
    if (view === 'home') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(false);
      dashboard.setActiveStep('start');
      return;
    }
    if (view === 'mission') {
      handleStartTest();
      return;
    }
    if (view === 'exercise') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(true);
      dashboard.setActiveStep('exercise');
      return;
    }
    if (view === 'progress') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(false);
      dashboard.setActiveStep('progress');
      return;
    }
    if (view === 'care') {
      setActiveContext('care');
      setParticipantId(null);
      return;
    }
    if (view === 'reports') {
      setActiveContext('reports');
      setReportMode('family');
    }
  };

  const handleContextChange = (context) => {
    setActiveContext(context);
    if (context === 'home') {
      dashboard.setActiveStep('start');
      setParticipantId(null);
      setMissionPreviewActive(false);
      setHasStartedTest(false);
    }
    if (context === 'care') {
      setParticipantId(null);
    }
    if (context === 'reports') {
      setReportMode('family');
    }
  };

  const activeView = activeContext === 'care'
    ? 'care'
    : activeContext === 'reports'
      ? 'reports'
      : dashboard.activeStep === 'analysis'
        ? 'mission'
        : dashboard.activeStep === 'exercise'
          ? 'exercise'
          : dashboard.activeStep === 'progress'
            ? 'progress'
            : 'home';

  const renderHomePanel = () => {
    const panelDashboard = {
      ...dashboard,
      poseAnalysis: displayPoseAnalysis,
    };

    if (dashboard.activeStep === 'progress') {
      return (
        <ProgressPanel
          historyItems={displayHistoryItems}
          historySource={displayHistorySource}
        />
      );
    }

    if (dashboard.activeStep === 'result') {
      return (
        <ResultPanel
          finalResult={displayFinalResult}
          liveResult={dashboard.liveResult}
          onGoExercises={() => dashboard.setActiveStep('exercise')}
          onDemoFinal={dashboard.handleSaveFinal}
        />
      );
    }

    if (shouldShowExercisePanel(panelDashboard)) {
      return (
        <ExercisePanel
          finalResult={displayFinalResult || emergencyExerciseResult(panelDashboard)}
          remoteCameraFrame={dashboard.remoteCameraFrame}
          poseAnalysis={displayPoseAnalysis}
          onRestart={handleStartTest}
          onViewProgress={() => dashboard.setActiveStep('progress')}
        />
      );
    }

    if (shouldShowAnalysisPanel(panelDashboard, hasStartedTest)) {
      return (
        <AnalysisPanel
          selectedTest={dashboard.selectedTest}
          remoteCameraFrame={dashboard.remoteCameraFrame}
          remoteCameraStatus={dashboard.remoteCameraStatus}
          onSelectTest={dashboard.handleSelectTest}
          poseAnalysis={displayPoseAnalysis}
          missionPreviewActive={missionPreviewActive}
          onPreviewMissionStart={initialConfig.demoMode ? () => setMissionPreviewActive(true) : null}
          onPreviewResult={initialConfig.demoMode ? () => {
            setMissionPreviewActive(false);
            dashboard.setActiveStep('result');
          } : null}
        />
      );
    }

    return (
      <StartPanel
        session={dashboard.session}
        isMobileConnected={isMobileConnected}
        historyItems={displayHistoryItems}
        historySource={displayHistorySource}
        onStartAnalysis={handleStartTest}
        onViewProgress={() => dashboard.setActiveStep('progress')}
      />
    );
  };

  const renderActiveContext = () => {
    if (activeContext === 'care') {
      return <CareDashboard initialParticipantId={participantId} />;
    }
    if (activeContext === 'reports') {
      return <ReportsPanel initialMode={reportMode} />;
    }
    return renderHomePanel();
  };

  return (
    <div className="steply-shell steply-shell--main service-shell">
      <main className="dashboard-main service-main">
        <header className="top-bar service-top-bar">
          <div>
            <div className="eyebrow">Steply</div>
            <h1>Balance support that fits the setting.</h1>
            <p>
              A guided home mission, a center screening dashboard, and weekly movement reports share one clear flow.
            </p>
          </div>
          <div className="top-bar__status" aria-label="service status">
            <span className={isMobileConnected ? 'status-dot' : 'status-dot status-dot--waiting'} />
            {isMobileConnected ? 'Phone camera linked' : 'Ready for phone camera'}
          </div>
        </header>

        <ContextNav
          activeContext={activeContext}
          activeView={activeView}
          onContextChange={handleContextChange}
          onNavigate={handleNavigate}
          onOpenCameraLink={() => setIsQrModalOpen(true)}
          isMobileConnected={isMobileConnected}
        />

        <JourneyFlow activeStep={dashboard.activeStep} />

        <div className="screen-stage" key={`${activeContext}-${dashboard.activeStep}-${reportMode}-${participantId || 'dashboard'}`}>
          {renderActiveContext()}
        </div>
      </main>

      {isQrModalOpen ? (
        <div className="qr-link-modal" role="dialog" aria-modal="true" aria-labelledby="qr-link-modal-title">
          <button
            type="button"
            className="qr-link-modal__backdrop"
            aria-label="Close phone camera link"
            onClick={() => setIsQrModalOpen(false)}
          />
          <div className="qr-link-modal__panel">
            <div className="qr-link-modal__header">
              <div>
                <div className="eyebrow">Phone Camera</div>
                <h2 id="qr-link-modal-title">Connect the phone camera</h2>
                <p>Scan the QR code with the mobile app to link the profile and stream the camera to this screen.</p>
              </div>
            </div>

            <SessionRail
              className="session-rail--modal"
              compact
              sessionBundle={dashboard.sessionBundle}
              networkInfo={dashboard.networkInfo}
              onCreateSession={dashboard.handleCreateSession}
              onCopyPayload={dashboard.handleCopyPayload}
              onRefreshSession={dashboard.handleRefreshSession}
              busy={dashboard.busy}
              error={dashboard.error || dashboard.poseAnalysis?.error}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
