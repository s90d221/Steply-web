import { chairStandBelowAverageThreshold } from './steadiRules';
import { otagoRecommendationsForWeakAreas } from './otagoRecommendations';

export {
  OTAGO_RECOMMENDATION_SCHEMA_VERSION,
  OtagoExerciseCatalog,
  OtagoExerciseKeys,
  WeakAreaToOtagoExerciseMap,
  normalizeWeakAreaId,
  otagoExerciseKeysForWeakAreas,
  otagoRecommendationsForWeakAreas,
} from './otagoRecommendations';

export const ExerciseDifficultyLevels = {
  MeasurementOnly: 'measurement_only',
  Steady: 'steady',
  PracticeNeeded: 'practice_needed',
  Recheck: 'recheck',
};

// Backward-compatible alias for UI code that still reads "recommendationLevel".
// These labels describe exercise prescription difficulty, not STEADI fall-risk class.
export const RecommendationLevels = ExerciseDifficultyLevels;

export function calculateExerciseDifficultyLevel(repetitionCount) {
  if (repetitionCount >= 12) return ExerciseDifficultyLevels.Steady;
  if (repetitionCount >= 8) return ExerciseDifficultyLevels.PracticeNeeded;
  return ExerciseDifficultyLevels.Recheck;
}

export function calculateExerciseDifficultyLevelWithProfile({
  repetitionCount,
  ageYears,
  gender,
  armUseDisqualified = false,
}) {
  if (armUseDisqualified || repetitionCount <= 0) return ExerciseDifficultyLevels.Recheck;
  const threshold = chairStandBelowAverageThreshold(ageYears, gender);
  if (!threshold) return calculateExerciseDifficultyLevel(repetitionCount);
  return repetitionCount < threshold ? ExerciseDifficultyLevels.PracticeNeeded : ExerciseDifficultyLevels.Steady;
}

export function calculateRecommendationLevel(repetitionCount) {
  return calculateExerciseDifficultyLevel(repetitionCount);
}

export function calculateRecommendationLevelWithProfile(options) {
  return calculateExerciseDifficultyLevelWithProfile(options);
}

export function exerciseDifficultyLabel(level) {
  if (level === ExerciseDifficultyLevels.MeasurementOnly) return 'Measured';
  if (level === ExerciseDifficultyLevels.Steady) return 'Steady';
  if (level === ExerciseDifficultyLevels.PracticeNeeded) return 'Practice Recommended';
  return 'Recheck Needed';
}

export function recommendationLabel(level) {
  return exerciseDifficultyLabel(level);
}

export function testLabel(testType) {
  if (testType === 'four_stage_balance') return '4-Stage Balance';
  if (testType === 'standing_posture' || testType === 'balance_hold') return 'Standing Posture';
  if (testType === 'timed_up_and_go') return 'Timed Up and Go';
  return '30 sec Chair Stand';
}

export function recommendationTemplatesForLevel(level, testType = 'chair_stand') {
  const stopIfUncomfortable = 'Stop immediately if there is pain, dizziness, or discomfort.';
  const useSupport = 'Use a stable chair or caregiver support if needed.';

  if (testType === 'four_stage_balance' && level === RecommendationLevels.MeasurementOnly) {
    return [];
  }

  if (testType === 'standing_posture' || testType === 'balance_hold') {
    if (level === RecommendationLevels.Steady) {
      return [
        {
          title: 'Supported Balance Hold',
          description: 'Hold the back of a stable chair and stand comfortably for 20 seconds',
          safetyNote: `Sit and rest if you feel unstable. ${useSupport}`,
          durationSeconds: 20,
        },
        {
          title: 'Posture Reset Practice',
          description: 'Stand tall, gently center the trunk over the feet, and breathe slowly',
          safetyNote: stopIfUncomfortable,
          durationSeconds: 30,
        },
      ];
    }

    return [
      {
        title: 'Assisted Standing Hold',
        description: 'Stand comfortably for 10 seconds with a chair or caregiver support',
        safetyNote: useSupport,
        durationSeconds: 10,
      },
      {
        title: 'Gentle Weight Shift',
        description: 'Hold a chair and slowly shift weight left and right',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 45,
      },
    ];
  }

  if (level === RecommendationLevels.Steady) {
    return [
      {
        title: 'Supported Balance Hold',
        description: 'Hold the back of a stable chair and stand comfortably for 20 seconds',
        safetyNote: `Sit and rest if you feel unstable. ${useSupport}`,
        durationSeconds: 20,
      },
      {
        title: 'Gentle Chair Stand Practice',
        description: 'Slowly stand up from a chair and sit down 5 times',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 60,
      },
    ];
  }

  if (level === RecommendationLevels.PracticeNeeded) {
    return [
      {
        title: 'Supported Chair Stand Practice',
        description: 'Hold a stable chair or support and slowly stand up and sit down 5 times',
        safetyNote: `Do not rush. Use a stable chair. ${useSupport}`,
        durationSeconds: 60,
      },
      {
        title: 'Gentle Weight Shift',
        description: 'Hold a chair and slowly shift weight left and right',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 45,
      },
    ];
  }

  return [
    {
      title: 'Assisted Standing Hold',
      description: 'Stand comfortably for 10 seconds with a chair or caregiver support',
      safetyNote: useSupport,
      durationSeconds: 10,
    },
    {
      title: 'Seated Knee Extension',
      description: 'Sit on a chair, slowly straighten one knee, then lower it',
      safetyNote: stopIfUncomfortable,
      durationSeconds: 45,
    },
  ];
}

export function recommendationTemplatesForResult(result = {}) {
  if (result.recommendationPlan?.recommendedExercises?.length) {
    return result.recommendationPlan.recommendedExercises;
  }
  if (result.recommendedExercises?.length) return result.recommendedExercises;
  const otagoRecommendations = otagoRecommendationsForWeakAreas(
    result.weakAreas
      || result.weakAreaIds
      || result.weakAreaResult
      || result.weakArea,
  );
  if (otagoRecommendations.length) return otagoRecommendations;
  return recommendationTemplatesForLevel(result.recommendationLevel, result.testType);
}

export function resultFlagsFor(result, testType = 'chair_stand') {
  const percent = (value) => `${Math.round((value || 0) * 100)}%`;
  const primaryValue = result.primaryValue ?? result.repetitionCount ?? 0;
  const primaryLabel = result.primaryLabel || 'Measured Value';

  if (testType === 'four_stage_balance') {
    const balance = result.balanceResult;
    if (!balance?.stages?.length) {
      return [
        `${primaryLabel}: ${primaryValue}`,
        '4-stage balance measurement captured.',
        'Risk interpretation is intentionally not applied in this step.',
      ];
    }
    return balance.stages.map((stage) => (
      `${stage.title}: ${stage.holdSeconds.toFixed(1)}s observed, dynamic ML sway ${stage.dynamicAdjustment.sway.mediolateral.standardDeviation?.toFixed(4) ?? '-'}`
    ));
  }

  if (testType === 'standing_posture' || testType === 'balance_hold') {
    return [
      `${primaryLabel}: ${primaryValue}/100`,
      `Trunk center ${percent(result.trunkLeanScore)}`,
      `Foot-center balance ${percent(result.symmetryScore)}`,
      `Sway stability ${percent(result.stabilityScore)}`,
    ];
  }

  if (testType === 'timed_up_and_go') {
    return [
      result.testFlags?.lossOfBalanceDetected || result.testFlags?.wallOrFurnitureSupportDetected
        ? 'Support was used: supervised walking practice is recommended'
        : `${primaryLabel}: ${primaryValue}s`,
      `Gait speed estimate ${result.rawMetrics?.gaitSpeedEstimate ?? '-'} m/s`,
      `Turn time ${result.rawMetrics?.turnDurationSec ?? '-'} sec`,
    ];
  }

  return [
    result.armUseDisqualified ? 'Arm support detected: official score is 0' : `${primaryLabel}: ${primaryValue}`,
    `Trunk center ${percent(result.trunkLeanScore)}`,
    `Left-right symmetry ${percent(result.symmetryScore)}`,
    `Sway stability ${percent(result.stabilityScore)}`,
  ];
}
