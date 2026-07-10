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

function chairStandResult() {
  return {
    testType: 'chair_stand',
    primaryValue: 9,
    repetitionCount: 9,
    confidence: 0.94,
    trackingQualityScore: 0.91,
    chairStandResult: {
      schemaVersion: 'chair_stand_result.v1',
      testType: 'chair_stand',
      repetitionCount: 9,
      aggregate: {
        trunkForwardLean: {
          angleMeanDegrees: 16,
          angleMaxDegrees: 22,
          scoreMean: 0.42,
        },
        extensionAngularVelocityDegPerSec: {
          knee: { meanOfRepMeans: 52 },
          hip: { meanOfRepMeans: 42 },
        },
        sittingSpeed: {
          meanDurationSeconds: 1.2,
          meanHipDescentVelocityBodyHeightsPerSec: 0.2,
        },
      },
    },
  };
}

try {
  const {
    CarePipelineStageIds,
    runCareOrchestrationPipeline,
  } = await server.ssrLoadModule('/client/src/agents/careOrchestrationAgent.js');

  const profile = {
    ageYears: 70,
    gender: 'female',
    steadiStep1: {
      fallenPastYear: false,
      feelsUnsteady: true,
      worriesAboutFalling: false,
      fallCountPastYear: 0,
      fallInjuryPastYear: false,
    },
  };

  const pipeline = runCareOrchestrationPipeline({
    result: chairStandResult(),
    profile,
    historyItems: [],
  });

  assert.deepEqual(pipeline.stageOrder, [
    CarePipelineStageIds.SteadiAssessment,
    CarePipelineStageIds.MotionAnalysisSystem,
    CarePipelineStageIds.PoseJudgement,
    CarePipelineStageIds.OtagoPrescription,
    CarePipelineStageIds.CareOrchestrationAgent,
  ]);
  assert.equal(pipeline.stages.steadiAssessment.atRisk, true);
  assert.equal(pipeline.stages.motionAnalysis.qualityGate.passed, true);
  assert.equal(pipeline.stages.poseJudgement.outputs.nChair, 9);
  assert.ok(pipeline.stages.otagoPrescription.recommendedExercises.length > 0);
  assert.ok(
    pipeline.finalResultPatch.recommendedExercises.some((exercise) => (
      exercise.exerciseKey === 'knee_extension' || exercise.exerciseKey === 'chair_stand'
    )),
  );
  assert.equal(pipeline.agent.decision.priority, 'exercise_practice');
  assert.equal(pipeline.agent.toolTrace.length >= 5, true);

  const unsupported = runCareOrchestrationPipeline({
    result: {
      testType: 'timed_up_and_go',
      primaryValue: 12.4,
      confidence: 0.9,
    },
    profile,
  });
  assert.equal(unsupported.stages.poseJudgement.supportedInV1, false);
  assert.equal(unsupported.agent.decision.priority, 'use_v1_assessment');
  assert.equal(unsupported.finalResultPatch.recommendedExercises.length, 0);

  console.log(`Care pipeline stages: ${pipeline.stageOrder.join(' -> ')}`);
  console.log(`Agent next action: ${pipeline.agent.decision.nextAction}`);
  console.log('Care orchestration checks passed.');
} finally {
  await server.close();
}
