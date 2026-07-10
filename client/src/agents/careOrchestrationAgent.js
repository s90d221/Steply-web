import {
  AssessmentTestTypes,
  AssessmentTypes,
  CareOrchestrationToolIds,
  FallRiskLevels,
  SteplyV1AssessmentTestTypes,
  buildAssessmentResult,
  isSteplyV1TestType,
} from '../pose/assessmentRules';
import {
  SteadiRiskLevels,
  calculateSteadiFallRisk,
} from '../pose/steadiRules';
import {
  WeakAreaIds,
  WeakAreaLabels,
  analyzeWeakAreaResult,
} from '../pose/weakAreaRules';
import { otagoRecommendationsForWeakAreas } from '../pose/otagoRecommendations';
import { movementTests } from '../data/movementTests';

export const CARE_ORCHESTRATION_SCHEMA_VERSION = 'care_orchestration_agent.v1';
export const STEADI_STEP1_SCHEMA_VERSION = 'steadi_step1_screen.v1';
export const MOTION_ANALYSIS_STAGE_SCHEMA_VERSION = 'motion_analysis_stage.v1';
export const POSE_JUDGEMENT_STAGE_SCHEMA_VERSION = 'pose_judgement_stage.v1';
export const OTAGO_PRESCRIPTION_STAGE_SCHEMA_VERSION = 'otago_prescription_stage.v1';

export const CarePipelineStageIds = {
  SteadiAssessment: 'STAGE_1_STEADI_ASSESSMENT',
  MotionAnalysisSystem: 'STAGE_2_AI_MOTION_ANALYSIS_SYSTEM_SPEC',
  PoseJudgement: 'STAGE_2_POSE_RECOGNITION_AND_JUDGEMENT',
  OtagoPrescription: 'STAGE_3_OTAGO_BASED_EXERCISE_PRESCRIPTION',
  CareOrchestrationAgent: 'CARE_ORCHESTRATION_AGENT',
};

export const SteadiStep1QuestionIds = {
  FallenPastYear: 'fallen_past_year',
  FeelsUnsteady: 'feels_unsteady_when_standing_or_walking',
  WorriesAboutFalling: 'worries_about_falling',
  FallCountPastYear: 'fall_count_past_year',
  FallInjuryPastYear: 'fall_injury_past_year',
};

const Step1QuestionText = {
  [SteadiStep1QuestionIds.FallenPastYear]: 'Fallen in the past year?',
  [SteadiStep1QuestionIds.FeelsUnsteady]: 'Feels unsteady when standing or walking?',
  [SteadiStep1QuestionIds.WorriesAboutFalling]: 'Worries about falling?',
};

const StrengthWeaknesses = new Set([
  'lowerBodyEndurance',
  'quadricepsStrength',
  'hipExtensorGluteStrength',
  'eccentricControl',
]);

const BalanceWeaknesses = new Set([
  'balanceControl',
  'ankleStrategyProprioception',
  'hipAbductorMediolateralControl',
  'asymmetryNeedsReview',
]);

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function truthyAnswer(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['yes', 'y', 'true', '1', 'at_risk'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'not_at_risk'].includes(normalized)) return false;
  return null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function step1SourceFromProfile(profile = {}) {
  return profile.steadiStep1
    || profile.steadiAssessment
    || profile.steadi
    || profile.fallScreen
    || profile.fallRiskScreen
    || {};
}

function step1Value(source, profile, ...keys) {
  for (const key of keys) {
    const value = firstDefined(source?.[key], profile?.[key]);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function buildSteadiStep1Assessment({ profile = {}, responses = null } = {}) {
  const source = responses || step1SourceFromProfile(profile);
  const answers = {
    [SteadiStep1QuestionIds.FallenPastYear]: truthyAnswer(step1Value(
      source,
      profile,
      SteadiStep1QuestionIds.FallenPastYear,
      'fallenPastYear',
      'fallPastYear',
      'hasFallenPastYear',
      'fallHistory',
    )),
    [SteadiStep1QuestionIds.FeelsUnsteady]: truthyAnswer(step1Value(
      source,
      profile,
      SteadiStep1QuestionIds.FeelsUnsteady,
      'feelsUnsteady',
      'unsteady',
      'feels_unsteady',
    )),
    [SteadiStep1QuestionIds.WorriesAboutFalling]: truthyAnswer(step1Value(
      source,
      profile,
      SteadiStep1QuestionIds.WorriesAboutFalling,
      'worriesAboutFalling',
      'worryAboutFalling',
      'fearOfFalling',
    )),
  };
  const fallCount = finiteNumber(step1Value(
    source,
    profile,
    SteadiStep1QuestionIds.FallCountPastYear,
    'fallCountPastYear',
    'fallCount',
    'fallsPastYear',
  ));
  const fallInjury = truthyAnswer(step1Value(
    source,
    profile,
    SteadiStep1QuestionIds.FallInjuryPastYear,
    'fallInjuryPastYear',
    'fallInjury',
    'injuryFromFall',
  ));
  const requiredAnswers = Object.values(answers);
  const complete = requiredAnswers.every((answer) => answer !== null);
  const atRisk = complete ? requiredAnswers.some(Boolean) : null;
  const highConcern = Boolean((fallCount !== null && fallCount >= 2) || fallInjury === true);

  return {
    schemaVersion: STEADI_STEP1_SCHEMA_VERSION,
    stageId: CarePipelineStageIds.SteadiAssessment,
    toolId: CareOrchestrationToolIds.SteadiScorer,
    questions: Object.entries(Step1QuestionText).map(([id, question]) => ({
      id,
      question,
      answer: answers[id],
    })),
    answers,
    fallHistory: {
      fallCountPastYear: fallCount,
      fallInjuryPastYear: fallInjury,
      highConcern,
    },
    complete,
    atRisk,
    missingInputs: complete
      ? []
      : Object.entries(answers)
        .filter(([, answer]) => answer === null)
        .map(([id]) => id),
    interpretation: complete
      ? atRisk
        ? 'step1_at_risk'
        : 'step1_not_at_risk'
      : 'step1_incomplete',
  };
}

function resultTestType(result = {}) {
  return result.testType || result.selectedTest || 'chair_stand';
}

function balanceResultFrom(result = {}) {
  return result.balanceResult
    || result.rawAnalysisResult?.balanceResult
    || result.rawMetrics?.balanceResult
    || (result.testType === 'four_stage_balance' ? result : null);
}

function chairStandResultFrom(result = {}) {
  return result.chairStandResult
    || result.rawAnalysisResult?.chairStandResult
    || (result.testType === 'chair_stand' ? result : null);
}

function confidenceFrom(result = {}) {
  return finiteNumber(
    result.trackingQualityScore
      ?? result.trackingQuality?.trackingQualityScore
      ?? result.confidence
      ?? result.rawMetrics?.confidenceScore,
  );
}

function buildMotionAnalysisStage({ result = {}, assessmentResult = null } = {}) {
  const confidenceScore = confidenceFrom(result);
  const cameraSetupNeeded = Boolean(
    result.invalid
      || result.testFlags?.cameraSetupNeeded
      || assessmentResult?.testFlags?.cameraSetupNeeded
      || assessmentResult?.testFlags?.clinicalResultAvailable === false
  );
  const qualityPassed = !cameraSetupNeeded && (confidenceScore === null || confidenceScore >= 0.45);

  return {
    schemaVersion: MOTION_ANALYSIS_STAGE_SCHEMA_VERSION,
    stageId: CarePipelineStageIds.MotionAnalysisSystem,
    toolId: CareOrchestrationToolIds.PoseAnalyzer,
    model: {
      provider: 'MediaPipe',
      name: 'Pose Landmarker',
      topology: 'BlazePose 33 keypoints',
      runtime: 'web_worker_wasm',
    },
    supportedTests: movementTests.map((test) => ({
      id: test.id,
      protocolId: test.protocolId,
      axis: test.axis,
      completion: test.completion,
    })),
    coordinateSystem: {
      image: 'normalized image coordinates x/y plus relative z',
      world: 'metric world landmarks centered at the hip midpoint',
      axes: {
        mediolateral: 'world x',
        vertical: 'world y',
        anteriorPosterior: 'world z',
      },
    },
    requiredLandmarks: [
      'shoulders',
      'wrists',
      'hips',
      'knees',
      'ankles',
      'heels',
      'foot_index',
    ],
    qualityGate: {
      toolId: CareOrchestrationToolIds.QualityGate,
      passed: qualityPassed,
      confidenceScore,
      cameraSetupNeeded,
      clinicalResultAvailable: assessmentResult?.testFlags?.clinicalResultAvailable !== false,
      violations: [
        cameraSetupNeeded ? 'camera_setup_needed' : null,
        confidenceScore !== null && confidenceScore < 0.45 ? 'confidence_below_threshold' : null,
      ].filter(Boolean),
    },
  };
}

function buildPoseJudgementStage({ result = {}, assessmentResult }) {
  const testType = resultTestType(result);
  const rawMetrics = assessmentResult?.rawMetrics || {};

  return {
    schemaVersion: POSE_JUDGEMENT_STAGE_SCHEMA_VERSION,
    stageId: CarePipelineStageIds.PoseJudgement,
    toolId: CareOrchestrationToolIds.PoseAnalyzer,
    assessmentType: assessmentResult?.assessmentType || null,
    testType,
    supportedInV1: isSteplyV1TestType(testType),
    outputs: {
      nChair: testType === AssessmentTestTypes[AssessmentTypes.ChairStand30Sec]
        ? rawMetrics.officialClinicalReps ?? rawMetrics.completedReps ?? result.repetitionCount ?? result.primaryValue ?? null
        : null,
      tandemHoldSeconds: testType === AssessmentTestTypes[AssessmentTypes.FourStageBalance]
        ? rawMetrics.tandemHoldSec ?? result.primaryValue ?? null
        : null,
      stageHoldSeconds: {
        sideBySide: rawMetrics.sideBySideHoldSec ?? null,
        semiTandem: rawMetrics.semiTandemHoldSec ?? null,
        tandem: rawMetrics.tandemHoldSec ?? null,
        oneLeg: rawMetrics.singleLegHoldSec ?? null,
      },
      events: [
        rawMetrics.handSupportDetected || assessmentResult?.testFlags?.handSupportDetected ? 'HAND_SUPPORT' : null,
        rawMetrics.stepOutDetected || assessmentResult?.testFlags?.stepOutDetected ? 'FOOT_MOVEMENT' : null,
        assessmentResult?.testFlags?.armAssistDetected ? 'ARM_USE' : null,
        assessmentResult?.testFlags?.incompleteStandAttemptDetected ? 'INCOMPLETE_STAND' : null,
      ].filter(Boolean),
    },
    failedCriteria: assessmentResult?.failedCriteria || [],
    testFlags: assessmentResult?.testFlags || {},
    rawMetrics,
  };
}

function canonicalWeakAreaIdsFromAssessment(assessmentResult = {}) {
  const ids = new Set();
  const sourceIds = [
    assessmentResult.primaryWeakness,
    ...(assessmentResult.weakAreaIds || []),
    ...(assessmentResult.secondaryWeaknesses || []).map((item) => item.id),
  ].filter(Boolean);

  for (const id of sourceIds) {
    if (id === WeakAreaIds.AnkleStrategyProprioception || id === 'ankleStrategyProprioception') {
      ids.add(WeakAreaIds.AnkleStrategyProprioception);
    } else if (id === WeakAreaIds.HipAbductorMediolateralControl || id === 'hipAbductorMediolateralControl') {
      ids.add(WeakAreaIds.HipAbductorMediolateralControl);
    } else if (
      id === WeakAreaIds.LowerLimbMuscularEndurance
      || StrengthWeaknesses.has(id)
    ) {
      ids.add(WeakAreaIds.LowerLimbMuscularEndurance);
    } else if (BalanceWeaknesses.has(id)) {
      ids.add(WeakAreaIds.AnkleStrategyProprioception);
    }
  }

  return [...ids];
}

function severityFromSteadi(step1Assessment, steadiRisk, assessmentResult) {
  if (assessmentResult?.fallRiskLevel === FallRiskLevels.NeedsReview) return 'high';
  if (steadiRisk?.riskLevel === SteadiRiskLevels.High) return 'high';
  if (step1Assessment?.fallHistory?.highConcern) return 'high';
  if (assessmentResult?.fallRiskLevel === FallRiskLevels.Moderate) return 'moderate';
  if (steadiRisk?.riskLevel === SteadiRiskLevels.Medium) return 'moderate';
  if (step1Assessment?.atRisk === true) return 'moderate';
  if (assessmentResult?.fallRiskLevel === FallRiskLevels.Low && steadiRisk?.riskLevel === SteadiRiskLevels.Low) return 'low';
  return 'unscored';
}

function prescriptionLevelCap(severity) {
  if (severity === 'high') {
    return {
      balanceStartLevelCap: 'Level A supported only',
      strengthStartLevelCap: 'No ankle weight unless professionally cleared',
      supervision: 'professional_initial_review',
    };
  }
  if (severity === 'moderate') {
    return {
      balanceStartLevelCap: 'Level A supported',
      strengthStartLevelCap: '1-2 kg or bodyweight start',
      supervision: 'caregiver_first_two_weeks_recommended',
    };
  }
  return {
    balanceStartLevelCap: 'Level B unsupported allowed if safe',
    strengthStartLevelCap: '8-10 rep fatigue weight if safe',
    supervision: 'none_required',
  };
}

function buildOtagoPrescriptionStage({
  result,
  profile,
  assessmentResult,
  steadiSeverity,
}) {
  const weakAreaResult = analyzeWeakAreaResult({
    balanceResult: balanceResultFrom(result),
    chairStandResult: chairStandResultFrom(result),
    profile,
  });
  const canonicalIds = [
    ...new Set([
      ...(weakAreaResult.weakAreaIds || []),
      ...canonicalWeakAreaIdsFromAssessment(assessmentResult),
    ]),
  ];
  const otagoExercises = otagoRecommendationsForWeakAreas(canonicalIds);
  const fallbackExercises = assessmentResult?.recommendationPlan?.recommendedExercises || [];
  const recommendedExercises = otagoExercises.length ? otagoExercises : fallbackExercises;
  const levelCap = prescriptionLevelCap(steadiSeverity);

  return {
    schemaVersion: OTAGO_PRESCRIPTION_STAGE_SCHEMA_VERSION,
    stageId: CarePipelineStageIds.OtagoPrescription,
    toolId: CareOrchestrationToolIds.OtagoPrescriber,
    weakAreaToolId: CareOrchestrationToolIds.VulnerabilityMapper,
    weakAreaResult: {
      ...weakAreaResult,
      weakAreaIds: canonicalIds,
      weakAreas: canonicalIds.map((id) => ({
        id,
        label: WeakAreaLabels[id],
      })),
    },
    startLevelCap: levelCap,
    recommendedExercises,
    progressionRules: {
      strength: 'Progress after 10 reps x 2 sets with correct form for 2 consecutive sessions.',
      balance: 'Progress only after supported balance is steady for 2 consecutive sessions.',
      reassessmentCadence: 'Repeat STEADI balance and chair-stand checks every 4 weeks or earlier after decline or a safety event.',
    },
    deterministic: true,
  };
}

function latestHistoryTimestamp(historyItems = []) {
  return historyItems.reduce((latest, item) => {
    const value = finiteNumber(item?.receivedAt ?? item?.completedAt ?? item?.endedAt ?? item?.createdAt);
    return value === null ? latest : Math.max(latest, value);
  }, 0);
}

function buildAgentDecision({
  step1Assessment,
  assessmentResult,
  motionAnalysisStage,
  otagoPrescriptionStage,
  steadiSeverity,
  historyItems,
}) {
  const safetyGates = assessmentResult?.recommendationPlan?.safetyGates || [];
  const cameraBlocked = !motionAnalysisStage.qualityGate.passed;
  const unsupported = assessmentResult?.testFlags?.excludedFromV1Pipeline;
  const missingStep1 = step1Assessment?.complete === false;
  const lastSessionAt = latestHistoryTimestamp(historyItems);
  const nextReassessmentDueAt = lastSessionAt ? lastSessionAt + 28 * 24 * 60 * 60 * 1000 : null;

  if (unsupported) {
    return {
      priority: 'use_v1_assessment',
      nextAction: 'Use 4-Stage Balance or 30 sec Chair Stand.',
      seniorMessage: 'This check is outside the current Steply scoring flow. Please use the balance or chair-stand check.',
      sessionPlan: ['choose_supported_v1_test'],
      escalation: null,
      scheduler: { nextReassessmentDueAt },
    };
  }
  if (cameraBlocked) {
    return {
      priority: 'camera_setup',
      nextAction: 'Repeat camera setup before scoring.',
      seniorMessage: "Let's adjust the camera view before reading today's result.",
      sessionPlan: ['quality_gate_retry'],
      escalation: null,
      scheduler: { nextReassessmentDueAt },
    };
  }
  if (steadiSeverity === 'high' || safetyGates.length) {
    return {
      priority: 'safety_first',
      nextAction: 'Use supported practice and recommend professional review if this pattern repeats.',
      seniorMessage: 'We will keep practice supported and steady today.',
      sessionPlan: ['supported_balance_or_strength', 'no_unsupervised_progression'],
      escalation: 'professional_review_recommended',
      scheduler: { nextReassessmentDueAt: Date.now() },
    };
  }
  if (missingStep1) {
    return {
      priority: 'complete_steadi_step1',
      nextAction: 'Collect the three STEADI screening questions at the next profile check.',
      seniorMessage: 'The movement result is ready. The fall-history questions should be completed next.',
      sessionPlan: ['continue_prescribed_exercise', 'collect_step1_questions'],
      escalation: null,
      scheduler: { nextReassessmentDueAt },
    };
  }
  if (otagoPrescriptionStage.recommendedExercises.length) {
    return {
      priority: 'exercise_practice',
      nextAction: 'Start the first recommended Otago exercise.',
      seniorMessage: assessmentResult?.seniorMessage || 'Today has a matched exercise plan.',
      sessionPlan: otagoPrescriptionStage.recommendedExercises.slice(0, 3).map((exercise) => exercise.exerciseKey || exercise.id),
      escalation: null,
      scheduler: { nextReassessmentDueAt },
    };
  }
  return {
    priority: 'maintenance',
    nextAction: 'Continue gentle maintenance practice.',
    seniorMessage: 'Today looks like a maintenance day.',
    sessionPlan: ['supported_tandem_stand', 'knee_extension'],
    escalation: null,
    scheduler: { nextReassessmentDueAt },
  };
}

function buildToolTrace({ assessmentResult, step1Assessment, motionAnalysisStage, otagoPrescriptionStage }) {
  return [
    {
      toolId: CareOrchestrationToolIds.SteadiScorer,
      stageId: CarePipelineStageIds.SteadiAssessment,
      status: step1Assessment.complete ? 'complete' : 'needs_input',
    },
    {
      toolId: CareOrchestrationToolIds.QualityGate,
      stageId: CarePipelineStageIds.MotionAnalysisSystem,
      status: motionAnalysisStage.qualityGate.passed ? 'passed' : 'blocked',
    },
    {
      toolId: CareOrchestrationToolIds.PoseAnalyzer,
      stageId: CarePipelineStageIds.PoseJudgement,
      status: assessmentResult?.testFlags?.excludedFromV1Pipeline ? 'excluded' : 'complete',
    },
    {
      toolId: CareOrchestrationToolIds.VulnerabilityMapper,
      stageId: CarePipelineStageIds.OtagoPrescription,
      status: otagoPrescriptionStage.weakAreaResult.weakAreaIds.length ? 'matched' : 'fallback',
    },
    {
      toolId: CareOrchestrationToolIds.OtagoPrescriber,
      stageId: CarePipelineStageIds.OtagoPrescription,
      status: otagoPrescriptionStage.recommendedExercises.length ? 'prescribed' : 'none',
    },
  ];
}

export function runCareOrchestrationPipeline({
  result = {},
  profile = {},
  historyItems = [],
  step1Responses = null,
  now = Date.now(),
} = {}) {
  const testType = resultTestType(result);
  const step1Assessment = buildSteadiStep1Assessment({ profile, responses: step1Responses });
  const assessmentResult = buildAssessmentResult({
    result: { ...result, testType },
    profile,
    historyItems,
  });
  const steadiRisk = calculateSteadiFallRisk({
    balanceResult: balanceResultFrom(result),
    chairStandResult: chairStandResultFrom(result),
    profile,
  });
  const steadiSeverity = severityFromSteadi(step1Assessment, steadiRisk, assessmentResult);
  const motionAnalysisStage = buildMotionAnalysisStage({ result, assessmentResult });
  const poseJudgementStage = buildPoseJudgementStage({ result, assessmentResult });
  const otagoPrescriptionStage = buildOtagoPrescriptionStage({
    result,
    profile,
    assessmentResult,
    steadiSeverity,
  });
  const agentDecision = buildAgentDecision({
    step1Assessment,
    assessmentResult,
    motionAnalysisStage,
    otagoPrescriptionStage,
    steadiSeverity,
    historyItems,
  });
  const toolTrace = buildToolTrace({
    assessmentResult,
    step1Assessment,
    motionAnalysisStage,
    otagoPrescriptionStage,
  });
  const recommendedExercises = otagoPrescriptionStage.recommendedExercises.length
    ? otagoPrescriptionStage.recommendedExercises
    : assessmentResult.recommendedExercises || [];

  return {
    schemaVersion: CARE_ORCHESTRATION_SCHEMA_VERSION,
    createdAt: new Date(now).toISOString(),
    stageOrder: [
      CarePipelineStageIds.SteadiAssessment,
      CarePipelineStageIds.MotionAnalysisSystem,
      CarePipelineStageIds.PoseJudgement,
      CarePipelineStageIds.OtagoPrescription,
      CarePipelineStageIds.CareOrchestrationAgent,
    ],
    supportedTestTypes: SteplyV1AssessmentTestTypes,
    roleBoundary:
      'Deterministic tools score STEADI and prescribe Otago exercises; the agent only chooses timing, next action, reminders, and escalation.',
    stages: {
      steadiAssessment: {
        ...step1Assessment,
        functionalRisk: steadiRisk,
        combinedSeverity: steadiSeverity,
      },
      motionAnalysis: motionAnalysisStage,
      poseJudgement: {
        ...poseJudgementStage,
        assessmentResult,
      },
      otagoPrescription: otagoPrescriptionStage,
    },
    agent: {
      stageId: CarePipelineStageIds.CareOrchestrationAgent,
      toolTrace,
      observedState: {
        testType,
        step1AtRisk: step1Assessment.atRisk,
        steadiSeverity,
        fallRiskLevel: assessmentResult.fallRiskLevel,
        activeWeakAreaIds: otagoPrescriptionStage.weakAreaResult.weakAreaIds,
        safetyGates: assessmentResult.recommendationPlan?.safetyGates || [],
      },
      decision: agentDecision,
    },
    finalResultPatch: {
      carePipelineVersion: CARE_ORCHESTRATION_SCHEMA_VERSION,
      carePipelineStageOrder: [
        CarePipelineStageIds.SteadiAssessment,
        CarePipelineStageIds.MotionAnalysisSystem,
        CarePipelineStageIds.PoseJudgement,
        CarePipelineStageIds.OtagoPrescription,
        CarePipelineStageIds.CareOrchestrationAgent,
      ],
      steadiStep1Result: step1Assessment,
      steadiRiskResult: steadiRisk,
      motionAnalysisStage,
      poseJudgementStage,
      weakAreaResult: otagoPrescriptionStage.weakAreaResult,
      otagoPrescription: otagoPrescriptionStage,
      agentDecision,
      recommendationPlan: {
        ...(assessmentResult.recommendationPlan || {}),
        source: CareOrchestrationToolIds.OtagoPrescriber,
        priority: agentDecision.priority,
        reason: assessmentResult.recommendationPlan?.reason || agentDecision.nextAction,
        startLevelCap: otagoPrescriptionStage.startLevelCap,
        recommendedExercises,
        seniorMessage: agentDecision.seniorMessage,
        nextAction: agentDecision.nextAction,
      },
      recommendedExercises,
      recommendations: recommendedExercises,
      seniorMessage: agentDecision.seniorMessage || assessmentResult.seniorMessage,
      staffMessage: `${assessmentResult.staffRiskLabel || assessmentResult.fallRiskLevel || 'UNSCORED'}: ${agentDecision.nextAction}`,
    },
  };
}
