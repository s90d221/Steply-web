import {
  ageYearsFromProfile,
  chairStandBelowAverageThreshold,
  normalizeSteadiGender,
} from './steadiRules';

export const WEAK_AREA_RESULT_SCHEMA_VERSION = 'weak_area_result.v1';

export const WeakAreaIds = {
  AnkleStrategyProprioception: 'ankle_strategy_proprioception',
  HipAbductorMediolateralControl: 'hip_abductor_mediolateral_control',
  LowerLimbMuscularEndurance: 'lower_limb_muscular_endurance',
};

export const WeakAreaLabels = {
  [WeakAreaIds.AnkleStrategyProprioception]: 'Ankle balance control',
  [WeakAreaIds.HipAbductorMediolateralControl]: 'Side hip stability',
  [WeakAreaIds.LowerLimbMuscularEndurance]: 'Lower-body endurance',
};

export const WeakAreaRuleIds = {
  TandemDynamicAnteriorPosteriorInstability: 'tandem_dynamic_anterior_posterior_instability',
  TandemSemiTandemMediolateralInstability: 'tandem_semi_tandem_mediolateral_instability',
  ChairStandLowRepsWithForwardLean: 'chair_stand_low_reps_with_forward_lean',
};

export const WeakAreaResultKeys = {
  [WeakAreaIds.AnkleStrategyProprioception]: {
    otagoTargetKeys: ['tandem_stance', 'tandem_walk', 'one_leg_stance'],
    arInputKey: 'balance_retraining',
  },
  [WeakAreaIds.HipAbductorMediolateralControl]: {
    otagoTargetKeys: ['side_hip_strengthening'],
    arInputKey: 'side_leg_raise',
  },
  [WeakAreaIds.LowerLimbMuscularEndurance]: {
    otagoTargetKeys: ['knee_extension', 'chair_stand'],
    arInputKey: 'knee_extension_and_sit_to_stand',
  },
};

export const WeakAreaRuleConfig = {
  rules: {
    // Spec 4.2 [15][16][17]: tandem-entry 3-4s anterior-posterior sway/exit maps to ankle strategy and proprioception.
    ankleStrategyProprioception: {
      id: WeakAreaRuleIds.TandemDynamicAnteriorPosteriorInstability,
      weakAreaId: WeakAreaIds.AnkleStrategyProprioception,
      stageIds: ['tandem'],
      windowKey: 'dynamicAdjustment',
      references: ['[15]', '[16]', '[17]'],
      thresholds: {
        minDynamicSampleCount: 3,
        minAnteriorPosteriorStdDevRatio: 0.035,
        minAnteriorPosteriorRangeRatio: 0.11,
        minAnteriorPosteriorMeanVelocityRatioPerSec: 0.05,
        anteriorPosteriorToMediolateralDominanceRatio: 1.15,
        dynamicToStaticStdDevRatio: 1.1,
        minAnteriorPosteriorFootExitRatio: 0.16,
      },
    },
    // Spec 4.2 [18][19]: tandem or semi-tandem mediolateral sway/side loss maps to hip abductor control.
    hipAbductorMediolateralControl: {
      id: WeakAreaRuleIds.TandemSemiTandemMediolateralInstability,
      weakAreaId: WeakAreaIds.HipAbductorMediolateralControl,
      stageIds: ['semi_tandem', 'tandem'],
      windowKey: 'totalHold',
      references: ['[18]', '[19]'],
      thresholds: {
        minMediolateralStdDevRatio: 0.04,
        minMediolateralRangeRatio: 0.12,
        minMediolateralMeanVelocityRatioPerSec: 0.05,
        mediolateralToAnteriorPosteriorDominanceRatio: 1.15,
        minMediolateralFootExitRatio: 0.16,
      },
    },
    // Spec 4.2 [20]: low 30s chair-stand repetitions plus compensatory forward trunk lean maps to lower-limb endurance.
    lowerLimbMuscularEndurance: {
      id: WeakAreaRuleIds.ChairStandLowRepsWithForwardLean,
      weakAreaId: WeakAreaIds.LowerLimbMuscularEndurance,
      references: ['[20]'],
      thresholds: {
        minTrunkForwardLeanMeanDegrees: 12,
        minTrunkForwardLeanMaxDegrees: 18,
        maxTrunkLeanScoreMean: 0.55,
      },
    },
  },
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mergeRuleConfig(config = {}) {
  const mergedRules = {};
  for (const [key, rule] of Object.entries(WeakAreaRuleConfig.rules)) {
    const override = config.rules?.[key] || {};
    mergedRules[key] = {
      ...rule,
      ...override,
      thresholds: {
        ...rule.thresholds,
        ...override.thresholds,
      },
    };
  }
  return {
    ...WeakAreaRuleConfig,
    ...config,
    rules: mergedRules,
  };
}

function stageById(balanceResult, stageId) {
  return balanceResult?.stageById?.[stageId]
    || balanceResult?.stages?.find((stage) => stage?.id === stageId)
    || null;
}

function metricAtLeast(value, threshold) {
  const number = finiteNumber(value);
  const cutoff = finiteNumber(threshold);
  return number !== null && cutoff !== null && number >= cutoff;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function axisDominates(primary, secondary, ratio) {
  const primaryValue = finiteNumber(primary);
  const secondaryValue = finiteNumber(secondary);
  const dominanceRatio = finiteNumber(ratio) ?? 1;
  if (primaryValue === null) return false;
  if (secondaryValue === null) return true;
  return primaryValue >= secondaryValue * dominanceRatio;
}

function axisExitObserved(footMovement, axis, threshold) {
  const axisKey = axis === 'mediolateral' ? 'maxMediolateralDisplacementRatio' : 'maxAnteriorPosteriorDisplacementRatio';
  return Boolean(footMovement?.exitByAxis?.[axis]?.observed)
    || metricAtLeast(footMovement?.[axisKey], threshold);
}

function metricSummary(windowMetrics) {
  return {
    sampleCount: windowMetrics?.sampleCount ?? 0,
    durationSeconds: windowMetrics?.durationSeconds ?? 0,
    mediolateral: {
      standardDeviation: windowMetrics?.sway?.mediolateral?.standardDeviation ?? null,
      range: windowMetrics?.sway?.mediolateral?.range ?? null,
      meanAbsoluteVelocity: windowMetrics?.sway?.mediolateral?.meanAbsoluteVelocity ?? null,
    },
    anteriorPosterior: {
      standardDeviation: windowMetrics?.sway?.anteriorPosterior?.standardDeviation ?? null,
      range: windowMetrics?.sway?.anteriorPosterior?.range ?? null,
      meanAbsoluteVelocity: windowMetrics?.sway?.anteriorPosterior?.meanAbsoluteVelocity ?? null,
      axis: windowMetrics?.sway?.anteriorPosteriorAxis ?? null,
    },
    footMovement: {
      exitObserved: Boolean(windowMetrics?.footMovement?.exitObserved),
      firstExitAxis: windowMetrics?.footMovement?.firstExitAxis ?? null,
      maxDisplacementRatio: windowMetrics?.footMovement?.maxDisplacementRatio ?? null,
      maxMediolateralDisplacementRatio: windowMetrics?.footMovement?.maxMediolateralDisplacementRatio ?? null,
      maxAnteriorPosteriorDisplacementRatio: windowMetrics?.footMovement?.maxAnteriorPosteriorDisplacementRatio ?? null,
    },
  };
}

function buildEvaluation(rule, matched, evidence, missingInputs = []) {
  return {
    ruleId: rule.id,
    weakAreaId: rule.weakAreaId,
    matched,
    references: rule.references,
    thresholds: rule.thresholds,
    evidence,
    missingInputs,
  };
}

function weakAreaFromEvaluation(evaluation) {
  return {
    id: evaluation.weakAreaId,
    label: WeakAreaLabels[evaluation.weakAreaId],
    references: evaluation.references,
    resultKeys: WeakAreaResultKeys[evaluation.weakAreaId],
    matchedRuleIds: [evaluation.ruleId],
    evidence: evaluation.evidence,
  };
}

function evaluateAnkleStrategy(balanceResult, rule) {
  const stage = stageById(balanceResult, 'tandem');
  const windowMetrics = stage?.[rule.windowKey];
  const staticMetrics = stage?.staticHold;
  const thresholds = rule.thresholds;
  const missingInputs = [];

  if (!stage) missingInputs.push('balanceResult.stageById.tandem');
  if (!windowMetrics) missingInputs.push('balanceResult.stageById.tandem.dynamicAdjustment');
  if ((windowMetrics?.sampleCount ?? 0) < thresholds.minDynamicSampleCount) {
    missingInputs.push('balanceResult.stageById.tandem.dynamicAdjustment.sampleCount');
  }

  const ap = windowMetrics?.sway?.anteriorPosterior || {};
  const ml = windowMetrics?.sway?.mediolateral || {};
  const staticAp = staticMetrics?.sway?.anteriorPosterior || {};
  const apPrimary = firstFinite(ap.standardDeviation, ap.range, ap.meanAbsoluteVelocity);
  const mlPrimary = firstFinite(ml.standardDeviation, ml.range, ml.meanAbsoluteVelocity);
  const apMagnitudeHigh = metricAtLeast(ap.standardDeviation, thresholds.minAnteriorPosteriorStdDevRatio)
    || metricAtLeast(ap.range, thresholds.minAnteriorPosteriorRangeRatio)
    || metricAtLeast(ap.meanAbsoluteVelocity, thresholds.minAnteriorPosteriorMeanVelocityRatioPerSec);
  const apDominant = axisDominates(apPrimary, mlPrimary, thresholds.anteriorPosteriorToMediolateralDominanceRatio);
  const dynamicOverStatic = staticAp.standardDeviation === null || staticAp.standardDeviation === undefined
    || axisDominates(ap.standardDeviation, staticAp.standardDeviation, thresholds.dynamicToStaticStdDevRatio);
  const anteriorPosteriorExit = axisExitObserved(
    windowMetrics?.footMovement,
    'anteriorPosterior',
    thresholds.minAnteriorPosteriorFootExitRatio,
  );
  const anteriorPosteriorSway = apMagnitudeHigh && apDominant && dynamicOverStatic;
  const matched = missingInputs.length === 0 && (anteriorPosteriorSway || anteriorPosteriorExit);

  return buildEvaluation(rule, matched, {
    stageId: 'tandem',
    windowKey: rule.windowKey,
    dynamicAdjustmentSeconds: balanceResult?.dynamicAdjustmentSeconds ?? null,
    anteriorPosteriorSway,
    anteriorPosteriorExit,
    metrics: metricSummary(windowMetrics),
    staticAnteriorPosteriorStdDev: staticAp.standardDeviation ?? null,
  }, missingInputs);
}

function evaluateHipAbductor(balanceResult, rule) {
  const thresholds = rule.thresholds;
  const stageEvaluations = rule.stageIds.map((stageId) => {
    const stage = stageById(balanceResult, stageId);
    const windowMetrics = stage?.[rule.windowKey];
    const ml = windowMetrics?.sway?.mediolateral || {};
    const ap = windowMetrics?.sway?.anteriorPosterior || {};
    const mlPrimary = firstFinite(ml.standardDeviation, ml.range, ml.meanAbsoluteVelocity);
    const apPrimary = firstFinite(ap.standardDeviation, ap.range, ap.meanAbsoluteVelocity);
    const mediolateralMagnitudeHigh = metricAtLeast(ml.standardDeviation, thresholds.minMediolateralStdDevRatio)
      || metricAtLeast(ml.range, thresholds.minMediolateralRangeRatio)
      || metricAtLeast(ml.meanAbsoluteVelocity, thresholds.minMediolateralMeanVelocityRatioPerSec);
    const mediolateralDominant = axisDominates(mlPrimary, apPrimary, thresholds.mediolateralToAnteriorPosteriorDominanceRatio);
    const mediolateralSway = mediolateralMagnitudeHigh && mediolateralDominant;
    const mediolateralExit = axisExitObserved(
      windowMetrics?.footMovement,
      'mediolateral',
      thresholds.minMediolateralFootExitRatio,
    );

    return {
      stageId,
      available: Boolean(stage && windowMetrics && (windowMetrics.sampleCount ?? 0) > 0),
      mediolateralSway,
      mediolateralExit,
      metrics: metricSummary(windowMetrics),
    };
  });
  const missingInputs = stageEvaluations.every((stage) => !stage.available)
    ? ['balanceResult.stageById.semi_tandem.totalHold', 'balanceResult.stageById.tandem.totalHold']
    : [];
  const matched = missingInputs.length === 0
    && stageEvaluations.some((stage) => stage.mediolateralSway || stage.mediolateralExit);

  return buildEvaluation(rule, matched, {
    windowKey: rule.windowKey,
    stages: stageEvaluations,
  }, missingInputs);
}

function chairStandResultFrom(input) {
  return input?.chairStandResult || input || null;
}

function evaluateLowerLimbEndurance(chairStandInput, rule, { ageYears, gender, profile } = {}) {
  const chairStandResult = chairStandResultFrom(chairStandInput);
  const thresholds = rule.thresholds;
  const repetitionCount = finiteNumber(chairStandResult?.repetitionCount ?? chairStandInput?.repetitionCount ?? chairStandInput?.primaryValue);
  const resolvedAgeYears = finiteNumber(ageYears) ?? ageYearsFromProfile(profile);
  const resolvedGender = normalizeSteadiGender(gender ?? profile?.gender ?? profile?.sex);
  const repetitionThreshold = chairStandBelowAverageThreshold(resolvedAgeYears, resolvedGender);
  const trunkForwardLean = chairStandResult?.aggregate?.trunkForwardLean
    || chairStandInput?.trunkForwardLean
    || {};
  const leanMean = finiteNumber(trunkForwardLean.angleMeanDegrees);
  const leanMax = finiteNumber(trunkForwardLean.angleMaxDegrees);
  const scoreMean = finiteNumber(trunkForwardLean.scoreMean);
  const missingInputs = [];

  if (repetitionCount === null) missingInputs.push('chairStandResult.repetitionCount');
  if (resolvedAgeYears === null) missingInputs.push('ageYears');
  if (!resolvedGender) missingInputs.push('gender');
  if (resolvedAgeYears !== null && resolvedGender && repetitionThreshold === null) {
    missingInputs.push('chairStandBelowAverageThreshold');
  }
  if (leanMean === null && leanMax === null && scoreMean === null) {
    missingInputs.push('chairStandResult.aggregate.trunkForwardLean');
  }

  const lowRepetitionCount = repetitionCount !== null
    && repetitionThreshold !== null
    && repetitionCount < repetitionThreshold;
  const trunkForwardLeanLarge = metricAtLeast(leanMean, thresholds.minTrunkForwardLeanMeanDegrees)
    || metricAtLeast(leanMax, thresholds.minTrunkForwardLeanMaxDegrees)
    || (scoreMean !== null && scoreMean <= thresholds.maxTrunkLeanScoreMean);
  const matched = missingInputs.length === 0 && lowRepetitionCount && trunkForwardLeanLarge;

  return buildEvaluation(rule, matched, {
    repetitionCount,
    lowRepetitionCount,
    repetitionThreshold,
    ageYears: resolvedAgeYears,
    gender: resolvedGender,
    trunkForwardLeanLarge,
    trunkForwardLean: {
      angleMeanDegrees: leanMean,
      angleMaxDegrees: leanMax,
      scoreMean,
    },
  }, missingInputs);
}

export function inspectWeakAreaInputs({ balanceResult, chairStandResult } = {}) {
  const tandem = stageById(balanceResult, 'tandem');
  const semiTandem = stageById(balanceResult, 'semi_tandem');
  const tandemDynamic = tandem?.dynamicAdjustment;
  const directionalFootMovement = tandemDynamic?.footMovement
    && 'maxMediolateralDisplacementRatio' in tandemDynamic.footMovement
    && 'maxAnteriorPosteriorDisplacementRatio' in tandemDynamic.footMovement;
  const resolvedChairStand = chairStandResultFrom(chairStandResult);

  return {
    hasBalanceResult: Boolean(balanceResult),
    hasDynamicStaticSplit: Boolean(tandem?.dynamicAdjustment && tandem?.staticHold),
    hasDirectionalSway: Boolean(tandemDynamic?.sway?.mediolateral && tandemDynamic?.sway?.anteriorPosterior),
    hasDirectionalFootMovement: Boolean(directionalFootMovement),
    hasSemiTandemOrTandemTotalHold: Boolean(semiTandem?.totalHold || tandem?.totalHold),
    hasChairStandResult: Boolean(resolvedChairStand),
    hasChairStandRepetitionCount: finiteNumber(resolvedChairStand?.repetitionCount) !== null,
    hasTrunkForwardLean: Boolean(resolvedChairStand?.aggregate?.trunkForwardLean || chairStandResult?.trunkForwardLean),
  };
}

export function analyzeWeakAreaResult({
  balanceResult,
  chairStandResult,
  ageYears,
  gender,
  profile,
} = {}, configInput = {}) {
  const config = mergeRuleConfig(configInput);
  const evaluations = {
    ankleStrategyProprioception: evaluateAnkleStrategy(
      balanceResult,
      config.rules.ankleStrategyProprioception,
    ),
    hipAbductorMediolateralControl: evaluateHipAbductor(
      balanceResult,
      config.rules.hipAbductorMediolateralControl,
    ),
    lowerLimbMuscularEndurance: evaluateLowerLimbEndurance(
      chairStandResult,
      config.rules.lowerLimbMuscularEndurance,
      { ageYears, gender, profile },
    ),
  };
  const weakAreas = Object.values(evaluations)
    .filter((evaluation) => evaluation.matched)
    .map(weakAreaFromEvaluation);
  const missingInputs = [...new Set(Object.values(evaluations).flatMap((evaluation) => evaluation.missingInputs))];

  return {
    schemaVersion: WEAK_AREA_RESULT_SCHEMA_VERSION,
    weakAreas,
    weakAreaIds: weakAreas.map((area) => area.id),
    inputChecks: inspectWeakAreaInputs({ balanceResult, chairStandResult }),
    complete: missingInputs.length === 0,
    missingInputs,
    ruleEvaluations: evaluations,
  };
}

export function identifyWeakAreas(input = {}, configInput = {}) {
  return analyzeWeakAreaResult(input, configInput).weakAreas;
}
