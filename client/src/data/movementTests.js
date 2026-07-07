export const fourStageBalanceStages = [
  {
    id: 'side_by_side',
    title: 'Side-by-side Stand',
    sequence: 1,
    stance: 'side_by_side',
    durationSeconds: 10,
    passThresholdSeconds: 10,
  },
  {
    id: 'semi_tandem',
    title: 'Semi-tandem Stand',
    sequence: 2,
    stance: 'semi_tandem',
    durationSeconds: 10,
    passThresholdSeconds: 10,
  },
  {
    id: 'tandem',
    title: 'Tandem Stand',
    sequence: 3,
    stance: 'tandem',
    durationSeconds: 10,
    passThresholdSeconds: 10,
  },
  {
    id: 'one_leg',
    title: 'One-leg Stand',
    sequence: 4,
    stance: 'one_leg',
    durationSeconds: 10,
    passThresholdSeconds: 10,
  },
];

export const movementTests = [
  {
    id: 'four_stage_balance',
    protocolId: 'steadi_four_stage_balance',
    axis: 'balance',
    title: '4-Stage Balance',
    subtitle: 'Side-by-side to one-leg static balance sequence',
    duration: '4 x 10 sec',
    level: 'Balance',
    primaryMetric: {
      id: 'hold_time_seconds',
      label: 'Hold Time',
      unit: 'sec',
    },
    completion: {
      mode: 'stage_sequence',
      stopOnFailedStage: true,
    },
    stages: fourStageBalanceStages,
  },
  {
    id: 'chair_stand',
    protocolId: 'steadi_30_second_chair_stand',
    axis: 'chair_stand',
    title: '30 sec Chair Stand',
    subtitle: 'Repeated sit-to-stand count in 30 seconds',
    duration: '30 sec',
    durationSeconds: 30,
    level: 'Strength',
    primaryMetric: {
      id: 'repetition_count',
      label: 'Chair Stands',
      unit: 'reps',
    },
    completion: {
      mode: 'timed_repetitions',
      durationSeconds: 30,
    },
  },
];
