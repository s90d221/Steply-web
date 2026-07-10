import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const point = (name, x, y, visibility = 0.95) => ({ name, x, y, z: 0, visibility });

function poseFrame(phase, timestampMs) {
  const standing = phase === 'standing';
  const left = 0.44;
  const right = 0.56;
  const shoulderY = standing ? 0.28 : 0.35;
  const hipY = standing ? 0.48 : 0.70;
  const kneeY = standing ? 0.68 : 0.62;
  const ankleY = 0.88;
  const kneeOffset = standing ? 0 : 0.03;

  return {
    timestampMs,
    confidence: 0.95,
    landmarks: [
      point('left_shoulder', left, shoulderY),
      point('right_shoulder', right, shoulderY),
      point('left_hip', left, hipY),
      point('right_hip', right, hipY),
      point('left_knee', left - kneeOffset, kneeY),
      point('right_knee', right + kneeOffset, kneeY),
      point('left_ankle', left, ankleY),
      point('right_ankle', right, ankleY),
    ],
  };
}

function sidePoseFrame(phase, timestampMs) {
  const standing = phase === 'standing';
  const shoulderY = standing ? 0.28 : 0.35;
  const hipY = standing ? 0.48 : 0.70;
  const kneeY = standing ? 0.68 : 0.62;
  const ankleY = 0.88;
  const kneeX = standing ? 0.46 : 0.43;

  return {
    timestampMs,
    confidence: 0.95,
    landmarks: [
      point('left_shoulder', 0.45, shoulderY),
      point('left_hip', 0.45, hipY),
      point('left_knee', kneeX, kneeY),
      point('left_ankle', 0.45, ankleY),
      point('right_shoulder', 0.58, shoulderY, 0.05),
      point('right_hip', 0.58, hipY, 0.05),
      point('right_knee', 0.58, kneeY, 0.05),
      point('right_ankle', 0.58, ankleY, 0.05),
    ],
  };
}

function partialStandFrame(timestampMs) {
  const frame = poseFrame('standing', timestampMs);
  return {
    ...frame,
    landmarks: [
      point('left_shoulder', 0.44, 0.31),
      point('right_shoulder', 0.56, 0.31),
      point('left_hip', 0.44, 0.58),
      point('right_hip', 0.56, 0.58),
      point('left_knee', 0.43, 0.66),
      point('right_knee', 0.57, 0.66),
      point('left_ankle', 0.44, 0.88),
      point('right_ankle', 0.56, 0.88),
    ],
    metrics: {
      jointAngles: {
        knees: { left: 140, right: 140, average: 140 },
        hips: { left: 145, right: 145, average: 145 },
        ankles: { left: 90, right: 90, average: 90 },
      },
      angularVelocities: {
        knees: { left: 20, right: 20, average: 20 },
        hips: { left: 18, right: 18, average: 18 },
        ankles: { left: 0, right: 0, average: 0 },
      },
    },
  };
}

function risingFrame(timestampMs) {
  return {
    timestampMs,
    confidence: 0.95,
    landmarks: [
      point('left_shoulder', 0.44, 0.32),
      point('right_shoulder', 0.56, 0.32),
      point('left_hip', 0.44, 0.60),
      point('right_hip', 0.56, 0.60),
      point('left_knee', 0.43, 0.66),
      point('right_knee', 0.57, 0.66),
      point('left_ankle', 0.44, 0.88),
      point('right_ankle', 0.56, 0.88),
    ],
    metrics: {
      jointAngles: {
        knees: { left: 140, right: 140, average: 140 },
        hips: { left: 145, right: 145, average: 145 },
        ankles: { left: 90, right: 90, average: 90 },
      },
      angularVelocities: {
        knees: { left: 28, right: 28, average: 28 },
        hips: { left: 24, right: 24, average: 24 },
        ankles: { left: 0, right: 0, average: 0 },
      },
    },
  };
}

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const { analyzeChairStandSeries } = await server.ssrLoadModule('/client/src/pose/chairStandAnalyzer.js');
  const {
    createInitialArGameState,
    gameTypeForRecommendation,
    updateArExerciseGame,
  } = await server.ssrLoadModule('/client/src/pose/arExerciseEngine.js');

  const twoStandsWithoutFinalSit = analyzeChairStandSeries([
    poseFrame('seated', 0),
    poseFrame('seated', 200),
    poseFrame('standing', 400),
    poseFrame('seated', 800),
    poseFrame('seated', 1000),
    poseFrame('standing', 1200),
  ]);
  assert.equal(twoStandsWithoutFinalSit.repetitionCount, 2);

  const singleSeatedFrameThenStand = analyzeChairStandSeries([
    poseFrame('seated', 0),
    poseFrame('standing', 300),
  ]);
  assert.equal(singleSeatedFrameThenStand.repetitionCount, 1);

  const startsMidRiseThenStands = analyzeChairStandSeries([
    risingFrame(0),
    poseFrame('standing', 300),
  ]);
  assert.equal(startsMidRiseThenStands.repetitionCount, 1);

  const startsStandingOnly = analyzeChairStandSeries([
    poseFrame('standing', 0),
    poseFrame('standing', 300),
    poseFrame('standing', 600),
  ]);
  assert.equal(startsStandingOnly.repetitionCount, 0);

  const startsStandingThenSitsThenStands = analyzeChairStandSeries([
    poseFrame('standing', 0),
    poseFrame('standing', 200),
    poseFrame('seated', 400),
    poseFrame('seated', 600),
    poseFrame('standing', 800),
  ]);
  assert.equal(startsStandingThenSitsThenStands.repetitionCount, 1);

  const sideViewOneStand = analyzeChairStandSeries([
    sidePoseFrame('seated', 0),
    sidePoseFrame('seated', 200),
    sidePoseFrame('standing', 400),
  ]);
  assert.equal(sideViewOneStand.repetitionCount, 1);

  const incompleteStandAttempt = analyzeChairStandSeries([
    poseFrame('seated', 0),
    poseFrame('seated', 200),
    partialStandFrame(400),
    partialStandFrame(600),
    poseFrame('seated', 800),
    poseFrame('seated', 1000),
  ]);
  assert.equal(incompleteStandAttempt.repetitionCount, 0);
  assert.equal(incompleteStandAttempt.incompleteStandAttemptDetected, true);
  assert.equal(incompleteStandAttempt.failedStandAttemptCount, 1);

  const chairStandExercise = { id: 'chair_stand', exerciseKey: 'chair_stand', arInputKey: 'sit_to_stand', defaultReps: 10 };
  const chairStandGameType = gameTypeForRecommendation(chairStandExercise);
  let chairStandGameState = createInitialArGameState(chairStandGameType, chairStandExercise);
  chairStandGameState = updateArExerciseGame(chairStandGameState, {
    landmarks: risingFrame(0).landmarks,
    recommendation: chairStandExercise,
    timestampMs: 0,
  });
  chairStandGameState = updateArExerciseGame(chairStandGameState, {
    landmarks: poseFrame('standing', 300).landmarks,
    recommendation: chairStandExercise,
    timestampMs: 300,
  });
  assert.equal(chairStandGameState.count, 1);

  let alreadyStandingGameState = createInitialArGameState(chairStandGameType, chairStandExercise);
  alreadyStandingGameState = updateArExerciseGame(alreadyStandingGameState, {
    landmarks: poseFrame('standing', 0).landmarks,
    recommendation: chairStandExercise,
    timestampMs: 0,
  });
  alreadyStandingGameState = updateArExerciseGame(alreadyStandingGameState, {
    landmarks: poseFrame('standing', 300).landmarks,
    recommendation: chairStandExercise,
    timestampMs: 300,
  });
  assert.equal(alreadyStandingGameState.count, 0);

  console.log('Chair stand count checks passed.');
} finally {
  await server.close();
}
