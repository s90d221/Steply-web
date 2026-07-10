import {
  ageYearsFromProfile,
  chairStandBelowAverageThreshold,
  normalizeSteadiGender,
} from './steadiRules';

export const ASSESSMENT_PIPELINE_SCHEMA_VERSION = 'steply_assessment_pipeline.v1';

export const AssessmentTypes = {
  FourStageBalance: 'FOUR_STAGE_BALANCE',
  ChairStand30Sec: 'CHAIR_STAND_30_SEC',
  TimedUpAndGo: 'TIMED_UP_AND_GO',
};

export const AssessmentTestTypes = {
  [AssessmentTypes.FourStageBalance]: 'four_stage_balance',
  [AssessmentTypes.ChairStand30Sec]: 'chair_stand',
  [AssessmentTypes.TimedUpAndGo]: 'timed_up_and_go',
};

export const FallRiskLevels = {
  Low: 'LOW',
  Moderate: 'MODERATE',
  NeedsReview: 'NEEDS_REVIEW',
};

export const OlderAdultFallRiskLabels = {
  [FallRiskLevels.Low]: 'Steady Today',
  [FallRiskLevels.Moderate]: 'Practice Recommended',
  [FallRiskLevels.NeedsReview]: 'Extra Support Recommended',
  UNSCORED: 'Camera Check Needed',
};

export const StaffFallRiskLabels = {
  [FallRiskLevels.Low]: 'LOW',
  [FallRiskLevels.Moderate]: 'MODERATE',
  [FallRiskLevels.NeedsReview]: 'NEEDS REVIEW',
  UNSCORED: 'NEEDS CAMERA CHECK',
};

export const WeaknessIds = {
  BalanceControl: 'balanceControl',
  AnkleStrategyProprioception: 'ankleStrategyProprioception',
  HipAbductorMediolateralControl: 'hipAbductorMediolateralControl',
  LowerBodyEndurance: 'lowerBodyEndurance',
  QuadricepsStrength: 'quadricepsStrength',
  HipExtensorGluteStrength: 'hipExtensorGluteStrength',
  EccentricControl: 'eccentricControl',
  DynamicMobility: 'dynamicMobility',
  GaitStability: 'gaitStability',
  TurningControl: 'turningControl',
  AsymmetryNeedsReview: 'asymmetryNeedsReview',
};

export const WeaknessScoreKeys = [
  WeaknessIds.AnkleStrategyProprioception,
  WeaknessIds.HipAbductorMediolateralControl,
  WeaknessIds.LowerBodyEndurance,
  WeaknessIds.QuadricepsStrength,
  WeaknessIds.HipExtensorGluteStrength,
  WeaknessIds.EccentricControl,
  WeaknessIds.DynamicMobility,
  WeaknessIds.GaitStability,
  WeaknessIds.TurningControl,
  WeaknessIds.AsymmetryNeedsReview,
  WeaknessIds.BalanceControl,
];

export const WeaknessLabels = {
  [WeaknessIds.BalanceControl]: 'balance control',
  [WeaknessIds.AnkleStrategyProprioception]: 'ankle balance control',
  [WeaknessIds.HipAbductorMediolateralControl]: 'side hip stability',
  [WeaknessIds.LowerBodyEndurance]: 'lower-body endurance',
  [WeaknessIds.QuadricepsStrength]: 'front leg strength',
  [WeaknessIds.HipExtensorGluteStrength]: 'hip and glute strength',
  [WeaknessIds.EccentricControl]: 'controlled sitting',
  [WeaknessIds.DynamicMobility]: 'dynamic mobility',
  [WeaknessIds.GaitStability]: 'steady walking',
  [WeaknessIds.TurningControl]: 'turning control',
  [WeaknessIds.AsymmetryNeedsReview]: 'left-right movement balance',
  generalMaintenance: 'general maintenance',
};

export const AssessmentRuleConfig = {
  clinicalThresholds: {
    tandemHoldSeconds: 10,
    tugSeconds: 12,
  },
  poseQuality: {
    minConfidenceForClinicalResult: 0.45,
    minTrackingQualityForClinicalResult: 0.6,
    trackingQualityReviewThreshold: 0.8,
  },
  trend: {
    recentSessionLimit: 5,
    chairStandDeclineRatio: 0.15,
    tugTimeIncreaseRatio: 0.15,
    tandemHoldDeclineRatio: 0.15,
    tandemHoldDeclineSeconds: 1,
    weeklyAdherenceMinimum: 0.5,
  },
  weaknessThresholds: {
    balanceEarlySway: 0.045,
    balanceMediolateralSway: 0.04,
    balanceAnteriorPosteriorSway: 0.04,
    ankleAngleRangeDegrees: 12,
    kneeExtensionLowVelocityDegPerSec: 45,
    hipExtensionLowVelocityDegPerSec: 40,
    trunkForwardLeanMeanDegrees: 12,
    trunkForwardLeanPeakDegrees: 18,
    uncontrolledSitDurationSeconds: 0.9,
    uncontrolledHipDescentVelocity: 0.32,
    asymmetryIndex: 0.25,
    fatigueDropOffRatio: 0.2,
    sitToStandTransitionSeconds: 2.5,
    lowGaitSpeedMetersPerSec: 0.8,
    shortStepLengthMeters: 0.45,
    highShufflingScore: 0.55,
    slowTurnSeconds: 3,
    highTurnStepCount: 4,
    highArmSwingAsymmetry: 0.35,
  },
};

export const AssessmentExerciseLibrary = {
  heel_raises: {
    id: 'heel_raises',
    name: 'Heel Raises',
    title: 'Heel Raises',
    targetWeakness: WeaknessIds.AnkleStrategyProprioception,
    category: 'balance',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 10,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Butterfly Balance',
    arInputKey: 'balance_retraining',
    seniorInstruction: 'Hold a stable chair and rise gently onto your toes, then lower slowly.',
    safetyInstruction: 'Keep both hands close to support and stop if you feel unsteady.',
    contraindicationNote: 'Skip this exercise if calf or ankle pain appears.',
    progressionRule: 'Add a second set only after the movement feels steady for two sessions.',
  },
  toe_raises: {
    id: 'toe_raises',
    name: 'Toe Raises',
    title: 'Toe Raises',
    targetWeakness: WeaknessIds.AnkleStrategyProprioception,
    category: 'balance',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 10,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Hold the Garden Path',
    arInputKey: 'balance_retraining',
    seniorInstruction: 'Hold support and lift the front of both feet slightly, then lower with control.',
    safetyInstruction: 'Keep your heels on the floor and use support the whole time.',
    contraindicationNote: 'Stop if shin, ankle, or foot pain appears.',
    progressionRule: 'Slow the lowering phase before adding more repetitions.',
  },
  supported_tandem_stand: {
    id: 'supported_tandem_stand',
    name: 'Supported Tandem Stand',
    title: 'Supported Tandem Stand',
    targetWeakness: WeaknessIds.AnkleStrategyProprioception,
    category: 'balance',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 0,
    defaultSets: 1,
    defaultHoldSec: 10,
    arGameName: 'Balance Bridge',
    arInputKey: 'tandem_stance',
    seniorInstruction: 'Stand with one foot in front of the other while keeping support within reach.',
    safetyInstruction: 'Use a chair, counter, or rail and step out before you feel uncomfortable.',
    contraindicationNote: 'Use a wider stance if tandem stance feels too difficult today.',
    progressionRule: 'Increase hold time by two seconds after two steady sessions.',
  },
  weight_shift_drill: {
    id: 'weight_shift_drill',
    name: 'Supported Weight Shift',
    title: 'Supported Weight Shift',
    targetWeakness: WeaknessIds.BalanceControl,
    category: 'balance',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 8,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Butterfly Balance',
    arInputKey: 'balance_retraining',
    seniorInstruction: 'Hold support and slowly shift weight left and right without lifting the feet.',
    safetyInstruction: 'Keep a chair, counter, or rail under your hands and move only a small distance.',
    contraindicationNote: 'Use seated practice if shifting weight feels unsafe today.',
    progressionRule: 'Reduce hand pressure only after the shift feels steady for two sessions.',
  },
  tai_chi_weight_transfer: {
    id: 'tai_chi_weight_transfer',
    name: 'Tai Chi-Style Weight Transfer',
    title: 'Tai Chi-Style Weight Transfer',
    targetWeakness: WeaknessIds.BalanceControl,
    category: 'balance',
    difficulty: 'standard',
    requiresChairSupport: true,
    defaultReps: 6,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Balance Bridge',
    arInputKey: 'balance_retraining',
    seniorInstruction: 'Shift weight slowly from one foot to the other with support nearby.',
    safetyInstruction: 'Keep the movement small and stop before you feel unsteady.',
    contraindicationNote: 'Use supported weight shift instead if balance felt poor today.',
    progressionRule: 'Add arm motion only after the feet and trunk stay controlled.',
  },
  heel_toe_walking: {
    id: 'heel_toe_walking',
    name: 'Heel-Toe Walking',
    title: 'Heel-Toe Walking',
    targetWeakness: WeaknessIds.BalanceControl,
    category: 'gait',
    difficulty: 'standard',
    requiresChairSupport: true,
    defaultReps: 8,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Balance Bridge',
    arInputKey: 'tandem_walk',
    seniorInstruction: 'Walk slowly heel-to-toe along a clear path with support nearby.',
    safetyInstruction: 'Use a hallway rail or helper when needed.',
    contraindicationNote: 'Choose supported standing practice instead if walking feels unsteady today.',
    progressionRule: 'Add steps only when the full path feels steady.',
  },
  side_hip_strengthening: {
    id: 'side_hip_strengthening',
    name: 'Side Hip Strengthening',
    title: 'Side Hip Strengthening',
    targetWeakness: WeaknessIds.HipAbductorMediolateralControl,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 10,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Side Leg Target Reach',
    arInputKey: 'side_leg_raise',
    seniorInstruction: 'Hold support and lift one leg gently out to the side, then lower with control.',
    safetyInstruction: 'Keep your trunk tall and keep support within reach.',
    contraindicationNote: 'Stop if hip or back pain appears.',
    progressionRule: 'Add small ankle weight only with professional guidance.',
  },
  sideways_walking: {
    id: 'sideways_walking',
    name: 'Sideways Walking',
    title: 'Sideways Walking',
    targetWeakness: WeaknessIds.HipAbductorMediolateralControl,
    category: 'gait',
    difficulty: 'standard',
    requiresChairSupport: true,
    defaultReps: 8,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Side Leg Target Reach',
    arInputKey: 'side_leg_raise',
    seniorInstruction: 'Take small sideways steps along a counter or rail.',
    safetyInstruction: 'Keep your feet from crossing and keep one hand near support.',
    contraindicationNote: 'Use side hip strengthening instead if walking sideways feels unsteady.',
    progressionRule: 'Increase path length only after two steady sessions.',
  },
  supported_one_leg_stand: {
    id: 'supported_one_leg_stand',
    name: 'Supported One-Leg Stand',
    title: 'Supported One-Leg Stand',
    targetWeakness: WeaknessIds.HipAbductorMediolateralControl,
    category: 'balance',
    difficulty: 'standard',
    requiresChairSupport: true,
    defaultReps: 0,
    defaultSets: 1,
    defaultHoldSec: 8,
    arGameName: 'Butterfly Balance',
    arInputKey: 'one_leg_stance',
    seniorInstruction: 'Hold a chair and lift one foot slightly for a short steady hold.',
    safetyInstruction: 'Keep both hands close to support and lower the foot early if needed.',
    contraindicationNote: 'Use tandem standing instead if one-leg standing feels too challenging.',
    progressionRule: 'Increase hold time before reducing hand support.',
  },
  sit_to_stand_practice: {
    id: 'sit_to_stand_practice',
    name: 'Sit-to-Stand Practice',
    title: 'Sit-to-Stand Practice',
    targetWeakness: WeaknessIds.LowerBodyEndurance,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 5,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Chair Rise Climb',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Stand from a stable chair and sit back down at a calm pace.',
    safetyInstruction: 'Place the chair against a wall and use support if needed.',
    contraindicationNote: 'Stop if knee, hip, chest pain, or dizziness appears.',
    progressionRule: 'Add one repetition when the set feels smooth for two sessions.',
  },
  elevated_sit_to_stand: {
    id: 'elevated_sit_to_stand',
    name: 'Elevated Sit-to-Stand',
    title: 'Elevated Sit-to-Stand',
    targetWeakness: WeaknessIds.LowerBodyEndurance,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 5,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Chair Rise Climb',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Use a slightly higher firm chair and stand up with even pressure through both feet.',
    safetyInstruction: 'Keep the chair against a wall and keep support within reach.',
    contraindicationNote: 'Avoid low chairs if standing required arm support today.',
    progressionRule: 'Lower the chair height only when 2 sets of 10 are smooth and steady.',
  },
  partial_sit_to_stand: {
    id: 'partial_sit_to_stand',
    name: 'Partial Sit-to-Stand with Support',
    title: 'Partial Sit-to-Stand',
    targetWeakness: WeaknessIds.LowerBodyEndurance,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 5,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Chair Rise Climb',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Start from a higher chair and rise only partway, then sit back down with control.',
    safetyInstruction: 'Keep support close and use a small range that feels steady.',
    contraindicationNote: 'Use caregiver or professional supervision if a full stand was not reached today.',
    progressionRule: 'Increase range before adding repetitions.',
  },
  knee_alignment_sit_to_stand: {
    id: 'knee_alignment_sit_to_stand',
    name: 'Knee-Over-Toe Sit-to-Stand',
    title: 'Knee-Over-Toe Sit-to-Stand',
    targetWeakness: WeaknessIds.HipAbductorMediolateralControl,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 5,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Chair Rise Climb',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Stand and sit slowly while keeping both knees pointing over the toes.',
    safetyInstruction: 'Use a stable chair and make the range smaller if the knees drift inward.',
    contraindicationNote: 'Stop if knee or hip pain appears.',
    progressionRule: 'Add repetitions only after knee alignment stays steady.',
  },
  knee_extension: {
    id: 'knee_extension',
    name: 'Front Knee Strengthening / Knee Extension',
    title: 'Knee Extension',
    targetWeakness: WeaknessIds.QuadricepsStrength,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 10,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Knee Extension Star Reach',
    arInputKey: 'knee_extension',
    seniorInstruction: 'Sit tall, slowly straighten one knee, pause, then lower your foot.',
    safetyInstruction: 'Keep the thigh supported and stop if knee pain appears.',
    contraindicationNote: 'Use a smaller range if the knee feels uncomfortable.',
    progressionRule: 'Add a longer pause before adding resistance.',
  },
  mini_knee_bends: {
    id: 'mini_knee_bends',
    name: 'Mini Knee Bends with Support',
    title: 'Mini Knee Bends',
    targetWeakness: WeaknessIds.HipExtensorGluteStrength,
    category: 'strength',
    difficulty: 'standard',
    requiresChairSupport: true,
    defaultReps: 8,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Chair Rise Climb',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Hold support, bend the knees slightly, then stand tall again.',
    safetyInstruction: 'Keep the bend small and keep your knees over your toes.',
    contraindicationNote: 'Skip if knee pain increases.',
    progressionRule: 'Increase depth only with steady control.',
  },
  sit_to_stand_ladder: {
    id: 'sit_to_stand_ladder',
    name: 'Sit-to-Stand Ladder',
    title: 'Sit-to-Stand Ladder',
    targetWeakness: WeaknessIds.LowerBodyEndurance,
    category: 'strength',
    difficulty: 'standard',
    requiresChairSupport: true,
    defaultReps: 5,
    defaultSets: 2,
    defaultHoldSec: 0,
    arGameName: 'Power Steps',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Do a short set, rest, then repeat only if the first set felt steady.',
    safetyInstruction: 'Rest between sets and keep the chair stable.',
    contraindicationNote: 'Use one assisted set if standing felt effortful today.',
    progressionRule: 'Add a second set only after one set is comfortable.',
  },
  slow_sit_to_stand: {
    id: 'slow_sit_to_stand',
    name: 'Slow Sit-to-Stand with Controlled Sitting',
    title: 'Slow Sit-to-Stand',
    targetWeakness: WeaknessIds.EccentricControl,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 5,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Quiet Landing',
    arInputKey: 'sit_to_stand',
    seniorInstruction: 'Stand up, pause, then sit down slowly and quietly.',
    safetyInstruction: 'Keep the chair against a wall and use support when needed.',
    contraindicationNote: 'Stop if lowering into the chair feels uncomfortable.',
    progressionRule: 'Lengthen the sitting phase before adding repetitions.',
  },
  supported_walking: {
    id: 'supported_walking',
    name: 'Supported Walking Practice',
    title: 'Supported Walking Practice',
    targetWeakness: WeaknessIds.DynamicMobility,
    category: 'mobility',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 4,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Safe Path Walk',
    arInputKey: 'tandem_walk',
    seniorInstruction: 'Walk a short clear path with a rail, wall, or helper nearby.',
    safetyInstruction: 'Keep the path clear and turn slowly.',
    contraindicationNote: 'Choose seated or supported strength practice if walking feels unsteady today.',
    progressionRule: 'Increase path length before increasing speed.',
  },
  figure_8_walking: {
    id: 'figure_8_walking',
    name: 'Figure-8 Walking',
    title: 'Figure-8 Walking',
    targetWeakness: WeaknessIds.TurningControl,
    category: 'mobility',
    difficulty: 'standard',
    requiresChairSupport: false,
    defaultReps: 4,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Garden Loop Walk',
    arInputKey: 'tandem_walk',
    seniorInstruction: 'Walk slowly around two clear markers in a gentle figure-8 path.',
    safetyInstruction: 'Use supervision if turning felt slow or uneven today.',
    contraindicationNote: 'Use slow supported turns if the path does not feel clear.',
    progressionRule: 'Add turns only when each loop feels steady.',
  },
  gentle_walking_plan: {
    id: 'gentle_walking_plan',
    name: 'Gentle Walking Plan',
    title: 'Gentle Walking Plan',
    targetWeakness: WeaknessIds.GaitStability,
    category: 'gait',
    difficulty: 'easy',
    requiresChairSupport: false,
    defaultReps: 5,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: 'Step on the Path',
    arInputKey: 'tandem_walk',
    seniorInstruction: 'Walk a short clear path at a comfortable pace.',
    safetyInstruction: 'Keep support nearby and avoid rushing.',
    contraindicationNote: 'Use supported walking if steps felt short or uneven today.',
    progressionRule: 'Add time before adding speed.',
  },
  balanced_bilateral_practice: {
    id: 'balanced_bilateral_practice',
    name: 'Balanced Bilateral Practice',
    title: 'Balanced Bilateral Practice',
    targetWeakness: WeaknessIds.AsymmetryNeedsReview,
    category: 'strength',
    difficulty: 'easy',
    requiresChairSupport: true,
    defaultReps: 6,
    defaultSets: 1,
    defaultHoldSec: 0,
    arGameName: null,
    arInputKey: null,
    seniorInstruction: 'Practice a gentle movement evenly on both sides.',
    safetyInstruction: 'Move slowly and repeat the check next session.',
    contraindicationNote: 'Consider professional consultation if one-sided patterns repeat.',
    progressionRule: 'Keep intensity low until the pattern is reviewed.',
  },
};

const WeaknessExerciseMap = {
  [WeaknessIds.AnkleStrategyProprioception]: [
    'heel_raises',
    'toe_raises',
    'weight_shift_drill',
    'supported_tandem_stand',
    'heel_toe_walking',
  ],
  [WeaknessIds.HipAbductorMediolateralControl]: [
    'side_hip_strengthening',
    'knee_alignment_sit_to_stand',
    'supported_one_leg_stand',
    'sideways_walking',
  ],
  [WeaknessIds.BalanceControl]: [
    'supported_tandem_stand',
    'weight_shift_drill',
    'tai_chi_weight_transfer',
    'supported_one_leg_stand',
    'heel_toe_walking',
  ],
  [WeaknessIds.LowerBodyEndurance]: [
    'sit_to_stand_practice',
    'elevated_sit_to_stand',
    'partial_sit_to_stand',
    'knee_extension',
    'sit_to_stand_ladder',
  ],
  [WeaknessIds.QuadricepsStrength]: [
    'knee_extension',
    'sit_to_stand_practice',
  ],
  [WeaknessIds.HipExtensorGluteStrength]: [
    'sit_to_stand_practice',
    'mini_knee_bends',
  ],
  [WeaknessIds.EccentricControl]: [
    'slow_sit_to_stand',
  ],
  [WeaknessIds.DynamicMobility]: [
    'supported_walking',
    'figure_8_walking',
    'heel_toe_walking',
  ],
  [WeaknessIds.GaitStability]: [
    'heel_toe_walking',
    'sideways_walking',
    'gentle_walking_plan',
  ],
  [WeaknessIds.TurningControl]: [
    'figure_8_walking',
    'supported_walking',
  ],
  [WeaknessIds.AsymmetryNeedsReview]: [
    'balanced_bilateral_practice',
  ],
  generalMaintenance: [
    'supported_tandem_stand',
    'knee_extension',
  ],
};

const WeaknessReasonText = {
  [WeaknessIds.BalanceControl]: 'Tandem stance ended before the 10-second review point or a step-out was observed.',
  [WeaknessIds.AnkleStrategyProprioception]: 'The first few seconds showed extra sway or foot adjustment.',
  [WeaknessIds.HipAbductorMediolateralControl]: 'Side-to-side sway was higher during the balance stance.',
  [WeaknessIds.LowerBodyEndurance]: 'Chair-stand count was below the age and sex comparison point.',
  [WeaknessIds.QuadricepsStrength]: 'Chair-stand count and knee-extension speed suggest front leg strength practice.',
  [WeaknessIds.HipExtensorGluteStrength]: 'Standing up used more forward trunk lean than expected.',
  [WeaknessIds.EccentricControl]: 'Sitting back down looked quick or less controlled.',
  [WeaknessIds.DynamicMobility]: 'Timed Up and Go took 12 seconds or longer.',
  [WeaknessIds.GaitStability]: 'Step pattern suggested shorter or less steady walking.',
  [WeaknessIds.TurningControl]: 'Turning took longer or used more steps than expected.',
  [WeaknessIds.AsymmetryNeedsReview]: 'Left-right movement looked uneven and should be checked again.',
  generalMaintenance: 'Today looks like a maintenance day.',
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 1) {
  const number = finiteNumber(value);
  if (number === null) return min;
  return Math.max(min, Math.min(max, number));
}

function roundOrNull(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function average(values) {
  const finite = values.map(finiteNumber).filter((value) => value !== null);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function emptyWeaknessScores() {
  return Object.fromEntries(WeaknessScoreKeys.map((key) => [key, 0]));
}

function mergeScore(scores, key, value) {
  scores[key] = Math.max(scores[key] || 0, clamp(value));
}

function scoreAbove(value, threshold, floor = 0.3, ceiling = 0.85) {
  const number = finiteNumber(value);
  const cutoff = finiteNumber(threshold);
  if (number === null || cutoff === null || cutoff <= 0 || number < cutoff) return 0;
  return clamp(floor + ((number - cutoff) / cutoff) * (ceiling - floor), floor, ceiling);
}

function scoreBelow(value, threshold, floor = 0.35, ceiling = 0.9) {
  const number = finiteNumber(value);
  const cutoff = finiteNumber(threshold);
  if (number === null || cutoff === null || cutoff <= 0 || number >= cutoff) return 0;
  return clamp(floor + ((cutoff - number) / cutoff) * (ceiling - floor), floor, ceiling);
}

function normalizeTestType(testType) {
  const value = String(testType || '').toLowerCase();
  if (value === 'four_stage_balance' || value === 'balance_hold') return 'four_stage_balance';
  if (value === 'chair_stand' || value === '30_second_chair_stand') return 'chair_stand';
  if (value === 'timed_up_and_go' || value === 'tug') return 'timed_up_and_go';
  return value || 'chair_stand';
}

export function assessmentTypeFromTestType(testType) {
  const normalized = normalizeTestType(testType);
  if (normalized === 'four_stage_balance') return AssessmentTypes.FourStageBalance;
  if (normalized === 'timed_up_and_go') return AssessmentTypes.TimedUpAndGo;
  return AssessmentTypes.ChairStand30Sec;
}

function stageById(balanceResult, stageId) {
  return balanceResult?.stageById?.[stageId]
    || balanceResult?.stages?.find((stage) => stage?.id === stageId)
    || null;
}

function stageHold(balanceResult, stageId) {
  return finiteNumber(stageById(balanceResult, stageId)?.holdSeconds);
}

function windowSway(windowMetrics, axis) {
  const metric = axis === 'ml'
    ? windowMetrics?.sway?.mediolateral
    : windowMetrics?.sway?.anteriorPosterior;
  return firstFinite(metric?.standardDeviation, metric?.range, metric?.meanAbsoluteVelocity);
}

function stageWindow(stage, preferred = 'totalHold') {
  return stage?.[preferred] || stage?.totalHold || stage?.staticHold || stage?.dynamicAdjustment || {};
}

function anyBalanceStage(balanceResult, predicate) {
  const stages = balanceResult?.stages || Object.values(balanceResult?.stageById || {});
  return stages.some((stage) => predicate(stage));
}

function failedCriterion(assessment, criterion, observed, threshold, extra = {}) {
  return {
    assessment,
    criterion,
    observed,
    threshold,
    ...extra,
  };
}

function metricMeta(estimated = [], unavailable = []) {
  return {
    estimatedMetrics: [...new Set(estimated.filter(Boolean))],
    unavailableMetrics: [...new Set(unavailable.filter(Boolean))],
  };
}

function cameraCheckResult({
  assessmentType,
  rawMetrics,
  rawMetricsMeta,
  confidenceScore,
  trackingQualityScore = confidenceScore,
  invalidReason = null,
}) {
  const message = "Let's check the camera setup again before reading today's movement result.";
  return finalizeAssessmentResult({
    assessmentType,
    rawMetrics,
    rawMetricsMeta,
    testFlags: {
      cameraSetupNeeded: true,
      poseConfidenceTooLow: true,
      trackingQualityTooLow: trackingQualityScore < AssessmentRuleConfig.poseQuality.minTrackingQualityForClinicalResult,
      invalidReason,
      confidenceScore,
      trackingQualityScore,
      clinicalResultAvailable: false,
    },
    weaknessScores: emptyWeaknessScores(),
    failedCriteria: [],
    clinicalResultAvailable: false,
    seniorMessage: message,
    staffMessage: `Pose confidence was ${roundOrNull(confidenceScore, 2) ?? '-'} and tracking quality was ${roundOrNull(trackingQualityScore, 2) ?? '-'}; repeat with clearer camera setup before screening classification.`,
    professionalNotes: 'Camera or tracking quality was below the configured screening threshold. No clinical cutoff was applied.',
  });
}

function trackingQualityFrom(result = {}, nested = {}) {
  return firstFinite(
    result.trackingQualityScore,
    result.trackingQuality?.trackingQualityScore,
    result.trackingQualitySummary?.trackingQualityScore,
    nested.trackingQualityScore,
    nested.trackingQuality?.trackingQualityScore,
    nested.trackingQualitySummary?.trackingQualityScore,
  );
}

function needsCameraCheck(result = {}, { confidenceScore, trackingQualityScore, config = AssessmentRuleConfig } = {}) {
  return Boolean(
    result.invalid
      || result.testFlags?.cameraSetupNeeded
      || confidenceScore < config.poseQuality.minConfidenceForClinicalResult
      || trackingQualityScore < config.poseQuality.minTrackingQualityForClinicalResult
  );
}

function buildBalanceAssessment(result = {}, { config = AssessmentRuleConfig } = {}) {
  const balanceResult = result.balanceResult || result.rawMetrics?.balanceResult || result;
  const tandem = stageById(balanceResult, 'tandem');
  const sideBySide = stageById(balanceResult, 'side_by_side');
  const semiTandem = stageById(balanceResult, 'semi_tandem');
  const oneLeg = stageById(balanceResult, 'one_leg');
  const tandemTotal = stageWindow(tandem, 'totalHold');
  const tandemDynamic = stageWindow(tandem, 'dynamicAdjustment');
  const mlSway = windowSway(tandemTotal, 'ml');
  const apSway = windowSway(tandemTotal, 'ap');
  const earlySwayFirst4Sec = average([
    windowSway(tandemDynamic, 'ml'),
    windowSway(tandemDynamic, 'ap'),
  ]);
  const ankleAngleVariance = firstFinite(
    tandemTotal?.ankleAngleChange?.average?.rangeDegrees,
    tandemDynamic?.ankleAngleChange?.average?.rangeDegrees,
  );
  const footRepositionCount = (balanceResult?.stages || [])
    .filter((stage) => stageWindow(stage, 'totalHold')?.footMovement?.exitObserved).length;
  const stepOutDetected = anyBalanceStage(
    balanceResult,
    (stage) => Boolean(stageWindow(stage, 'totalHold')?.footMovement?.exitObserved),
  );
  const handSupportDetected = anyBalanceStage(
    balanceResult,
    (stage) => Boolean(stageWindow(stage, 'totalHold')?.handSupport?.possible),
  );
  const pelvisDropOrLateralShift = firstFinite(mlSway) !== null
    ? mlSway >= config.weaknessThresholds.balanceMediolateralSway * 1.15
    : null;
  const confidenceScore = firstFinite(balanceResult?.confidence, result.confidence, 0);
  const trackingQualityScore = trackingQualityFrom(result, balanceResult) ?? confidenceScore;
  const tandemCutoff = config.clinicalThresholds.tandemHoldSeconds;
  const sideBySideHold = finiteNumber(sideBySide?.holdSeconds);
  const semiTandemHold = finiteNumber(semiTandem?.holdSeconds);
  const tandemHoldRaw = finiteNumber(tandem?.holdSeconds ?? result.primaryValue);
  const oneLegHold = finiteNumber(oneLeg?.holdSeconds);
  const sideBySideUnder10 = sideBySideHold !== null && sideBySideHold < tandemCutoff;
  const semiTandemUnder10 = semiTandemHold !== null && semiTandemHold < tandemCutoff;
  const earlyStageUnder10 = sideBySideUnder10 || semiTandemUnder10;
  const oneLegUnder10 = oneLegHold !== null && oneLegHold < tandemCutoff;

  const rawMetrics = {
    sideBySideHoldSec: roundOrNull(sideBySideHold),
    semiTandemHoldSec: roundOrNull(semiTandemHold),
    tandemHoldSec: roundOrNull(tandemHoldRaw),
    singleLegHoldSec: roundOrNull(oneLegHold),
    trunkSwayAP: roundOrNull(apSway, 4),
    trunkSwayML: roundOrNull(mlSway, 4),
    earlySwayFirst4Sec: roundOrNull(earlySwayFirst4Sec, 4),
    ankleAngleVariance: roundOrNull(ankleAngleVariance),
    footRepositionCount,
    handSupportDetected,
    stepOutDetected,
    pelvisDropOrLateralShift,
    sideBySideUnder10,
    semiTandemUnder10,
    earlyStageUnder10,
    oneLegUnder10,
    confidenceScore: roundOrNull(confidenceScore, 3),
    trackingQualityScore: roundOrNull(trackingQualityScore, 3),
  };

  const rawMetricsMeta = metricMeta(
    ['pelvisDropOrLateralShift'],
    rawMetrics.singleLegHoldSec === null ? ['singleLegHoldSec'] : [],
  );

  if (needsCameraCheck(result, { confidenceScore, trackingQualityScore, config })) {
    return cameraCheckResult({
      assessmentType: AssessmentTypes.FourStageBalance,
      rawMetrics,
      rawMetricsMeta,
      confidenceScore,
      trackingQualityScore,
      invalidReason: result.invalidReason || result.testFlags?.invalidReason || null,
    });
  }

  const tandemHold = finiteNumber(rawMetrics.tandemHoldSec);
  const tandemUnder10 = tandemHold !== null && tandemHold < tandemCutoff;
  const oneLegOnlyFailure = !tandemUnder10 && !stepOutDetected && oneLegUnder10;
  const stageNotCompleted = tandemUnder10 || stepOutDetected || tandem?.status === 'observed';
  const weaknessScores = emptyWeaknessScores();
  const failedCriteria = [];

  if (sideBySideUnder10) {
    failedCriteria.push(failedCriterion(
      AssessmentTypes.FourStageBalance,
      'sideBySideHoldUnder10Seconds',
      sideBySideHold,
      tandemCutoff,
      { clinicalCutoff: true },
    ));
    mergeScore(weaknessScores, WeaknessIds.BalanceControl, scoreBelow(sideBySideHold, tandemCutoff, 0.72, 0.95));
  }
  if (semiTandemUnder10) {
    failedCriteria.push(failedCriterion(
      AssessmentTypes.FourStageBalance,
      'semiTandemHoldUnder10Seconds',
      semiTandemHold,
      tandemCutoff,
      { clinicalCutoff: true },
    ));
    mergeScore(weaknessScores, WeaknessIds.BalanceControl, scoreBelow(semiTandemHold, tandemCutoff, 0.66, 0.92));
  }

  if (tandemUnder10) {
    failedCriteria.push(failedCriterion(
      AssessmentTypes.FourStageBalance,
      'tandemHoldUnder10Seconds',
      tandemHold,
      tandemCutoff,
      { clinicalCutoff: true },
    ));
    mergeScore(weaknessScores, WeaknessIds.BalanceControl, scoreBelow(tandemHold, tandemCutoff, 0.55, 0.92));
  }
  if (stepOutDetected) {
    mergeScore(weaknessScores, WeaknessIds.BalanceControl, 0.74);
  }
  if (oneLegOnlyFailure) {
    mergeScore(weaknessScores, WeaknessIds.BalanceControl, scoreBelow(oneLegHold, tandemCutoff, 0.52, 0.72));
    mergeScore(weaknessScores, WeaknessIds.HipAbductorMediolateralControl, 0.58);
  }

  mergeScore(
    weaknessScores,
    WeaknessIds.AnkleStrategyProprioception,
    Math.max(
      scoreAbove(earlySwayFirst4Sec, config.weaknessThresholds.balanceEarlySway, 0.34, 0.82),
      scoreAbove(ankleAngleVariance, config.weaknessThresholds.ankleAngleRangeDegrees, 0.34, 0.78),
      footRepositionCount > 0 ? clamp(0.35 + footRepositionCount * 0.18, 0.35, 0.85) : 0,
    ),
  );
  mergeScore(
    weaknessScores,
    WeaknessIds.HipAbductorMediolateralControl,
    Math.max(
      scoreAbove(mlSway, config.weaknessThresholds.balanceMediolateralSway, 0.36, 0.86),
      pelvisDropOrLateralShift ? 0.62 : 0,
      tandemTotal?.footMovement?.firstExitAxis === 'mediolateral' ? 0.68 : 0,
    ),
  );

  const testFlags = {
    clinicalCutoffFailed: tandemUnder10,
    tandemUnder10Sec: tandemUnder10,
    sideBySideUnder10Sec: sideBySideUnder10,
    semiTandemUnder10Sec: semiTandemUnder10,
    earlyStageUnder10Sec: earlyStageUnder10,
    oneLegUnder10Sec: oneLegUnder10,
    oneLegOnlyFailure,
    stageNotCompleted,
    balanceControlSignal: tandemUnder10 || stepOutDetected || earlyStageUnder10 || oneLegOnlyFailure,
    handSupportDetected,
    stepOutDetected,
    safetyEvent: handSupportDetected || stepOutDetected || earlyStageUnder10,
    needsSaferSetupOrSupervision: handSupportDetected || earlyStageUnder10,
    needsSupervisedBalanceProgram: earlyStageUnder10,
    cameraSetupNeeded: false,
  };

  return finalizeAssessmentResult({
    assessmentType: AssessmentTypes.FourStageBalance,
    rawMetrics,
    rawMetricsMeta,
    testFlags,
    weaknessScores,
    failedCriteria,
    failedCutoffWeaknesses: [
      WeaknessIds.BalanceControl,
      WeaknessIds.AnkleStrategyProprioception,
      WeaknessIds.HipAbductorMediolateralControl,
    ],
    seniorMessage: balanceSeniorMessage(weaknessScores, testFlags),
    staffMessage: balanceStaffMessage(rawMetrics, weaknessScores, testFlags),
    professionalNotes:
      'Static balance screening applies CDC STEADI hold criteria first. Landmark sway is a camera-based movement proxy, not force-plate center-of-pressure data, and is used only to tailor exercise cues.',
  });
}

function chairRepetitionsFrom(result = {}) {
  const chair = result.chairStandResult || result;
  return firstFinite(chair?.repetitionCount, result.repetitionCount, result.primaryValue, result.count);
}

function chairAggregate(result = {}) {
  return result.chairStandResult?.aggregate || result.aggregate || {};
}

function fatigueDropOffFromChair(result = {}) {
  const direct = firstFinite(result.fatigueDropOff, result.rawMetrics?.fatigueDropOff);
  if (direct !== null) return direct;
  const reps = result.chairStandResult?.repetitions || result.repetitions || [];
  const intervals = reps.map((rep) => finiteNumber(rep.repIntervalSeconds)).filter((value) => value !== null && value > 0);
  if (intervals.length < 3) return null;
  const third = Math.max(1, Math.floor(intervals.length / 3));
  const early = average(intervals.slice(0, third));
  const late = average(intervals.slice(-third));
  if (!early || !late) return null;
  return clamp((late - early) / early, 0, 1);
}

function buildChairStandAssessment(result = {}, { profile, ageYears, gender, config = AssessmentRuleConfig } = {}) {
  const chair = result.chairStandResult || result;
  const aggregate = chairAggregate(result);
  const completedReps = chairRepetitionsFrom(result);
  const armAssistDetected = Boolean(
    chair?.armUseDisqualified
      || result.armUseDisqualified
      || chair?.armSupport?.disqualified,
  );
  const officialReps = armAssistDetected ? 0 : completedReps;
  const resolvedAgeYears = firstFinite(ageYears, ageYearsFromProfile(profile));
  const resolvedGender = normalizeSteadiGender(gender ?? profile?.gender ?? profile?.sex);
  const threshold = chairStandBelowAverageThreshold(resolvedAgeYears, resolvedGender);
  const kneeExtensionVelocity = firstFinite(
    aggregate.extensionAngularVelocityDegPerSec?.knee?.meanOfRepMeans,
    result.kneeExtensionAngularVelocityDegPerSec?.meanOfRepMeans,
    result.kneeExtensionAngularVelocityDegPerSec,
  );
  const hipExtensionVelocity = firstFinite(
    aggregate.extensionAngularVelocityDegPerSec?.hip?.meanOfRepMeans,
    result.hipExtensionAngularVelocityDegPerSec?.meanOfRepMeans,
    result.hipExtensionAngularVelocityDegPerSec,
  );
  const trunkForwardLean = aggregate.trunkForwardLean || result.trunkForwardLean || {};
  const avgSitPhaseTimeSec = firstFinite(aggregate.sittingSpeed?.meanDurationSeconds);
  const descentVelocity = firstFinite(aggregate.sittingSpeed?.meanHipDescentVelocityBodyHeightsPerSec);
  const leftRightAsymmetryIndex = firstFinite(result.leftRightAsymmetryIndex, 1 - (result.symmetryScore ?? aggregate.symmetryScoreMean ?? 1));
  const kneeValgus = aggregate.kneeValgus || result.kneeValgus || {};
  const weightShiftAsymmetry = aggregate.weightShiftAsymmetry || result.weightShiftAsymmetry || {};
  const functionalCompletion = aggregate.functionalCompletion || {};
  const fatigueDropOff = fatigueDropOffFromChair(result);
  const confidenceScore = firstFinite(chair.confidence, result.confidence, 0);
  const trackingQualityScore = trackingQualityFrom(result, chair) ?? confidenceScore;

  const rawMetrics = {
    completedReps,
    officialClinicalReps: officialReps,
    avgRepTimeSec: roundOrNull(firstFinite(aggregate.averageRepSeconds, result.averageRepSeconds)),
    avgStandPhaseTimeSec: roundOrNull(average((chair.repetitions || []).map((rep) => rep.extension?.durationSeconds))),
    avgSitPhaseTimeSec: roundOrNull(avgSitPhaseTimeSec),
    failedRepCount: firstFinite(result.failedRepCount, 0),
    armAssistDetected,
    incompleteStandAttemptDetected: Boolean(
      result.incompleteStandAttemptDetected
        || chair.incompleteStandAttemptDetected
        || functionalCompletion.incompleteStandAttemptDetected
    ),
    failedStandAttemptCount: firstFinite(
      result.failedStandAttemptCount,
      chair.failedStandAttemptCount,
      functionalCompletion.failedStandAttemptCount,
      0,
    ),
    trunkForwardLeanPeak: roundOrNull(firstFinite(trunkForwardLean.angleMaxDegrees, result.trunkForwardLeanPeak)),
    trunkForwardLeanDuration: roundOrNull(firstFinite(result.trunkForwardLeanDuration), 2),
    kneeExtensionVelocity: roundOrNull(kneeExtensionVelocity, 2),
    hipExtensionVelocity: roundOrNull(hipExtensionVelocity, 2),
    kneeValgusOrInwardCollapse: result.kneeValgusOrInwardCollapse ?? kneeValgus.observed ?? null,
    kneeValgusScore: roundOrNull(kneeValgus.scoreMean ?? kneeValgus.score, 3),
    weightShiftAsymmetryScore: roundOrNull(weightShiftAsymmetry.scoreMean ?? weightShiftAsymmetry.score, 3),
    weightShiftMaxOffset: roundOrNull(weightShiftAsymmetry.maxNormalizedOffset ?? weightShiftAsymmetry.normalizedOffset, 3),
    descentControlScore: descentControlScore(avgSitPhaseTimeSec, descentVelocity),
    leftRightAsymmetryIndex: roundOrNull(leftRightAsymmetryIndex, 3),
    fatigueDropOff: roundOrNull(fatigueDropOff, 3),
    confidenceScore: roundOrNull(confidenceScore, 3),
    trackingQualityScore: roundOrNull(trackingQualityScore, 3),
  };
  const rawMetricsMeta = metricMeta(
    ['trunkForwardLeanDuration'],
    [
      rawMetrics.kneeValgusOrInwardCollapse === null ? 'kneeValgusOrInwardCollapse' : null,
      rawMetrics.weightShiftAsymmetryScore === null ? 'weightShiftAsymmetryScore' : null,
      rawMetrics.fatigueDropOff === null ? 'fatigueDropOff' : null,
      rawMetrics.avgStandPhaseTimeSec === null ? 'avgStandPhaseTimeSec' : null,
    ],
  );

  if (needsCameraCheck(result, { confidenceScore, trackingQualityScore, config })) {
    return cameraCheckResult({
      assessmentType: AssessmentTypes.ChairStand30Sec,
      rawMetrics,
      rawMetricsMeta,
      confidenceScore,
      trackingQualityScore,
      invalidReason: result.invalidReason || result.testFlags?.invalidReason || null,
    });
  }

  const profileInfoNeeded = threshold === null;
  const belowThreshold = threshold !== null && officialReps !== null && officialReps < threshold;
  const weaknessScores = emptyWeaknessScores();
  const failedCriteria = [];

  if (armAssistDetected) {
    failedCriteria.push(failedCriterion(
      AssessmentTypes.ChairStand30Sec,
      'armUseDisqualified',
      officialReps,
      0,
      { clinicalCutoff: false },
    ));
  }

  if (belowThreshold) {
    failedCriteria.push(failedCriterion(
      AssessmentTypes.ChairStand30Sec,
      'belowAgeSexThreshold',
      officialReps,
      threshold,
      { ageYears: resolvedAgeYears, gender: resolvedGender, clinicalCutoff: true },
    ));
    mergeScore(weaknessScores, WeaknessIds.LowerBodyEndurance, scoreBelow(officialReps, threshold, 0.55, 0.92));
  }

  const lowRepsPattern = belowThreshold || (threshold === null && completedReps !== null && completedReps <= 8);
  const trunkLeanHigh = firstFinite(rawMetrics.trunkForwardLeanPeak) !== null
    && rawMetrics.trunkForwardLeanPeak >= config.weaknessThresholds.trunkForwardLeanPeakDegrees;
  const kneeVelocityLow = kneeExtensionVelocity !== null
    && kneeExtensionVelocity < config.weaknessThresholds.kneeExtensionLowVelocityDegPerSec;
  const hipVelocityLow = hipExtensionVelocity !== null
    && hipExtensionVelocity < config.weaknessThresholds.hipExtensionLowVelocityDegPerSec;
  const eccentricSignal = rawMetrics.descentControlScore !== null && rawMetrics.descentControlScore < 0.45;
  const fatigueSignal = fatigueDropOff !== null && fatigueDropOff >= config.weaknessThresholds.fatigueDropOffRatio;
  const asymmetrySignal = leftRightAsymmetryIndex !== null && leftRightAsymmetryIndex >= config.weaknessThresholds.asymmetryIndex;
  const kneeValgusSignal = rawMetrics.kneeValgusOrInwardCollapse === true
    || (rawMetrics.kneeValgusScore !== null && rawMetrics.kneeValgusScore >= 0.45);
  const weightShiftSignal = rawMetrics.weightShiftAsymmetryScore !== null && rawMetrics.weightShiftAsymmetryScore >= 0.45;
  const incompleteStandSignal = rawMetrics.incompleteStandAttemptDetected || rawMetrics.failedStandAttemptCount > 0;

  if (lowRepsPattern && kneeVelocityLow) mergeScore(weaknessScores, WeaknessIds.QuadricepsStrength, 0.68);
  else if (kneeVelocityLow) mergeScore(weaknessScores, WeaknessIds.QuadricepsStrength, 0.45);
  if (lowRepsPattern && trunkLeanHigh) mergeScore(weaknessScores, WeaknessIds.HipExtensorGluteStrength, 0.72);
  else if (trunkLeanHigh || hipVelocityLow) mergeScore(weaknessScores, WeaknessIds.HipExtensorGluteStrength, 0.48);
  if (kneeValgusSignal) mergeScore(weaknessScores, WeaknessIds.HipAbductorMediolateralControl, 0.68);
  if (weightShiftSignal) mergeScore(weaknessScores, WeaknessIds.AsymmetryNeedsReview, 0.66);
  if (weightShiftSignal) mergeScore(weaknessScores, WeaknessIds.HipAbductorMediolateralControl, 0.44);
  if (eccentricSignal) mergeScore(weaknessScores, WeaknessIds.EccentricControl, 0.66);
  if (fatigueSignal) mergeScore(weaknessScores, WeaknessIds.LowerBodyEndurance, 0.64);
  if (asymmetrySignal) mergeScore(weaknessScores, WeaknessIds.AsymmetryNeedsReview, 0.72);
  if (armAssistDetected) mergeScore(weaknessScores, WeaknessIds.LowerBodyEndurance, 0.76);
  if (incompleteStandSignal) mergeScore(weaknessScores, WeaknessIds.LowerBodyEndurance, 0.72);

  const testFlags = {
    clinicalCutoffFailed: belowThreshold,
    profileInfoNeeded,
    profilePrompt: profileInfoNeeded ? 'Needs profile info for age-based comparison' : null,
    belowAgeSexThreshold: belowThreshold,
    armAssistDetected,
    incompleteStandAttemptDetected: incompleteStandSignal,
    kneeValgusOrInwardCollapse: kneeValgusSignal,
    weightShiftAsymmetryDetected: weightShiftSignal,
    safetyEvent: armAssistDetected,
    needsAssistedStrengthening: armAssistDetected || incompleteStandSignal,
    cameraSetupNeeded: false,
  };

  return finalizeAssessmentResult({
    assessmentType: AssessmentTypes.ChairStand30Sec,
    rawMetrics,
    rawMetricsMeta,
    testFlags,
    weaknessScores,
    failedCriteria,
    failedCutoffWeaknesses: [
      WeaknessIds.LowerBodyEndurance,
      WeaknessIds.QuadricepsStrength,
      WeaknessIds.HipExtensorGluteStrength,
    ],
    seniorMessage: chairSeniorMessage(weaknessScores, testFlags),
    staffMessage: chairStaffMessage(rawMetrics, weaknessScores, testFlags, threshold),
    professionalNotes:
      '30-second Chair Stand screening uses CDC STEADI below-average comparison when age and sex are available. Motion flags are observation-only cues for exercise selection and do not diagnose muscle weakness or disease.',
  });
}

function descentControlScore(avgSitPhaseTimeSec, descentVelocity) {
  const duration = finiteNumber(avgSitPhaseTimeSec);
  const velocity = finiteNumber(descentVelocity);
  if (duration === null && velocity === null) return null;
  const durationScore = duration === null ? 1 : clamp(duration / 1.6, 0, 1);
  const velocityScore = velocity === null ? 1 : clamp(1 - velocity / 0.55, 0, 1);
  return roundOrNull((durationScore + velocityScore) / 2, 2);
}

function buildTugAssessment(result = {}, { config = AssessmentRuleConfig } = {}) {
  const tug = result.tugResult || result.rawMetrics || result;
  const totalTimeSec = firstFinite(tug.totalTimeSec, result.primaryValue, result.repetitionCount);
  const confidenceScore = firstFinite(tug.confidenceScore, tug.confidence, result.confidence, 0);
  const trackingQualityScore = trackingQualityFrom(result, tug) ?? confidenceScore;
  const rawMetrics = {
    totalTimeSec: roundOrNull(totalTimeSec),
    sitToStandTimeSec: roundOrNull(tug.sitToStandTimeSec),
    walkOutTimeSec: roundOrNull(tug.walkOutTimeSec),
    turnDurationSec: roundOrNull(tug.turnDurationSec),
    returnWalkTimeSec: roundOrNull(tug.returnWalkTimeSec),
    sitDownTimeSec: roundOrNull(tug.sitDownTimeSec),
    gaitSpeedEstimate: roundOrNull(tug.gaitSpeedEstimate, 2),
    stepCount: roundOrNull(tug.stepCount, 0),
    stepLengthEstimate: roundOrNull(tug.stepLengthEstimate, 2),
    stepLengthVariability: roundOrNull(tug.stepLengthVariability, 3),
    stepWidthVariability: roundOrNull(tug.stepWidthVariability, 3),
    shufflingScore: roundOrNull(tug.shufflingScore, 2),
    armSwingAsymmetry: roundOrNull(tug.armSwingAsymmetry, 2),
    turnStepCount: roundOrNull(tug.turnStepCount, 0),
    enBlocTurningDetected: Boolean(tug.enBlocTurningDetected),
    wallOrFurnitureSupportDetected: Boolean(tug.wallOrFurnitureSupportDetected),
    lossOfBalanceDetected: Boolean(tug.lossOfBalanceDetected),
    confidenceScore: roundOrNull(confidenceScore, 3),
    trackingQualityScore: roundOrNull(trackingQualityScore, 3),
  };
  const rawMetricsMeta = metricMeta(
    tug.estimatedMetrics || [
      'gaitSpeedEstimate',
      'stepLengthEstimate',
      'shufflingScore',
      'turnStepCount',
    ],
    tug.unavailableMetrics || [],
  );

  if (needsCameraCheck(result, { confidenceScore, trackingQualityScore, config })) {
    return cameraCheckResult({
      assessmentType: AssessmentTypes.TimedUpAndGo,
      rawMetrics,
      rawMetricsMeta,
      confidenceScore,
      trackingQualityScore,
      invalidReason: result.invalidReason || result.testFlags?.invalidReason || null,
    });
  }

  const tugCutoff = config.clinicalThresholds.tugSeconds;
  const tugSlow = totalTimeSec !== null && totalTimeSec >= tugCutoff;
  const weaknessScores = emptyWeaknessScores();
  const failedCriteria = [];

  if (tugSlow) {
    failedCriteria.push(failedCriterion(
      AssessmentTypes.TimedUpAndGo,
      'tugAtOrAbove12Seconds',
      roundOrNull(totalTimeSec),
      tugCutoff,
      { clinicalCutoff: true },
    ));
    mergeScore(weaknessScores, WeaknessIds.DynamicMobility, scoreAbove(totalTimeSec, tugCutoff, 0.56, 0.92));
  }
  mergeScore(
    weaknessScores,
    WeaknessIds.DynamicMobility,
    scoreAbove(rawMetrics.sitToStandTimeSec, config.weaknessThresholds.sitToStandTransitionSeconds, 0.34, 0.7),
  );
  mergeScore(
    weaknessScores,
    WeaknessIds.GaitStability,
    Math.max(
      scoreBelow(rawMetrics.gaitSpeedEstimate, config.weaknessThresholds.lowGaitSpeedMetersPerSec, 0.42, 0.82),
      scoreBelow(rawMetrics.stepLengthEstimate, config.weaknessThresholds.shortStepLengthMeters, 0.34, 0.72),
      scoreAbove(rawMetrics.shufflingScore, config.weaknessThresholds.highShufflingScore, 0.42, 0.84),
    ),
  );
  mergeScore(
    weaknessScores,
    WeaknessIds.TurningControl,
    Math.max(
      scoreAbove(rawMetrics.turnDurationSec, config.weaknessThresholds.slowTurnSeconds, 0.45, 0.86),
      scoreAbove(rawMetrics.turnStepCount, config.weaknessThresholds.highTurnStepCount, 0.42, 0.82),
      rawMetrics.enBlocTurningDetected ? 0.68 : 0,
    ),
  );
  mergeScore(
    weaknessScores,
    WeaknessIds.AsymmetryNeedsReview,
    scoreAbove(rawMetrics.armSwingAsymmetry, config.weaknessThresholds.highArmSwingAsymmetry, 0.42, 0.78),
  );

  const testFlags = {
    clinicalCutoffFailed: tugSlow,
    tugAtOrAbove12Seconds: tugSlow,
    wallOrFurnitureSupportDetected: rawMetrics.wallOrFurnitureSupportDetected,
    lossOfBalanceDetected: rawMetrics.lossOfBalanceDetected,
    safetyEvent: rawMetrics.wallOrFurnitureSupportDetected || rawMetrics.lossOfBalanceDetected,
    supervisedModeRecommended: rawMetrics.wallOrFurnitureSupportDetected,
    cameraSetupNeeded: false,
  };

  return finalizeAssessmentResult({
    assessmentType: AssessmentTypes.TimedUpAndGo,
    rawMetrics,
    rawMetricsMeta,
    testFlags,
    weaknessScores,
    failedCriteria,
    failedCutoffWeaknesses: [
      WeaknessIds.DynamicMobility,
      WeaknessIds.GaitStability,
      WeaknessIds.TurningControl,
    ],
    seniorMessage: tugSeniorMessage(weaknessScores, testFlags),
    staffMessage: tugStaffMessage(rawMetrics, weaknessScores, testFlags),
    professionalNotes:
      'Timed Up and Go screening connects total time, transition, walking, turning, support use, and return-to-sit patterns to exercise planning. Not diagnostic.',
  });
}

function riskLevelForSingleAssessment({ failedCriteria, weaknessScores, testFlags, clinicalResultAvailable }) {
  if (clinicalResultAvailable === false) return null;
  const clinicalFailures = failedCriteria.filter((criterion) => criterion.clinicalCutoff).length;
  const mildWeaknessCount = Object.values(weaknessScores).filter((score) => score >= 0.3).length;
  const hasStrongWeakness = Object.values(weaknessScores).some((score) => score >= 0.8);
  if (testFlags.safetyEvent) return FallRiskLevels.NeedsReview;
  if (clinicalFailures >= 2) return FallRiskLevels.NeedsReview;
  if (clinicalFailures === 1 || mildWeaknessCount >= 2 || hasStrongWeakness) return FallRiskLevels.Moderate;
  return FallRiskLevels.Low;
}

function pickPrimaryWeakness(weaknessScores, preferredWeaknesses = []) {
  const scored = Object.entries(weaknessScores)
    .filter(([, score]) => score > 0.5)
    .sort((a, b) => b[1] - a[1]);
  if (!scored.length) return 'generalMaintenance';
  const topScore = scored[0][1];
  const closePreferred = scored.find(([key, score]) => (
    preferredWeaknesses.includes(key) && topScore - score <= 0.08
  ));
  return closePreferred?.[0] || scored[0][0];
}

function secondaryWeaknesses(weaknessScores, primaryWeakness) {
  return Object.entries(weaknessScores)
    .filter(([key, score]) => key !== primaryWeakness && score >= 0.3)
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({
      id,
      label: WeaknessLabels[id] || id,
      score: roundOrNull(score, 2),
      signal: weaknessSignalLabel(score),
    }));
}

function weaknessSignalLabel(score) {
  if (score >= 0.8) return 'strong signal';
  if (score >= 0.6) return 'clear signal';
  if (score >= 0.3) return 'mild signal';
  return 'no major signal';
}

function finalizeAssessmentResult({
  assessmentType,
  rawMetrics,
  rawMetricsMeta,
  testFlags,
  weaknessScores,
  failedCriteria,
  failedCutoffWeaknesses = [],
  seniorMessage,
  staffMessage,
  professionalNotes,
  clinicalResultAvailable = true,
}) {
  const roundedScores = Object.fromEntries(
    Object.entries(weaknessScores).map(([key, score]) => [key, roundOrNull(clamp(score), 2)]),
  );
  const primaryWeakness = clinicalResultAvailable === false
    ? 'cameraSetup'
    : pickPrimaryWeakness(roundedScores, failedCutoffWeaknesses);
  const secondary = clinicalResultAvailable === false ? [] : secondaryWeaknesses(roundedScores, primaryWeakness);
  const fallRiskLevel = riskLevelForSingleAssessment({
    failedCriteria,
    weaknessScores: roundedScores,
    testFlags,
    clinicalResultAvailable,
  });
  const recommendationPlan = buildRecommendationPlan({
    primaryWeakness,
    secondaryWeaknesses: secondary,
    weaknessScores: roundedScores,
    testFlags,
    assessmentType,
    clinicalResultAvailable,
  });

  return {
    schemaVersion: ASSESSMENT_PIPELINE_SCHEMA_VERSION,
    assessmentDate: new Date().toISOString(),
    completedAssessments: [assessmentType],
    assessmentType,
    rawMetrics,
    rawMetricsMeta,
    testFlags: {
      ...testFlags,
      clinicalResultAvailable,
    },
    failedCriteria,
    weaknessScores: roundedScores,
    primaryWeakness,
    primaryWeaknessLabel: WeaknessLabels[primaryWeakness] || primaryWeakness,
    secondaryWeaknesses: secondary,
    fallRiskLevel,
    olderAdultLabel: OlderAdultFallRiskLabels[fallRiskLevel] || OlderAdultFallRiskLabels.UNSCORED,
    staffRiskLabel: StaffFallRiskLabels[fallRiskLevel] || StaffFallRiskLabels.UNSCORED,
    recommendationPlan,
    recommendedExercises: recommendationPlan.recommendedExercises,
    recommendations: recommendationPlan.recommendedExercises,
    weakAreas: primaryWeakness === 'generalMaintenance' || primaryWeakness === 'cameraSetup'
      ? []
      : [{ id: primaryWeakness, label: WeaknessLabels[primaryWeakness], score: roundedScores[primaryWeakness] }],
    weakAreaIds: primaryWeakness === 'generalMaintenance' || primaryWeakness === 'cameraSetup' ? [] : [primaryWeakness],
    seniorMessage: seniorMessage || recommendationPlan.seniorMessage,
    staffMessage,
    professionalNotes,
  };
}

function buildRecommendationPlan({
  primaryWeakness,
  secondaryWeaknesses,
  testFlags,
  assessmentType,
  clinicalResultAvailable,
}) {
  if (clinicalResultAvailable === false || testFlags.cameraSetupNeeded) {
    return {
      priority: 'camera_setup',
      reason: 'Pose confidence was below the screening threshold.',
      safetyGates: ['camera_setup_needed'],
      dynamicGameAllowed: false,
      gameDisabledReason: "Let's check the camera setup again before choosing an exercise game.",
      recommendedExercises: [],
      seniorMessage: "Let's check the camera setup again before reading today's result.",
      nextAction: 'Repeat camera setup',
    };
  }

  const safetyGates = safetyGatesFor(testFlags);
  const dynamicGameAllowed = safetyGates.length === 0;
  const weaknessOrder = [
    primaryWeakness,
    ...secondaryWeaknesses.map((item) => item.id),
  ].filter(Boolean);
  const exerciseIds = [];
  if (testFlags.armAssistDetected || testFlags.incompleteStandAttemptDetected) {
    for (const id of ['elevated_sit_to_stand', 'partial_sit_to_stand', 'mini_knee_bends']) {
      if (!exerciseIds.includes(id)) exerciseIds.push(id);
    }
  }
  for (const weakness of weaknessOrder.length ? weaknessOrder : ['generalMaintenance']) {
    for (const id of WeaknessExerciseMap[weakness] || []) {
      if (!exerciseIds.includes(id)) exerciseIds.push(id);
    }
  }

  const recommendedExercises = exerciseIds
    .map((id) => AssessmentExerciseLibrary[id])
    .filter(Boolean)
    .filter((exercise) => {
      if (!safetyGates.length) return true;
      if (testFlags.lossOfBalanceDetected || testFlags.wallOrFurnitureSupportDetected) {
        return exercise.requiresChairSupport || exercise.category === 'strength';
      }
      if (testFlags.needsSupervisedBalanceProgram) return exercise.requiresChairSupport;
      if (testFlags.handSupportDetected || testFlags.armAssistDetected) return exercise.requiresChairSupport;
      return true;
    })
    .slice(0, 3)
    .map((exercise, index) => exerciseToRecommendation(exercise, {
      reason: WeaknessReasonText[exercise.targetWeakness] || WeaknessReasonText[primaryWeakness] || WeaknessReasonText.generalMaintenance,
      dynamicGameAllowed,
      primary: index === 0,
      assessmentType,
      safetyGates,
    }));

  return {
    priority: safetyGates.length ? 'safety_first' : 'exercise_practice',
    reason: WeaknessReasonText[primaryWeakness] || WeaknessReasonText.generalMaintenance,
    safetyGates,
    dynamicGameAllowed,
    gameDisabledReason: dynamicGameAllowed ? null : safetyGateCopy(testFlags),
    recommendedExercises,
    seniorMessage: recommendationSeniorMessage(primaryWeakness, testFlags),
    nextAction: safetyGates.length ? 'Use supported practice and consider professional review if this continues.' : 'Start the first recommended exercise.',
  };
}

function exerciseToRecommendation(exercise, { reason, dynamicGameAllowed, primary, safetyGates }) {
  const gameBlocked = !dynamicGameAllowed && exercise.category !== 'strength';
  return {
    ...exercise,
    schemaVersion: 'steply_otago_exercise.v1',
    exerciseKey: exercise.id,
    title: exercise.title || exercise.name,
    description: exercise.seniorInstruction,
    safetyNote: exercise.safetyInstruction,
    durationSeconds: exercise.defaultHoldSec ? exercise.defaultHoldSec : 60,
    recommendationRole: primary ? 'primary' : 'supporting',
    source: 'otago_style_rule_engine',
    reason,
    gameAllowed: !gameBlocked,
    gameDisabledReason: gameBlocked ? 'Use supported practice first today.' : null,
    safetyGates,
  };
}

function safetyGatesFor(testFlags = {}) {
  const gates = [];
  if (testFlags.lossOfBalanceDetected) gates.push('loss_of_balance_detected');
  if (testFlags.wallOrFurnitureSupportDetected) gates.push('supervised_mode_recommended');
  if (testFlags.needsSupervisedBalanceProgram) gates.push('supervised_balance_program_recommended');
  if (testFlags.handSupportDetected) gates.push('chair_supported_balance_only');
  if (testFlags.incompleteStandAttemptDetected) gates.push('partial_sit_to_stand_regression');
  if (testFlags.armAssistDetected) gates.push('assisted_sit_to_stand_progression');
  return gates;
}

function safetyGateCopy(testFlags = {}) {
  if (testFlags.lossOfBalanceDetected) return 'Use supported practice today and consider professional review if this pattern continues.';
  if (testFlags.wallOrFurnitureSupportDetected) return 'Use supervised mode for walking practice today.';
  if (testFlags.needsSupervisedBalanceProgram) return 'Use chair-supported balance practice and consider professional review if this repeats.';
  if (testFlags.handSupportDetected) return 'Use chair-supported balance practice today.';
  if (testFlags.incompleteStandAttemptDetected) return 'Use a higher chair, small range, and support for sit-to-stand practice today.';
  if (testFlags.armAssistDetected) return 'Use assisted sit-to-stand progression today.';
  return 'Use supported practice today.';
}

function recommendationSeniorMessage(primaryWeakness, testFlags = {}) {
  if (testFlags.lossOfBalanceDetected || testFlags.wallOrFurnitureSupportDetected) {
    return 'Let us keep the next exercise supported and steady today.';
  }
  if (testFlags.needsSupervisedBalanceProgram) {
    return 'Balance looked harder today. We will keep practice supported and steady.';
  }
  if (testFlags.incompleteStandAttemptDetected) {
    return 'A full stand was not reached every time. We will start with a higher chair and supported practice.';
  }
  if (primaryWeakness === WeaknessIds.HipAbductorMediolateralControl) {
    return "Your body swayed a little more from side to side today. Let's wake up your side hip muscles.";
  }
  if (primaryWeakness === WeaknessIds.AnkleStrategyProprioception || primaryWeakness === WeaknessIds.BalanceControl) {
    return "The first few seconds were a little unsteady today. We'll practice gentle ankle and balance control.";
  }
  if (primaryWeakness === WeaknessIds.HipExtensorGluteStrength) {
    return "Standing up took a little more effort today. Let's build leg strength with a short chair exercise.";
  }
  if (primaryWeakness === WeaknessIds.LowerBodyEndurance || primaryWeakness === WeaknessIds.QuadricepsStrength) {
    return "Your legs slowed down near the end. We'll practice a gentle strength game at a safe pace.";
  }
  if (primaryWeakness === WeaknessIds.TurningControl) {
    return "Turning took a little longer today. Let's practice a slow, steady walking path.";
  }
  if (primaryWeakness === WeaknessIds.GaitStability || primaryWeakness === WeaknessIds.DynamicMobility) {
    return "Your steps were shorter today. We'll work on steady walking with a simple path game.";
  }
  if (primaryWeakness === WeaknessIds.AsymmetryNeedsReview) {
    return 'Movement looked a little different side to side today. We will keep the practice even and gentle.';
  }
  return 'Your movement was recorded. Keep practicing at a comfortable pace.';
}

function topWeakness(weaknessScores = {}) {
  const [id] = Object.entries(weaknessScores).sort((a, b) => b[1] - a[1])[0] || [];
  return id || 'generalMaintenance';
}

function balanceSeniorMessage(weaknessScores, testFlags) {
  return recommendationSeniorMessage(topWeakness(weaknessScores), testFlags);
}

function chairSeniorMessage(weaknessScores, testFlags) {
  return recommendationSeniorMessage(topWeakness(weaknessScores), testFlags);
}

function tugSeniorMessage(weaknessScores, testFlags) {
  return recommendationSeniorMessage(topWeakness(weaknessScores), testFlags);
}

function balanceStaffMessage(rawMetrics, weaknessScores, testFlags) {
  const weakness = WeaknessLabels[topWeakness(weaknessScores)] || 'balance control';
  const support = testFlags.handSupportDetected ? ' Visible support use was observed; use supported setup.' : '';
  const early = testFlags.earlyStageUnder10Sec
    ? ` Early-stage hold under 10s (side-by-side ${rawMetrics.sideBySideHoldSec ?? '-'}s, semi-tandem ${rawMetrics.semiTandemHoldSec ?? '-'}s).`
    : '';
  return `Balance screening practice focus: ${weakness}. Tandem hold ${rawMetrics.tandemHoldSec ?? '-'}s.${early}${support}`;
}

function chairStaffMessage(rawMetrics, weaknessScores, testFlags, threshold) {
  if (testFlags.profileInfoNeeded) {
    return 'Chair Stand captured; age/sex profile information is needed for CDC STEADI comparison.';
  }
  const weakness = WeaknessLabels[topWeakness(weaknessScores)] || 'lower-body control';
  const alignment = testFlags.kneeValgusOrInwardCollapse ? ' Knee inward-collapse flag observed.' : '';
  const weightShift = testFlags.weightShiftAsymmetryDetected ? ' Left-right weight-shift asymmetry observed.' : '';
  const incomplete = testFlags.incompleteStandAttemptDetected ? ' Partial stand attempt observed; use sit-to-stand regression.' : '';
  return `Chair Stand ${rawMetrics.officialClinicalReps ?? rawMetrics.completedReps ?? '-'} reps vs threshold ${threshold ?? '-'}. Practice focus: ${weakness}.${alignment}${weightShift}${incomplete}`;
}

function tugStaffMessage(rawMetrics, weaknessScores, testFlags) {
  const weakness = WeaknessLabels[topWeakness(weaknessScores)] || 'dynamic mobility';
  const support = testFlags.supervisedModeRecommended ? ' Supervised mode recommended.' : '';
  return `TUG total time ${rawMetrics.totalTimeSec ?? '-'}s. Pattern suggests ${weakness}.${support}`;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function testTypeForAssessment(assessment) {
  if (assessment?.assessmentType === AssessmentTypes.FourStageBalance) return 'four_stage_balance';
  if (assessment?.assessmentType === AssessmentTypes.TimedUpAndGo) return 'timed_up_and_go';
  if (assessment?.assessmentType === AssessmentTypes.ChairStand30Sec) return 'chair_stand';
  return normalizeTestType(assessment?.testType);
}

function historyTimestamp(item) {
  const direct = finiteNumber(item?.receivedAt ?? item?.createdAt ?? item?.completedAt ?? item?.endedAt);
  if (direct !== null) return direct;
  const parsed = Date.parse(item?.assessmentDate || item?.date || item?.timestamp || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function historyTestType(item) {
  return normalizeTestType(item?.testType || item?.selectedTest || item?.type || item?.assessmentType);
}

function historyMetric(item, metric) {
  if (metric === 'chairReps') {
    return firstFinite(
      item?.rawMetrics?.completedReps,
      item?.chairStandResult?.repetitionCount,
      item?.features?.chairStandCount,
      item?.features?.primaryValue,
      item?.repetitionCount,
      item?.primaryValue,
      item?.count,
    );
  }
  if (metric === 'tugTime') {
    return firstFinite(item?.rawMetrics?.totalTimeSec, item?.tugResult?.totalTimeSec, item?.primaryValue, item?.count);
  }
  if (metric === 'tandemHold') {
    return firstFinite(
      item?.rawMetrics?.tandemHoldSec,
      item?.balanceResult?.stageById?.tandem?.holdSeconds,
      item?.features?.primaryValue,
      item?.primaryValue,
      item?.repetitionCount,
      item?.count,
    );
  }
  return null;
}

function recentHistoryValues(historyItems, testType, metric, limit) {
  return asArray(historyItems)
    .filter((item) => historyTestType(item) === testType)
    .sort((a, b) => historyTimestamp(b) - historyTimestamp(a))
    .slice(0, limit)
    .map((item) => historyMetric(item, metric))
    .filter((value) => value !== null);
}

function buildTrendWarningsForAssessment(assessment, historyItems = [], config = AssessmentRuleConfig) {
  const warnings = [];
  const testType = testTypeForAssessment(assessment);
  const limit = config.trend.recentSessionLimit;
  if (testType === 'chair_stand') {
    const current = finiteNumber(assessment.rawMetrics?.completedReps);
    const previous = recentHistoryValues(historyItems, testType, 'chairReps', limit);
    const avg = average(previous);
    if (current !== null && avg !== null && current <= avg * (1 - config.trend.chairStandDeclineRatio)) {
      warnings.push({
        id: 'chair_stand_reps_declined',
        assessment: AssessmentTypes.ChairStand30Sec,
        message: 'Chair stand repetitions declined by 15% or more from the recent average.',
        heuristic: true,
        observed: current,
        recentAverage: roundOrNull(avg, 2),
      });
    }
  }
  if (testType === 'timed_up_and_go') {
    const current = finiteNumber(assessment.rawMetrics?.totalTimeSec);
    const previous = recentHistoryValues(historyItems, testType, 'tugTime', limit);
    const avg = average(previous);
    if (current !== null && avg !== null && current >= avg * (1 + config.trend.tugTimeIncreaseRatio)) {
      warnings.push({
        id: 'tug_time_increased',
        assessment: AssessmentTypes.TimedUpAndGo,
        message: 'TUG time increased by 15% or more from the recent average.',
        heuristic: true,
        observed: current,
        recentAverage: roundOrNull(avg, 2),
      });
    }
  }
  if (testType === 'four_stage_balance') {
    const current = finiteNumber(assessment.rawMetrics?.tandemHoldSec);
    const previous = recentHistoryValues(historyItems, testType, 'tandemHold', limit);
    const avg = average(previous);
    const minDrop = avg === null
      ? null
      : Math.max(config.trend.tandemHoldDeclineSeconds, avg * config.trend.tandemHoldDeclineRatio);
    if (current !== null && avg !== null && current <= avg - minDrop) {
      warnings.push({
        id: 'tandem_hold_decreased',
        assessment: AssessmentTypes.FourStageBalance,
        message: 'Tandem hold time decreased meaningfully from the recent average.',
        heuristic: true,
        observed: current,
        recentAverage: roundOrNull(avg, 2),
      });
    }
  }
  const adherence = latestAdherence(historyItems);
  if (adherence !== null && adherence < config.trend.weeklyAdherenceMinimum) {
    warnings.push({
      id: 'weekly_adherence_below_half',
      message: 'Exercise adherence is below 50% for the week.',
      heuristic: true,
      observed: adherence,
      threshold: config.trend.weeklyAdherenceMinimum,
    });
  }
  return warnings;
}

function latestAdherence(historyItems = []) {
  const sorted = asArray(historyItems).slice().sort((a, b) => historyTimestamp(b) - historyTimestamp(a));
  for (const item of sorted) {
    const value = firstFinite(item?.exerciseAdherence, item?.adherence, item?.features?.adherence);
    if (value !== null) return value > 1 ? value / 100 : value;
  }
  return null;
}

export function aggregateFallRisk({
  assessments = [],
  trendWarnings = [],
} = {}) {
  const scored = assessments.filter((assessment) => assessment?.testFlags?.clinicalResultAvailable !== false);
  if (!scored.length) return null;
  const failedCriteria = scored.flatMap((assessment) => assessment.failedCriteria || []);
  const clinicalFailures = failedCriteria.filter((criterion) => criterion.clinicalCutoff !== false).length;
  const safetyEvent = scored.some((assessment) => assessment.testFlags?.safetyEvent);
  const repeatedDecline = trendWarnings.filter((warning) => warning.heuristic).length >= 2;
  const tugFailed = failedCriteria.some((criterion) => criterion.assessment === AssessmentTypes.TimedUpAndGo);
  const otherFailed = failedCriteria.some((criterion) => criterion.assessment !== AssessmentTypes.TimedUpAndGo);
  const tandemFailed = failedCriteria.some((criterion) => criterion.assessment === AssessmentTypes.FourStageBalance);
  const chairFailed = failedCriteria.some((criterion) => criterion.assessment === AssessmentTypes.ChairStand30Sec);
  const mildWeaknessCount = scored.reduce((count, assessment) => (
    count + Object.values(assessment.weaknessScores || {}).filter((score) => score >= 0.3).length
  ), 0);
  const hasStrongWeakness = scored.some((assessment) => (
    Object.values(assessment.weaknessScores || {}).some((score) => score >= 0.8)
  ));

  if (
    safetyEvent
    || clinicalFailures >= 2
    || (tugFailed && otherFailed)
    || (tandemFailed && chairFailed)
    || repeatedDecline
  ) {
    return FallRiskLevels.NeedsReview;
  }
  if (clinicalFailures === 1 || mildWeaknessCount >= 2 || hasStrongWeakness || trendWarnings.length) {
    return FallRiskLevels.Moderate;
  }
  return FallRiskLevels.Low;
}

export function buildAssessmentSummary({
  assessments = [],
  historyItems = [],
  config = AssessmentRuleConfig,
} = {}) {
  const trendWarnings = assessments.flatMap((assessment) => buildTrendWarningsForAssessment(assessment, historyItems, config));
  const fallRiskLevel = aggregateFallRisk({ assessments, trendWarnings });
  const mergedScores = emptyWeaknessScores();
  for (const assessment of assessments) {
    for (const [key, value] of Object.entries(assessment.weaknessScores || {})) {
      mergeScore(mergedScores, key, value);
    }
  }
  const failedCutoffWeaknesses = assessments.flatMap((assessment) => assessment.failedCutoffWeaknesses || []);
  const primaryWeakness = pickPrimaryWeakness(mergedScores, failedCutoffWeaknesses);
  const secondary = secondaryWeaknesses(mergedScores, primaryWeakness);
  const recommendationPlan = buildRecommendationPlan({
    primaryWeakness,
    secondaryWeaknesses: secondary,
    weaknessScores: mergedScores,
    testFlags: {
      safetyEvent: assessments.some((assessment) => assessment.testFlags?.safetyEvent),
      lossOfBalanceDetected: assessments.some((assessment) => assessment.testFlags?.lossOfBalanceDetected),
      wallOrFurnitureSupportDetected: assessments.some((assessment) => assessment.testFlags?.wallOrFurnitureSupportDetected),
      handSupportDetected: assessments.some((assessment) => assessment.testFlags?.handSupportDetected),
      armAssistDetected: assessments.some((assessment) => assessment.testFlags?.armAssistDetected),
    },
    clinicalResultAvailable: fallRiskLevel !== null,
  });

  return {
    schemaVersion: ASSESSMENT_PIPELINE_SCHEMA_VERSION,
    assessmentDate: new Date().toISOString(),
    completedAssessments: assessments.flatMap((assessment) => assessment.completedAssessments || assessment.assessmentType),
    fallRiskLevel,
    olderAdultLabel: OlderAdultFallRiskLabels[fallRiskLevel] || OlderAdultFallRiskLabels.UNSCORED,
    staffRiskLabel: StaffFallRiskLabels[fallRiskLevel] || StaffFallRiskLabels.UNSCORED,
    failedCriteria: assessments.flatMap((assessment) => assessment.failedCriteria || []),
    weaknessScores: Object.fromEntries(Object.entries(mergedScores).map(([key, score]) => [key, roundOrNull(score, 2)])),
    primaryWeakness,
    primaryWeaknessLabel: WeaknessLabels[primaryWeakness] || primaryWeakness,
    secondaryWeaknesses: secondary,
    trendWarnings,
    recommendationPlan,
    recommendedExercises: recommendationPlan.recommendedExercises,
    seniorMessage: recommendationPlan.seniorMessage,
    staffMessage: `${StaffFallRiskLabels[fallRiskLevel] || StaffFallRiskLabels.UNSCORED}: ${recommendationPlan.reason}`,
    professionalNotes: 'Rule-based screening summary across available assessments. Trend rules are heuristic screening support, not clinical diagnosis.',
  };
}

export function buildAssessmentResult({
  result,
  profile,
  ageYears,
  gender,
  historyItems = [],
  config = AssessmentRuleConfig,
} = {}) {
  const testType = normalizeTestType(result?.testType || result?.selectedTest);
  const assessment = testType === 'four_stage_balance'
    ? buildBalanceAssessment(result, { config })
    : testType === 'timed_up_and_go'
      ? buildTugAssessment(result, { config })
      : buildChairStandAssessment(result, { profile, ageYears, gender, config });
  const trendWarnings = buildTrendWarningsForAssessment(assessment, historyItems, config);
  const fallRiskLevel = aggregateFallRisk({ assessments: [assessment], trendWarnings });
  const next = {
    ...assessment,
    trendWarnings,
    fallRiskLevel,
    olderAdultLabel: OlderAdultFallRiskLabels[fallRiskLevel] || OlderAdultFallRiskLabels.UNSCORED,
    staffRiskLabel: StaffFallRiskLabels[fallRiskLevel] || StaffFallRiskLabels.UNSCORED,
  };
  return next;
}

export const normalizeAssessmentPipelineResult = buildAssessmentResult;
