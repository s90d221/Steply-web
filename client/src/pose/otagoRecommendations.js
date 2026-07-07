import { WeakAreaIds, WeakAreaLabels } from './weakAreaRules';

export const OTAGO_RECOMMENDATION_SCHEMA_VERSION = 'otago_recommendation.v1';

export const OtagoExerciseKeys = {
  SideHipStrengthening: 'side_hip_strengthening',
  KneeExtension: 'knee_extension',
  ChairStand: 'chair_stand',
  TandemStance: 'tandem_stance',
  TandemWalk: 'tandem_walk',
  OneLegStance: 'one_leg_stance',
};

export const OtagoExerciseCatalog = {
  [OtagoExerciseKeys.SideHipStrengthening]: {
    exerciseKey: OtagoExerciseKeys.SideHipStrengthening,
    title: 'Side Hip Strengthening',
    otagoName: 'Side Hip Strengthening',
    displayNameKo: 'Side Hip Strengthening',
    description: 'Hold stable support and lift one leg gently out to the side, then lower with control.',
    safetyNote: 'Use a chair or rail for support and keep the trunk upright.',
    durationSeconds: 60,
    arInputKey: 'side_leg_raise',
  },
  [OtagoExerciseKeys.KneeExtension]: {
    exerciseKey: OtagoExerciseKeys.KneeExtension,
    title: 'Knee Extension',
    otagoName: 'Knee Extension',
    displayNameKo: 'Knee Extension',
    description: 'Sit tall and slowly straighten one knee, pause, then lower the foot with control.',
    safetyNote: 'Keep the thigh supported by the chair and stop if knee pain appears.',
    durationSeconds: 60,
    arInputKey: 'knee_extension',
  },
  [OtagoExerciseKeys.ChairStand]: {
    exerciseKey: OtagoExerciseKeys.ChairStand,
    title: 'Repeated Chair Stands',
    otagoName: 'Sit to Stand',
    displayNameKo: 'Repeated Chair Stands',
    description: 'Stand up from a stable chair and sit back down slowly with even weight through both feet.',
    safetyNote: 'Keep the chair against a wall and use support if needed.',
    durationSeconds: 60,
    arInputKey: 'sit_to_stand',
  },
  [OtagoExerciseKeys.TandemStance]: {
    exerciseKey: OtagoExerciseKeys.TandemStance,
    title: 'Tandem Stance',
    otagoName: 'Tandem Stance',
    displayNameKo: 'Tandem Stance',
    description: 'Stand with one foot directly in front of the other and hold the position with support nearby.',
    safetyNote: 'Practice beside a stable surface and step out if balance is lost.',
    durationSeconds: 30,
    arInputKey: 'tandem_stance',
  },
  [OtagoExerciseKeys.TandemWalk]: {
    exerciseKey: OtagoExerciseKeys.TandemWalk,
    title: 'Tandem Walk',
    otagoName: 'Tandem Walk',
    displayNameKo: 'Tandem Walk',
    description: 'Walk slowly heel-to-toe along a clear path while keeping support within reach.',
    safetyNote: 'Use a hallway rail or caregiver support when needed.',
    durationSeconds: 45,
    arInputKey: 'tandem_walk',
  },
  [OtagoExerciseKeys.OneLegStance]: {
    exerciseKey: OtagoExerciseKeys.OneLegStance,
    title: 'One-leg Stance',
    otagoName: 'One-leg Stance',
    displayNameKo: 'One-leg Stance',
    description: 'Hold stable support and practice standing on one leg for a short controlled hold.',
    safetyNote: 'Keep both hands close to support and lower the foot before you feel unstable.',
    durationSeconds: 30,
    arInputKey: 'one_leg_stance',
  },
};

export const WeakAreaToOtagoExerciseMap = {
  // Spec 4.3 [21][23]: hip abductor weakness maps directly to Otago side hip strengthening.
  [WeakAreaIds.HipAbductorMediolateralControl]: [
    OtagoExerciseKeys.SideHipStrengthening,
  ],
  // Spec 4.3 [21][23]: quadriceps/glute endurance weakness maps to Otago knee extension plus chair stands.
  [WeakAreaIds.LowerLimbMuscularEndurance]: [
    OtagoExerciseKeys.KneeExtension,
    OtagoExerciseKeys.ChairStand,
  ],
  // Spec 4.3 [15][21]: ankle strategy/proprioception weakness maps to balance retraining tasks.
  [WeakAreaIds.AnkleStrategyProprioception]: [
    OtagoExerciseKeys.TandemStance,
    OtagoExerciseKeys.TandemWalk,
    OtagoExerciseKeys.OneLegStance,
  ],
};

const WeakAreaIdByLabel = Object.fromEntries(
  Object.entries(WeakAreaLabels).map(([id, label]) => [label, id]),
);

function weakAreaInputsFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.weakAreas)) return value.weakAreas;
  if (Array.isArray(value.weakAreaIds)) return value.weakAreaIds;
  if (value.weakAreaResult) return weakAreaInputsFrom(value.weakAreaResult);
  return [value];
}

export function normalizeWeakAreaId(weakArea) {
  if (!weakArea) return null;
  const raw = typeof weakArea === 'string'
    ? weakArea
    : weakArea.id || weakArea.weakAreaId || weakArea.label;
  if (!raw) return null;
  if (WeakAreaToOtagoExerciseMap[raw]) return raw;
  return WeakAreaIdByLabel[raw] || null;
}

export function otagoExerciseKeysForWeakAreas(weakAreaInput) {
  const exerciseKeys = [];
  const seen = new Set();
  for (const weakArea of weakAreaInputsFrom(weakAreaInput)) {
    const weakAreaId = normalizeWeakAreaId(weakArea);
    const keys = WeakAreaToOtagoExerciseMap[weakAreaId] || [];
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      exerciseKeys.push({ key, weakAreaId });
    }
  }
  return exerciseKeys;
}

export function otagoRecommendationsForWeakAreas(weakAreaInput) {
  return otagoExerciseKeysForWeakAreas(weakAreaInput).map(({ key, weakAreaId }) => ({
    ...OtagoExerciseCatalog[key],
    schemaVersion: OTAGO_RECOMMENDATION_SCHEMA_VERSION,
    recommendationRole: 'primary',
    source: 'otago_exercise_program',
    weakAreaId,
    weakAreaLabel: WeakAreaLabels[weakAreaId],
    references: key === OtagoExerciseKeys.TandemStance
      || key === OtagoExerciseKeys.TandemWalk
      || key === OtagoExerciseKeys.OneLegStance
      ? ['[15]', '[21]']
      : ['[21]', '[23]'],
  }));
}
