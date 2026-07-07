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

try {
  const {
    WeakAreaLabels,
  } = await server.ssrLoadModule('/client/src/pose/weakAreaRules.js');
  const {
    OtagoExerciseKeys,
    otagoRecommendationsForWeakAreas,
    recommendationTemplatesForResult,
  } = await server.ssrLoadModule('/client/src/pose/recommendationRules.js');

  const cases = [
    {
      label: WeakAreaLabels.hip_abductor_mediolateral_control,
      expectedKeys: [OtagoExerciseKeys.SideHipStrengthening],
      expectedNames: ['Side Hip Strengthening'],
    },
    {
      label: WeakAreaLabels.lower_limb_muscular_endurance,
      expectedKeys: [OtagoExerciseKeys.KneeExtension, OtagoExerciseKeys.ChairStand],
      expectedNames: ['Knee Extension', 'Sit to Stand'],
    },
    {
      label: WeakAreaLabels.ankle_strategy_proprioception,
      expectedKeys: [OtagoExerciseKeys.TandemStance, OtagoExerciseKeys.TandemWalk, OtagoExerciseKeys.OneLegStance],
      expectedNames: ['Tandem Stance', 'Tandem Walk', 'One-leg Stance'],
    },
  ];

  for (const testCase of cases) {
    const recommendations = otagoRecommendationsForWeakAreas([testCase.label]);
    assert.deepEqual(recommendations.map((item) => item.exerciseKey), testCase.expectedKeys, testCase.label);
    assert.deepEqual(recommendations.map((item) => item.otagoName), testCase.expectedNames, testCase.label);
    assert.ok(recommendations.every((item) => item.recommendationRole === 'primary'), testCase.label);

    const resultRecommendations = recommendationTemplatesForResult({
      weakAreas: [{ label: testCase.label }],
      recommendationLevel: 'steady',
      testType: 'chair_stand',
    });
    assert.deepEqual(resultRecommendations.map((item) => item.exerciseKey), testCase.expectedKeys, testCase.label);
    console.log(`${testCase.label}: ${testCase.expectedNames.join(' + ')}`);
  }
} finally {
  await server.close();
}
