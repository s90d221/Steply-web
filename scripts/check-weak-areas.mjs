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

function axis({ sd = 0.01, range = 0.03, velocity = 0.01 } = {}) {
  return {
    standardDeviation: sd,
    range,
    meanAbsoluteVelocity: velocity,
    pathLength: range,
  };
}

function footMovement({ mediolateral = 0.01, anteriorPosterior = 0.01, threshold = 0.16 } = {}) {
  const exitMl = mediolateral >= threshold;
  const exitAp = anteriorPosterior >= threshold;
  return {
    sampleCount: 30,
    exitObserved: exitMl || exitAp,
    exitFrameCount: exitMl || exitAp ? 2 : 0,
    firstExitAtMs: exitMl || exitAp ? 1200 : null,
    firstExitAxis: exitMl ? 'mediolateral' : exitAp ? 'anteriorPosterior' : null,
    maxDisplacementRatio: Math.hypot(mediolateral, anteriorPosterior),
    maxMediolateralDisplacementRatio: mediolateral,
    maxAnteriorPosteriorDisplacementRatio: anteriorPosterior,
    thresholdRatio: threshold,
    exitByAxis: {
      mediolateral: { observed: exitMl, frameCount: exitMl ? 2 : 0, firstObservedAtMs: exitMl ? 1200 : null },
      anteriorPosterior: { observed: exitAp, frameCount: exitAp ? 2 : 0, firstObservedAtMs: exitAp ? 1200 : null },
    },
    byFoot: {},
  };
}

function windowMetrics({
  ml = axis(),
  ap = axis(),
  foot = footMovement(),
  sampleCount = 30,
  durationSeconds = 3.2,
} = {}) {
  return {
    sampleCount,
    durationSeconds,
    sway: {
      mediolateral: ml,
      anteriorPosterior: ap,
      anteriorPosteriorAxis: 'z',
    },
    ankleAngleChange: {},
    trunkLeanDegrees: {},
    footMovement: foot,
    handSupport: { possible: false, frameCount: 0, frameRatio: 0, firstObservedAtMs: null, sides: [] },
  };
}

function balanceStage(id, overrides = {}) {
  const quietDynamic = windowMetrics();
  const quietStatic = windowMetrics({ sampleCount: 60, durationSeconds: 6.8 });
  return {
    id,
    title: id,
    status: 'completed',
    targetHoldSeconds: 10,
    holdSeconds: 10,
    dynamicAdjustment: overrides.dynamicAdjustment || quietDynamic,
    staticHold: overrides.staticHold || quietStatic,
    totalHold: overrides.totalHold || quietStatic,
  };
}

function balanceResult(overrides = {}) {
  const stages = [
    balanceStage('side_by_side'),
    balanceStage('semi_tandem', overrides.semi_tandem),
    balanceStage('tandem', overrides.tandem),
    balanceStage('one_leg'),
  ];
  return {
    schemaVersion: 'balance_result.v1',
    testType: 'four_stage_balance',
    dynamicAdjustmentSeconds: 3.5,
    frameCount: 120,
    stages,
    stageById: Object.fromEntries(stages.map((stage) => [stage.id, stage])),
  };
}

function chairStandResult({ reps = 12, leanMean = 5, leanMax = 8, leanScore = 0.9 } = {}) {
  return {
    schemaVersion: 'chair_stand_result.v1',
    testType: 'chair_stand',
    repetitionCount: reps,
    aggregate: {
      trunkForwardLean: {
        angleMeanDegrees: leanMean,
        angleMaxDegrees: leanMax,
        scoreMean: leanScore,
      },
    },
  };
}

try {
  const {
    WeakAreaIds,
    analyzeWeakAreaResult,
    identifyWeakAreas,
  } = await server.ssrLoadModule('/client/src/pose/weakAreaRules.js');

  const profile = { ageYears: 70, gender: 'female' };
  const cases = [
    {
      name: 'ankle pattern',
      input: {
        profile,
        chairStandResult: chairStandResult(),
        balanceResult: balanceResult({
          tandem: {
            dynamicAdjustment: windowMetrics({
              ap: axis({ sd: 0.06, range: 0.15, velocity: 0.08 }),
              ml: axis({ sd: 0.02, range: 0.04, velocity: 0.02 }),
              foot: footMovement({ anteriorPosterior: 0.18, mediolateral: 0.02 }),
            }),
            staticHold: windowMetrics({
              ap: axis({ sd: 0.02, range: 0.04, velocity: 0.02 }),
              ml: axis({ sd: 0.02, range: 0.04, velocity: 0.02 }),
              sampleCount: 60,
              durationSeconds: 6.8,
            }),
          },
        }),
      },
      expected: WeakAreaIds.AnkleStrategyProprioception,
    },
    {
      name: 'hip abductor pattern',
      input: {
        profile,
        chairStandResult: chairStandResult(),
        balanceResult: balanceResult({
          semi_tandem: {
            totalHold: windowMetrics({
              ml: axis({ sd: 0.07, range: 0.18, velocity: 0.08 }),
              ap: axis({ sd: 0.02, range: 0.04, velocity: 0.02 }),
              foot: footMovement({ mediolateral: 0.18, anteriorPosterior: 0.02 }),
              sampleCount: 90,
              durationSeconds: 10,
            }),
          },
        }),
      },
      expected: WeakAreaIds.HipAbductorMediolateralControl,
    },
    {
      name: 'lower-limb endurance pattern',
      input: {
        profile,
        balanceResult: balanceResult(),
        chairStandResult: chairStandResult({ reps: 9, leanMean: 16, leanMax: 22, leanScore: 0.42 }),
      },
      expected: WeakAreaIds.LowerLimbMuscularEndurance,
    },
  ];

  for (const testCase of cases) {
    const result = analyzeWeakAreaResult(testCase.input);
    const ids = result.weakAreaIds;
    assert.equal(result.complete, true, testCase.name);
    assert.deepEqual(ids, [testCase.expected], testCase.name);
    assert.deepEqual(identifyWeakAreas(testCase.input).map((area) => area.id), [testCase.expected], testCase.name);
    console.log(`${testCase.name}: ${ids.join(', ')}`);
  }
} finally {
  await server.close();
}
