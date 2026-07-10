// Development-only injected history fixture for browser chart verification.
// The permanent history source remains the Kotlin phone app; this array is not storage.
function daysAgo(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function balanceResult(holdSeconds, swayRaw) {
  return {
    schemaVersion: 'balance_result.v1',
    testType: 'four_stage_balance',
    stageById: {
      tandem: {
        id: 'tandem',
        holdSeconds,
        totalHold: {
          sway: {
            mediolateral: { standardDeviation: swayRaw },
            anteriorPosterior: { standardDeviation: swayRaw * 0.85 },
          },
        },
      },
    },
    stages: [],
  };
}

function chairStandResult(repetitionCount) {
  return {
    schemaVersion: 'chair_stand_result.v1',
    testType: 'chair_stand',
    repetitionCount,
  };
}

export function buildDemoHistoryItems() {
  const chairReps = [7, 8, 9, 10, 11, 12];
  const balanceHolds = [5.2, 6.4, 7.8, 8.6, 9.5, 10.3];
  const balanceSway = [0.082, 0.074, 0.068, 0.057, 0.049, 0.041];

  return [
    ...chairReps.map((repetitionCount, index) => ({
      id: `demo-chair-${index}`,
      testType: 'chair_stand',
      selectedTest: 'chair_stand',
      receivedAt: daysAgo((chairReps.length - index) * 2),
      score: 70 + index * 4,
      count: repetitionCount,
      repetitionCount,
      chairStandResult: chairStandResult(repetitionCount),
      message: `${repetitionCount} chair stands recorded from injected demo history.`,
      source: 'development_injected_history_fixture',
    })),
    ...balanceHolds.map((holdSeconds, index) => ({
      id: `demo-balance-${index}`,
      testType: 'four_stage_balance',
      selectedTest: 'four_stage_balance',
      receivedAt: daysAgo((balanceHolds.length - index) * 2 - 1),
      score: 68 + index * 5,
      count: holdSeconds,
      primaryValue: holdSeconds,
      balanceResult: balanceResult(holdSeconds, balanceSway[index]),
      message: `${holdSeconds}s tandem hold recorded from injected demo history.`,
      source: 'development_injected_history_fixture',
    })),
  ].sort((a, b) => b.receivedAt - a.receivedAt);
}
