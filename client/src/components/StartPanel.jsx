import { useState } from 'react';
import { MetricCard, SafetyNoticeCard, SteplyButton, SteplyCard } from './SteplyPrimitives';

export function StartPanel({
  session,
  onStartAnalysis,
  isMobileConnected = false,
  onViewProgress,
}) {
  const [showHelp, setShowHelp] = useState(false);
  const profileName = session?.profile?.displayName || session?.profile?.name || '';

  return (
    <div className="panel-grid panel-grid--start home-screen">
      <SteplyCard className="home-hero">
        <div className="home-hero__content">
          <div>
            <div className="eyebrow">Home / Today</div>
            <h1>{profileName ? `Good to see you, ${profileName}.` : 'Good to see you today.'}</h1>
            <p>
              Start today’s balance mission when your phone camera and this larger screen are ready.
            </p>
          </div>
          <div className="home-hero__actions">
            <SteplyButton onClick={onStartAnalysis}>
              Start Today’s Balance Mission
            </SteplyButton>
            <div className="home-secondary-actions" aria-label="Secondary actions">
              <SteplyButton variant="secondary" onClick={onViewProgress}>View My Progress</SteplyButton>
              <SteplyButton variant="secondary" onClick={onViewProgress}>Exercise History</SteplyButton>
              <SteplyButton variant="secondary" onClick={() => setShowHelp((current) => !current)}>Help</SteplyButton>
            </div>
          </div>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <div className="living-room-scene">
            <span className="living-room-scene__screen" />
            <span className="living-room-scene__phone" />
            <span className="living-room-scene__person" />
            <span className="living-room-scene__support" />
          </div>
        </div>
      </SteplyCard>

      {showHelp ? (
        <SafetyNoticeCard>
          Place a stable chair or wall within reach. If you feel pain, dizziness, or discomfort, stop and sit down.
        </SafetyNoticeCard>
      ) : null}

      <div className="metric-row home-readiness-row">
        <MetricCard
          value={isMobileConnected ? 'Ready' : 'Set up'}
          label="Phone Camera"
          detail={isMobileConnected ? 'Camera stream is linked' : 'Connect when you reach the setup screen'}
          accent={isMobileConnected}
        />
        <MetricCard value="1.5m" label="Camera Distance" detail="A comfortable full-body view" />
        <MetricCard value="Chair" label="Support Nearby" detail="Use a wall or stable chair if needed" />
      </div>

      <div className="home-pipeline">
        <SteplyCard className="home-pipeline-card">
          <strong>Assessment</strong>
          <span>Follow one calm balance mission.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Weakness Analysis</strong>
          <span>See one supportive movement insight.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Exercise Recommendation</strong>
          <span>Get the next safe exercise.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Gamified Repetition</strong>
          <span>Practice with a simple movement game.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Progress Tracking</strong>
          <span>Watch your last five sessions.</span>
        </SteplyCard>
      </div>
    </div>
  );
}
