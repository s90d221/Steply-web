import { MetricCard, SteplyButton, SteplyCard, StatusPill } from './SteplyPrimitives';
import { testLabel } from '../pose/recommendationRules';
import { WeakAreaIds } from '../pose/weakAreaRules';
import { roundMetric, statusFromScore } from '../utils/format';
import { displayWeakAreaLabel, weakAreaSupportMessages } from '../data/serviceModels';

const feedbackByStatus = {
  measurement_only: 'Today’s movement was recorded clearly. We will use it as a baseline.',
  steady: 'Your movement looked steady today. Keep practicing at a comfortable pace.',
  practice_needed: 'Nice work. Today’s movement suggests one simple exercise to practice next.',
  recheck: 'Let’s adjust the camera view and repeat this gently with support nearby.',
};

const weakAreaChipById = {
  [WeakAreaIds.AnkleStrategyProprioception]: 'Ankle balance control',
  [WeakAreaIds.HipAbductorMediolateralControl]: 'Side hip stability',
  [WeakAreaIds.LowerLimbMuscularEndurance]: 'Lower-body endurance',
};

function weakAreaIdsFromResult(result = {}) {
  const rawWeakAreas = result.weakAreas
    || result.weakAreaIds
    || result.weakAreaResult?.weakAreas
    || result.weakAreaResult
    || result.weakArea
    || [];
  const items = Array.isArray(rawWeakAreas) ? rawWeakAreas : [rawWeakAreas];
  return items.map((item) => {
    if (!item) return null;
    if (typeof item === 'string') return item;
    return item.id || item.weakAreaId || null;
  }).filter(Boolean);
}

function recommendedExerciseNames(result = {}) {
  return (result.recommendations || [])
    .map((recommendation) => recommendation.title)
    .filter(Boolean)
    .slice(0, 2);
}

function buildFriendlyResultMessage(result, status) {
  const weakAreaIds = weakAreaIdsFromResult(result);
  const weakAreaMessage = weakAreaIds.map((id) => weakAreaSupportMessages[id]).find(Boolean);
  if (weakAreaMessage) return weakAreaMessage;
  const exerciseNames = recommendedExerciseNames(result);
  if (exerciseNames.length) {
    return `Today’s movement points to ${exerciseNames.join(', ')} as a useful next exercise.`;
  }
  return feedbackByStatus[status] || feedbackByStatus.recheck;
}

function sanitizeObservationText(text) {
  return String(text || '')
    .replace(/fall-risk signal/gi, 'screening signal')
    .replace(/risk interpretation/gi, 'screening interpretation')
    .replace(new RegExp('high\\s+risk', 'gi'), 'needs review');
}

function friendlyPrimaryLabel(label, testType) {
  if (label === 'Chair Stands') return 'Chair Stands';
  if (label === 'Posture Score') return 'Posture Record';
  if (label === 'Hold Time') return 'Hold Time';
  if (!label && testType === 'chair_stand') return 'Chair Stands';
  return label || 'Record';
}

function buildFriendlyObservationChips(result, fallbackFlags) {
  const weakAreaChips = weakAreaIdsFromResult(result)
    .map((id) => weakAreaChipById[id] || displayWeakAreaLabel(id))
    .filter(Boolean);
  const exerciseNames = recommendedExerciseNames(result);
  const exerciseChip = exerciseNames.length ? `Recommended exercise: ${exerciseNames.join(', ')}` : null;
  const metricLabel = friendlyPrimaryLabel(result.primaryLabel, result.testType);
  const metricChip = metricLabel || result.repetitionCount || result.primaryValue
    ? `${metricLabel || 'Record'} ${roundMetric(result.primaryValue ?? result.repetitionCount, 0)}`
    : 'Today’s movement was recorded';
  const sanitizedFlags = (fallbackFlags || []).map(sanitizeObservationText);
  return [...weakAreaChips, exerciseChip, metricChip, ...sanitizedFlags]
    .filter(Boolean)
    .slice(0, 4);
}

function normalizedPercent(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number <= 1 ? number * 100 : number);
}

export function ResultPanel({ finalResult, liveResult, onGoExercises, onDemoFinal }) {
  const source = finalResult || liveResult || {};
  const score = roundMetric(source.score, normalizedPercent(source.confidence, 85));
  const testType = source.testType || source.selectedTest || 'four_stage_balance';
  const primaryLabel = friendlyPrimaryLabel(
    source.features?.primaryLabel || source.primaryLabel || 'Hold Time',
    testType,
  );
  const primaryValue = roundMetric(source.features?.primaryValue ?? source.primaryValue ?? source.count ?? source.repetitionCount, 0);
  const stability = normalizedPercent(source.features?.stability ?? source.stabilityScore, 0);
  const status = source.recommendationLevel || statusFromScore(score);
  const flags = source.flags?.length ? source.flags : [
    'Full-body movement was captured from the phone camera.',
    'This is screening guidance for exercise planning, not a diagnosis.',
  ];
  const friendlyMessage = buildFriendlyResultMessage(source, status);
  const friendlyFlags = buildFriendlyObservationChips(source, flags);

  return (
    <div className="panel-grid panel-grid--result distance-mode distance-mode--result">
      <SteplyCard className="result-hero-card">
        <div className="eyebrow">Weakness Analysis</div>
        <h2>Today’s balance summary</h2>
        <p>{friendlyMessage}</p>
        <StatusPill status={status}>Exercise recommendation ready</StatusPill>
      </SteplyCard>

      <div className="metric-row metric-row--result">
        <MetricCard value={primaryValue} label={primaryLabel} detail={source.testLabel || testLabel(testType)} accent />
        <MetricCard value={`${stability}%`} label="Stability" detail="Body-center control" />
        <MetricCard value={score} label="Camera Confidence" detail="Pose-analysis quality" status={status} />
      </div>

      <SteplyCard className="feedback-result-card">
        <div>
          <div className="eyebrow">Observation Summary</div>
          <h3>What Steply noticed</h3>
        </div>
        <div className="feedback-list">
          {friendlyFlags.map((flag) => <span key={flag}>{flag}</span>)}
        </div>
      </SteplyCard>

      <SteplyCard className="safety-step-badge">
        <div className="safety-step-badge__icon">✓</div>
        <div>
          <div className="eyebrow">Completion Badge</div>
          <h3>Safe Steps Badge</h3>
          <p>Mission complete. The next exercise game will help practice the area that changed today.</p>
        </div>
      </SteplyCard>

      <div className="result-actions">
        <SteplyButton onClick={onGoExercises}>Start My Exercise Game</SteplyButton>
        <SteplyButton variant="secondary" onClick={onDemoFinal}>Save Today’s Result</SteplyButton>
      </div>
    </div>
  );
}
