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

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const { analyzeChairStandSeries } = await server.ssrLoadModule('/client/src/pose/chairStandAnalyzer.js');

  const twoStandsWithoutFinalSit = analyzeChairStandSeries([
    poseFrame('seated', 0),
    poseFrame('seated', 200),
    poseFrame('standing', 400),
    poseFrame('seated', 800),
    poseFrame('seated', 1000),
    poseFrame('standing', 1200),
  ]);
  assert.equal(twoStandsWithoutFinalSit.repetitionCount, 2);

  const startsStandingThenSitsThenStands = analyzeChairStandSeries([
    poseFrame('standing', 0),
    poseFrame('standing', 200),
    poseFrame('seated', 400),
    poseFrame('seated', 600),
    poseFrame('standing', 800),
  ]);
  assert.equal(startsStandingThenSitsThenStands.repetitionCount, 1);

  console.log('Chair stand count checks passed.');
} finally {
  await server.close();
}
