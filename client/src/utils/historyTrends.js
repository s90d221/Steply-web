export const HistoryChallengeTypes = {
  FourStageBalance: 'four_stage_balance',
  ChairStand: 'chair_stand',
};

const FIVE_RECENT_SESSIONS = 5;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function historyTimestamp(item) {
  const timestamp = finiteNumber(item?.receivedAt ?? item?.createdAt ?? item?.completedAt ?? item?.endedAt);
  if (timestamp !== null) return timestamp;
  const parsed = Date.parse(item?.date || item?.timestamp || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeHistoryTestType(item) {
  const raw = String(item?.testType || item?.selectedTest || item?.type || '').toLowerCase();
  if (raw === HistoryChallengeTypes.FourStageBalance || raw.includes('four_stage') || raw.includes('balance')) {
    return HistoryChallengeTypes.FourStageBalance;
  }
  if (raw === HistoryChallengeTypes.ChairStand || raw.includes('chair')) {
    return HistoryChallengeTypes.ChairStand;
  }
  return raw || null;
}

function tandemStage(balanceResult) {
  return balanceResult?.stageById?.tandem
    || balanceResult?.stages?.find((stage) => stage?.id === 'tandem')
    || null;
}

function swayMetric(windowMetrics) {
  const mediolateral = finiteNumber(windowMetrics?.sway?.mediolateral?.standardDeviation);
  const anteriorPosterior = finiteNumber(windowMetrics?.sway?.anteriorPosterior?.standardDeviation);
  if (mediolateral === null && anteriorPosterior === null) return null;
  const values = [mediolateral, anteriorPosterior].filter((value) => value !== null);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function extractBalanceMetrics(item) {
  const balanceResult = item?.balanceResult;
  const tandem = tandemStage(balanceResult);
  const holdSeconds = finiteNumber(
    tandem?.holdSeconds
      ?? item?.features?.primaryValue
      ?? item?.primaryValue
      ?? item?.repetitionCount
      ?? item?.count,
  );
  const swayRaw = finiteNumber(item?.features?.swayIndex)
    ?? finiteNumber(item?.swayIndex)
    ?? swayMetric(tandem?.totalHold)
    ?? swayMetric(tandem?.staticHold)
    ?? swayMetric(tandem?.dynamicAdjustment);

  return {
    holdSeconds,
    swayIndex: swayRaw === null ? null : Number((swayRaw * 100).toFixed(2)),
  };
}

export function extractChairStandMetrics(item) {
  return {
    repetitions: finiteNumber(
      item?.chairStandResult?.repetitionCount
        ?? item?.features?.chairStandCount
        ?? item?.features?.primaryValue
        ?? item?.repetitionCount
        ?? item?.primaryValue
        ?? item?.count,
    ),
  };
}

function formatSessionLabel(index) {
  return `#${index + 1}`;
}

function formatDateLabel(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function buildChallengeTrendSeries(historyItems = [], challengeType, limit = FIVE_RECENT_SESSIONS) {
  const recent = (historyItems || [])
    .filter((item) => normalizeHistoryTestType(item) === challengeType)
    .sort((a, b) => historyTimestamp(b) - historyTimestamp(a))
    .slice(0, limit)
    .reverse();

  return recent.map((item, index) => {
    const timestamp = historyTimestamp(item);
    const metrics = challengeType === HistoryChallengeTypes.FourStageBalance
      ? extractBalanceMetrics(item)
      : extractChairStandMetrics(item);
    return {
      ...metrics,
      id: item.id || `${challengeType}-${timestamp}-${index}`,
      sessionLabel: formatSessionLabel(index),
      dateLabel: formatDateLabel(timestamp),
      timestamp,
      raw: item,
    };
  });
}

export function trendDelta(points = [], metricKey, { lowerIsBetter = false } = {}) {
  const values = points.map((point) => finiteNumber(point?.[metricKey])).filter((value) => value !== null);
  if (values.length < 2) return null;
  const rawDelta = values.at(-1) - values[0];
  return lowerIsBetter ? -rawDelta : rawDelta;
}

export function latestMetric(points = [], metricKey) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = finiteNumber(points[index]?.[metricKey]);
    if (value !== null) return value;
  }
  return null;
}
