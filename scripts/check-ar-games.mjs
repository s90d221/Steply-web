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

function point(name, x, y, z = 0) {
  return { name, x, y, z, visibility: 0.99 };
}

function baseLandmarks(overrides = {}) {
  const values = {
    left_shoulder: [0.42, 0.28],
    right_shoulder: [0.58, 0.28],
    left_hip: [0.44, 0.52],
    right_hip: [0.56, 0.52],
    left_knee: [0.44, 0.70],
    right_knee: [0.56, 0.70],
    left_ankle: [0.44, 0.88],
    right_ankle: [0.56, 0.88],
    ...overrides,
  };
  return Object.entries(values).map(([name, coords]) => point(name, coords[0], coords[1], coords[2] || 0));
}

function runFrames({ module, recommendation, frames }) {
  const gameType = module.gameTypeForRecommendation(recommendation);
  let state = module.createInitialArGameState(gameType);
  frames.forEach((landmarks, index) => {
    state = module.updateArExerciseGame(state, {
      landmarks,
      recommendation,
      timestampMs: index * 600,
    });
  });
  return state;
}

try {
  const engine = await server.ssrLoadModule('/client/src/pose/arExerciseEngine.js');
  const {
    OtagoExerciseCatalog,
    OtagoExerciseKeys,
  } = await server.ssrLoadModule('/client/src/pose/otagoRecommendations.js');

  assert.equal(
    engine.gameTypeForRecommendation(OtagoExerciseCatalog[OtagoExerciseKeys.SideHipStrengthening]),
    engine.ArExerciseGameTypes.BubbleLegRaise,
  );
  assert.equal(
    engine.gameTypeForRecommendation(OtagoExerciseCatalog[OtagoExerciseKeys.KneeExtension]),
    engine.ArExerciseGameTypes.StarKneeExtension,
  );
  assert.equal(
    engine.gameTypeForRecommendation(OtagoExerciseCatalog[OtagoExerciseKeys.TandemStance]),
    engine.ArExerciseGameTypes.ButterflyBalance,
  );

  const sideRaiseFrames = Array.from({ length: 10 }).flatMap(() => [
    baseLandmarks({ left_ankle: [0.44, 0.88] }),
    baseLandmarks({ left_ankle: [0.26, 0.83] }),
  ]);
  const sideRaiseState = runFrames({
    module: engine,
    recommendation: OtagoExerciseCatalog[OtagoExerciseKeys.SideHipStrengthening],
    frames: sideRaiseFrames,
  });
  assert.equal(sideRaiseState.count, 10);
  assert.equal(sideRaiseState.setComplete, true);

  const kneeExtensionFrames = Array.from({ length: 10 }).flatMap(() => [
    baseLandmarks({ left_ankle: [0.32, 0.76], right_ankle: [0.68, 0.76] }),
    baseLandmarks({ left_ankle: [0.44, 0.90], right_ankle: [0.56, 0.90] }),
  ]);
  const kneeState = runFrames({
    module: engine,
    recommendation: OtagoExerciseCatalog[OtagoExerciseKeys.KneeExtension],
    frames: kneeExtensionFrames,
  });
  assert.equal(kneeState.count, 10);
  assert.equal(kneeState.setComplete, true);

  let balanceState = engine.createInitialArGameState(engine.ArExerciseGameTypes.ButterflyBalance);
  for (let rep = 0; rep < 10; rep += 1) {
    balanceState = engine.updateArExerciseGame(balanceState, {
      landmarks: baseLandmarks({ left_ankle: [0.44, 0.72] }),
      recommendation: OtagoExerciseCatalog[OtagoExerciseKeys.OneLegStance],
      timestampMs: rep * 3600,
    });
    balanceState = engine.updateArExerciseGame(balanceState, {
      landmarks: baseLandmarks({ left_ankle: [0.44, 0.72] }),
      recommendation: OtagoExerciseCatalog[OtagoExerciseKeys.OneLegStance],
      timestampMs: rep * 3600 + 2800,
    });
    balanceState = engine.updateArExerciseGame(balanceState, {
      landmarks: baseLandmarks({ left_ankle: [0.44, 0.88] }),
      recommendation: OtagoExerciseCatalog[OtagoExerciseKeys.OneLegStance],
      timestampMs: rep * 3600 + 3300,
    });
  }
  assert.equal(balanceState.count, 10);
  assert.equal(balanceState.setComplete, true);

  console.log('bubble leg raise: 10/10');
  console.log('star knee extension: 10/10');
  console.log('butterfly balance: 10/10');
} finally {
  await server.close();
}
