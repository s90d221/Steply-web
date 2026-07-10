import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

function axis(sd = 0.01, range = 0.03, velocity = 0.01) {
  return {
    standardDeviation: sd,
    range,
    meanAbsoluteVelocity: velocity,
    pathLength: range,
  };
}

function balanceWindow({ ml = axis(), ap = axis(), footAxis = null, handSupport = false } = {}) {
  return {
    sampleCount: 40,
    durationSeconds: 4,
    sway: {
      mediolateral: ml,
      anteriorPosterior: ap,
      anteriorPosteriorAxis: 'z',
    },
    ankleAngleChange: {
      average: { rangeDegrees: 6, netChangeDegrees: 1, meanAbsoluteVelocityDegPerSec: 2 },
    },
    footMovement: {
      exitObserved: Boolean(footAxis),
      firstExitAxis: footAxis,
      maxDisplacementRatio: footAxis ? 0.18 : 0.02,
      maxMediolateralDisplacementRatio: footAxis === 'mediolateral' ? 0.18 : 0.02,
      maxAnteriorPosteriorDisplacementRatio: footAxis === 'anteriorPosterior' ? 0.18 : 0.02,
      exitByAxis: {
        mediolateral: { observed: footAxis === 'mediolateral' },
        anteriorPosterior: { observed: footAxis === 'anteriorPosterior' },
      },
    },
    handSupport: {
      possible: handSupport,
      frameCount: handSupport ? 8 : 0,
      frameRatio: handSupport ? 0.2 : 0,
    },
  };
}

function balanceStage(id, holdSeconds, totalHold = balanceWindow()) {
  return {
    id,
    title: id,
    status: holdSeconds >= 10 ? 'completed' : 'observed',
    targetHoldSeconds: 10,
    holdSeconds,
    dynamicAdjustment: totalHold,
    staticHold: totalHold,
    totalHold,
  };
}

function balanceResult({
  sideBySideHold = 10,
  semiTandemHold = 10,
  tandemHold = 10,
  oneLegHold = 10,
  tandemWindow = balanceWindow(),
  confidence = 0.92,
} = {}) {
  const stages = [
    balanceStage('side_by_side', sideBySideHold),
    balanceStage('semi_tandem', semiTandemHold),
    balanceStage('tandem', tandemHold, tandemWindow),
    balanceStage('one_leg', oneLegHold),
  ];
  return {
    testType: 'four_stage_balance',
    primaryValue: tandemHold,
    confidence,
    balanceResult: {
      schemaVersion: 'balance_result.v1',
      testType: 'four_stage_balance',
      confidence,
      stages,
      stageById: Object.fromEntries(stages.map((stage) => [stage.id, stage])),
    },
  };
}

function chairResult({
  reps = 12,
  confidence = 0.92,
  trunkLeanPeak = 8,
  kneeVelocity = 60,
  armAssist = false,
  kneeValgus = false,
  weightShift = false,
  incompleteStand = false,
} = {}) {
  return {
    testType: 'chair_stand',
    repetitionCount: reps,
    primaryValue: reps,
    confidence,
    armUseDisqualified: armAssist,
    chairStandResult: {
      schemaVersion: 'chair_stand_result.v1',
      testType: 'chair_stand',
      repetitionCount: reps,
      armUseDisqualified: armAssist,
      incompleteStandAttemptDetected: incompleteStand,
      failedStandAttemptCount: incompleteStand ? 1 : 0,
      confidence,
      repetitions: [],
      aggregate: {
        averageRepSeconds: reps ? 30 / reps : null,
        extensionAngularVelocityDegPerSec: {
          knee: { meanOfRepMeans: kneeVelocity, maxObserved: kneeVelocity + 10 },
          hip: { meanOfRepMeans: 36, maxObserved: 48 },
        },
        sittingSpeed: {
          meanDurationSeconds: 1.2,
          meanHipDescentVelocityBodyHeightsPerSec: 0.2,
        },
        trunkForwardLean: {
          angleMeanDegrees: trunkLeanPeak * 0.7,
          angleMaxDegrees: trunkLeanPeak,
          scoreMean: 0.5,
        },
        kneeValgus: {
          scoreMean: kneeValgus ? 0.72 : 0.08,
          observedFrameCount: kneeValgus ? 4 : 0,
          availableFrameCount: 8,
          observed: kneeValgus,
        },
        weightShiftAsymmetry: {
          scoreMean: weightShift ? 0.7 : 0.08,
          maxNormalizedOffset: weightShift ? 0.42 : 0.1,
          observedFrameCount: weightShift ? 4 : 0,
          availableFrameCount: 8,
          observed: weightShift,
        },
        functionalCompletion: {
          incompleteStandAttemptDetected: incompleteStand,
          failedStandAttemptCount: incompleteStand ? 1 : 0,
          halfwayStandObservationCount: incompleteStand ? 3 : 0,
        },
        symmetryScoreMean: 0.9,
      },
    },
  };
}

function tugResult({
  totalTimeSec = 10,
  turnDurationSec = 2,
  confidence = 0.92,
  support = false,
} = {}) {
  return {
    testType: 'timed_up_and_go',
    primaryValue: totalTimeSec,
    confidence,
    tugResult: {
      schemaVersion: 'timed_up_and_go_result.v1',
      testType: 'timed_up_and_go',
      totalTimeSec,
      sitToStandTimeSec: 1.8,
      walkOutTimeSec: 3,
      turnDurationSec,
      returnWalkTimeSec: 3,
      sitDownTimeSec: 1.2,
      gaitSpeedEstimate: 0.74,
      stepLengthEstimate: 0.5,
      shufflingScore: 0.2,
      armSwingAsymmetry: 0.1,
      turnStepCount: Math.round(turnDurationSec * 1.5),
      enBlocTurningDetected: false,
      wallOrFurnitureSupportDetected: support,
      lossOfBalanceDetected: false,
      confidence,
      confidenceScore: confidence,
      estimatedMetrics: ['gaitSpeedEstimate', 'turnStepCount'],
    },
  };
}

try {
  const {
    AssessmentTypes,
    FallRiskLevels,
    WeaknessIds,
    buildAssessmentResult,
    buildAssessmentSummary,
  } = await server.ssrLoadModule('/client/src/pose/assessmentRules.js');

  const profile = { ageYears: 70, gender: 'female' };

  const tandemUnder10 = buildAssessmentResult({
    result: balanceResult({ tandemHold: 8.8 }),
    profile,
  });
  assert.equal(tandemUnder10.failedCriteria[0].criterion, 'tandemHoldUnder10Seconds');
  assert.equal(tandemUnder10.fallRiskLevel, FallRiskLevels.Moderate);

  const earlyBalanceFailure = buildAssessmentResult({
    result: balanceResult({ sideBySideHold: 6.5, semiTandemHold: 7, tandemHold: 0 }),
    profile,
  });
  assert.equal(earlyBalanceFailure.testFlags.needsSupervisedBalanceProgram, true);
  assert.equal(earlyBalanceFailure.fallRiskLevel, FallRiskLevels.NeedsReview);

  const oneLegOnlyFailure = buildAssessmentResult({
    result: balanceResult({ tandemHold: 10, oneLegHold: 7.5 }),
    profile,
  });
  assert.equal(oneLegOnlyFailure.testFlags.oneLegOnlyFailure, true);
  assert.equal(oneLegOnlyFailure.primaryWeakness, WeaknessIds.HipAbductorMediolateralControl);
  assert.ok(oneLegOnlyFailure.recommendedExercises.some((exercise) => exercise.id === 'supported_one_leg_stand'));

  const chairBelowThreshold = buildAssessmentResult({
    result: chairResult({ reps: 9 }),
    profile,
  });
  assert.equal(chairBelowThreshold.failedCriteria[0].criterion, 'belowAgeSexThreshold');
  assert.ok(chairBelowThreshold.weaknessScores.lowerBodyEndurance >= 0.5);

  const tugExcluded = buildAssessmentResult({
    result: tugResult({ totalTimeSec: 12.4 }),
    profile,
  });
  assert.equal(tugExcluded.testFlags.excludedFromV1Pipeline, true);
  assert.equal(tugExcluded.fallRiskLevel, null);
  assert.equal(tugExcluded.failedCriteria.length, 0);

  const combined = buildAssessmentSummary({
    assessments: [tandemUnder10, chairBelowThreshold],
  });
  assert.equal(combined.fallRiskLevel, FallRiskLevels.NeedsReview);

  const lowConfidence = buildAssessmentResult({
    result: balanceResult({ confidence: 0.2 }),
    profile,
  });
  assert.equal(lowConfidence.fallRiskLevel, null);
  assert.equal(lowConfidence.testFlags.cameraSetupNeeded, true);
  assert.equal(lowConfidence.testFlags.clinicalResultAvailable, false);
  assert.equal(lowConfidence.failedCriteria.length, 0);

  const hipSway = buildAssessmentResult({
    result: balanceResult({
      tandemHold: 10,
      tandemWindow: balanceWindow({
        ml: axis(0.075, 0.18, 0.08),
        ap: axis(0.015, 0.04, 0.02),
        footAxis: 'mediolateral',
      }),
    }),
    profile,
  });
  assert.equal(hipSway.primaryWeakness, WeaknessIds.HipAbductorMediolateralControl);
  assert.equal(hipSway.recommendedExercises[0].id, 'side_hip_strengthening');

  const trunkLeanChair = buildAssessmentResult({
    result: chairResult({ reps: 9, trunkLeanPeak: 24, kneeVelocity: 38 }),
    profile,
  });
  assert.equal(trunkLeanChair.primaryWeakness, WeaknessIds.HipExtensorGluteStrength);
  assert.ok(trunkLeanChair.recommendedExercises.some((exercise) => exercise.id === 'sit_to_stand_practice'));

  const kneeValgusChair = buildAssessmentResult({
    result: chairResult({ reps: 12, trunkLeanPeak: 8, kneeVelocity: 62, kneeValgus: true }),
    profile,
  });
  assert.equal(kneeValgusChair.testFlags.kneeValgusOrInwardCollapse, true);
  assert.equal(kneeValgusChair.primaryWeakness, WeaknessIds.HipAbductorMediolateralControl);
  assert.ok(kneeValgusChair.recommendedExercises.some((exercise) => exercise.id === 'knee_alignment_sit_to_stand'));

  const incompleteStandChair = buildAssessmentResult({
    result: chairResult({ reps: 6, trunkLeanPeak: 10, kneeVelocity: 58, incompleteStand: true }),
    profile,
  });
  assert.equal(incompleteStandChair.testFlags.incompleteStandAttemptDetected, true);
  assert.equal(incompleteStandChair.recommendedExercises[0].id, 'elevated_sit_to_stand');
  assert.ok(incompleteStandChair.recommendedExercises.some((exercise) => exercise.id === 'partial_sit_to_stand'));

  const missingProfile = buildAssessmentResult({
    result: chairResult({ reps: 8 }),
    profile: null,
  });
  assert.equal(missingProfile.testFlags.profileInfoNeeded, true);
  assert.equal(missingProfile.failedCriteria.length, 0);

  console.log(`${AssessmentTypes.FourStageBalance}: tandem under 10 seconds -> ${tandemUnder10.fallRiskLevel}`);
  console.log(`${AssessmentTypes.ChairStand30Sec}: below age/sex threshold -> ${chairBelowThreshold.fallRiskLevel}`);
  console.log(`${AssessmentTypes.TimedUpAndGo}: excluded from Steply v1.0 -> ${tugExcluded.staffRiskLabel}`);
  console.log(`Combined two failed assessments -> ${combined.fallRiskLevel}`);
  console.log('Assessment rule checks passed.');
} finally {
  await server.close();
}
