import { PoseLandmarks, RequiredChairStandLandmarks } from './poseLandmarks';
import { SteadiAssessmentRules } from './steadiRules';
import { calculateExerciseDifficultyLevel } from './recommendationRules';
import { calculateAngularVelocities, calculateJointAngles } from './poseKinematics';
import { normalizePoseLandmarks } from './poseTimeSeries';

export const CHAIR_STAND_RESULT_SCHEMA_VERSION = 'chair_stand_result.v1';

const ChairStandPosePhase = {
  Unknown: 'unknown',
  Seated: 'seated',
  Rising: 'rising',
  Standing: 'standing',
};

const MIN_LANDMARK_VISIBILITY = 0.45;
const REQUIRED_STABLE_FRAMES = 2;
const ARM_SUPPORT_DISQUALIFY_FRAMES = 3;
const ARM_SUPPORT_Y_MARGIN = 0.05;
const STANDING_KNEE_ANGLE = 150;
const SEATED_KNEE_ANGLE = 128;
const HALFWAY_KNEE_ANGLE = 138;
const STANDING_HIP_MARGIN = 0.08;
const RISING_HIP_MARGIN = 0.04;
const SEATED_HIP_MARGIN = 0.03;
const HALFWAY_HIP_MARGIN = 0.03;
const TRUNK_WARNING_SCORE = 0.55;
const STABILITY_WARNING_SCORE = 0.45;
const STABILITY_SAMPLE_LIMIT = 20;
const MIN_STABILITY_SAMPLES = 4;
const MIN_VECTOR_MAGNITUDE = 0.0001;
const MIN_EXTENSION_VELOCITY_DEG_PER_SEC = 8;
const MIN_FLEXION_VELOCITY_DEG_PER_SEC = -8;
const MIN_HIP_DESCENT_BODY_HEIGHTS_PER_SEC = 0.04;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const averageOrNull = (values) => values.length ? clamp(values.reduce((sum, v) => sum + v, 0) / values.length, 0, 1) : null;
const meanOrNull = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};
const maxOrNull = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
};
const minOrNull = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : null;
};
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function angleDegrees(first, center, third) {
  const firstVectorX = first.x - center.x;
  const firstVectorY = first.y - center.y;
  const secondVectorX = third.x - center.x;
  const secondVectorY = third.y - center.y;
  const dot = firstVectorX * secondVectorX + firstVectorY * secondVectorY;
  const magnitude = Math.max(
    Math.hypot(firstVectorX, firstVectorY) * Math.hypot(secondVectorX, secondVectorY),
    MIN_VECTOR_MAGNITUDE,
  );
  return Math.acos(clamp(dot / magnitude, -1, 1)) * 180 / Math.PI;
}

function defaultState(repetitionCount = 0) {
  return {
    repetitionCount,
    primaryValue: repetitionCount,
    primaryLabel: 'Chair Stands',
    elapsedSeconds: 0,
    durationSeconds: SteadiAssessmentRules.ChairStandDurationSeconds,
    confidence: 0,
    isFullBodyVisible: false,
    warningMessage: 'Move back so the full body is visible in the camera.',
    postureMessage: 'When camera analysis is ready, standing reps will be counted automatically.',
    isArmUseSuspected: false,
    isStandingOrRising: false,
    phase: ChairStandPosePhase.Unknown,
  };
}

/**
 * @typedef {Object} JointVelocitySummary
 * @property {number|null} meanDegPerSec Mean positive extension or absolute flexion velocity.
 * @property {number|null} maxDegPerSec Maximum positive extension or absolute flexion velocity.
 * @property {number|null} leftMeanDegPerSec
 * @property {number|null} rightMeanDegPerSec
 *
 * @typedef {Object} ChairStandRepetitionResult
 * @property {number} index
 * @property {number} countedAtMs
 * @property {number|null} repIntervalSeconds
 * @property {Object} extension Knee/hip extension velocity observed while rising.
 * @property {Object|null} sitting Sitting segment after the counted stand, if observed.
 *
 * @typedef {Object} ChairStandResult
 * @property {'chair_stand_result.v1'} schemaVersion
 * @property {'chair_stand'} testType
 * @property {number} durationSeconds
 * @property {number} repetitionCount
 * @property {boolean} armUseDisqualified
 * @property {number} halfStandCredit
 * @property {ChairStandRepetitionResult[]} repetitions
 * @property {Object} aggregate Observation-only aggregate values for STEADI and weak-area inputs.
 */

export class MediaPipeChairStandAnalyzer {
  constructor({ durationSeconds = SteadiAssessmentRules.ChairStandDurationSeconds } = {}) {
    this.durationSeconds = durationSeconds;
    this.reset();
  }

  startSession(userId = 'remote-user', startedAt = Date.now()) {
    this.reset();
    this.userId = userId;
    this.startedAt = startedAt;
    this.latestTimestampMs = startedAt;
  }

  addFrame(frame) {
    if (this.startedAt === null) return this.latestState;
    const previousFeatures = this.latestFeatures;
    const previousTimestampMs = this.latestTimestampMs;
    const features = this.toChairStandFeatures(frame, { previousFeatures, previousTimestampMs });
    this.latestTimestampMs = frame.timestampMs;
    this.latestFeatures = features;

    if (!features) {
      this.latestState = this.stateForMissingPose(frame.timestampMs);
      return this.latestState;
    }

    this.confidenceSamples.push(features.confidence);
    this.trunkLeanSamples.push(features.trunkLeanScore);
    if (Number.isFinite(features.trunkForwardLean.angleDegrees)) {
      this.trunkForwardLeanSamples.push(features.trunkForwardLean.angleDegrees);
    }
    this.symmetrySamples.push(features.symmetryScore);
    this.stabilitySamples.push(features.stabilityScore);
    this.rememberBodyCenter(features.bodyCenter);
    this.rememberKinematicSample(features);

    this.updateArmRule(features);
    this.updateRepetitionCount(frame.timestampMs, features);
    this.latestState = this.featuresToState({
      features,
      timestampMs: frame.timestampMs,
      repetitionCount: this.repetitionCount,
      elapsedSeconds: this.elapsedSeconds(frame.timestampMs),
      armUseDisqualified: this.armUseDisqualified,
    });
    return this.latestState;
  }

  addManualRepetition() {
    if (this.startedAt === null || this.armUseDisqualified) return this.latestState;
    this.repetitionCount += 1;
    const countedAtMs = Date.now();
    this.countedAtMs.push(countedAtMs);
    this.repEvents.push({
      index: this.repetitionCount,
      countedAtMs,
      manual: true,
    });
    this.latestState = { ...this.latestState, repetitionCount: this.repetitionCount, primaryValue: this.repetitionCount };
    return this.latestState;
  }

  getCurrentState(nowMs = Date.now()) {
    return { ...this.latestState, elapsedSeconds: this.elapsedSeconds(nowMs) };
  }

  finishSession(completedAt = Date.now()) {
    const halfStandCredit = this.finalHalfStandCredit();
    const finalRepetitionCount = this.armUseDisqualified
      ? 0
      : this.repetitionCount + halfStandCredit;

    const repIntervalsSeconds = this.countedAtMs
      .slice(1)
      .map((time, index) => (time - this.countedAtMs[index]) / 1000)
      .filter((value) => value > 0);
    const chairStandResult = this.buildChairStandResult({
      finalRepetitionCount,
      halfStandCredit,
      completedAt,
      repIntervalsSeconds,
    });
    const exerciseDifficultyLevel = calculateExerciseDifficultyLevel(finalRepetitionCount);

    return {
      testType: 'chair_stand',
      repetitionCount: finalRepetitionCount,
      primaryValue: finalRepetitionCount,
      primaryLabel: 'Chair Stands',
      durationSeconds: this.durationSeconds,
      averageRepSeconds: finalRepetitionCount > 0 ? this.durationSeconds / finalRepetitionCount : null,
      fastestRepSeconds: repIntervalsSeconds.length ? Math.min(...repIntervalsSeconds) : null,
      slowestRepSeconds: repIntervalsSeconds.length ? Math.max(...repIntervalsSeconds) : null,
      trunkLeanScore: averageOrNull(this.trunkLeanSamples),
      trunkForwardLean: chairStandResult.aggregate.trunkForwardLean,
      symmetryScore: averageOrNull(this.symmetrySamples),
      stabilityScore: averageOrNull(this.stabilitySamples),
      kneeExtensionAngularVelocityDegPerSec: chairStandResult.aggregate.extensionAngularVelocityDegPerSec.knee,
      hipExtensionAngularVelocityDegPerSec: chairStandResult.aggregate.extensionAngularVelocityDegPerSec.hip,
      sittingSpeed: chairStandResult.aggregate.sittingSpeed,
      confidence: averageOrNull(this.confidenceSamples) ?? this.latestState.confidence,
      recommendationLevel: exerciseDifficultyLevel,
      exerciseDifficultyLevel,
      summaryMessage: `${finalRepetitionCount} chair stands measured.`,
      armUseDisqualified: this.armUseDisqualified,
      chairStandResult,
      startedAt: this.startedAt,
      completedAt,
    };
  }

  reset() {
    this.userId = null;
    this.startedAt = null;
    this.latestTimestampMs = null;
    this.latestFeatures = null;
    this.latestState = defaultState();
    this.countedAtMs = [];
    this.confidenceSamples = [];
    this.trunkLeanSamples = [];
    this.trunkForwardLeanSamples = [];
    this.symmetrySamples = [];
    this.stabilitySamples = [];
    this.recentBodyCenters = [];
    this.kinematicSamples = [];
    this.repEvents = [];
    this.repetitionCount = 0;
    this.readyForNextStand = true;
    this.standingStreak = 0;
    this.seatedStreak = 0;
    this.armSupportFrames = 0;
    this.armSupportObservationCount = 0;
    this.armUseDisqualified = false;
  }

  updateRepetitionCount(timestampMs, features) {
    this.standingStreak = features.phase === ChairStandPosePhase.Standing ? this.standingStreak + 1 : 0;
    this.seatedStreak = features.phase === ChairStandPosePhase.Seated ? this.seatedStreak + 1 : 0;

    if (this.seatedStreak >= REQUIRED_STABLE_FRAMES) {
      this.readyForNextStand = true;
    }

    if (
      this.readyForNextStand &&
      this.standingStreak >= REQUIRED_STABLE_FRAMES &&
      features.fullBodyVisible &&
      !this.armUseDisqualified
    ) {
      this.repetitionCount += 1;
      this.countedAtMs.push(timestampMs);
      this.repEvents.push({
        index: this.repetitionCount,
        countedAtMs: timestampMs,
        phase: features.phase,
      });
      this.readyForNextStand = false;
    }
  }

  updateArmRule(features) {
    const possibleArmSupport = features.phase === ChairStandPosePhase.Rising && features.armSupportLikely;
    if (possibleArmSupport) this.armSupportObservationCount += 1;
    this.armSupportFrames = possibleArmSupport
      ? this.armSupportFrames + 1
      : Math.max(this.armSupportFrames - 1, 0);
    if (this.armSupportFrames >= ARM_SUPPORT_DISQUALIFY_FRAMES) {
      this.armUseDisqualified = true;
    }
  }

  finalHalfStandCredit() {
    const features = this.latestFeatures;
    return this.readyForNextStand && features?.halfwayToStanding ? 1 : 0;
  }

  rememberKinematicSample(features) {
    this.kinematicSamples.push({
      timestampMs: features.timestampMs,
      phase: features.phase,
      confidence: features.confidence,
      jointAngles: features.jointAngles,
      angularVelocities: features.angularVelocities,
      hipCenter: features.hipCenter,
      bodyHeight: features.bodyHeight,
      hipVerticalVelocityBodyHeightsPerSec: features.hipVerticalVelocityBodyHeightsPerSec,
      trunkForwardLean: features.trunkForwardLean,
      trunkLeanScore: features.trunkLeanScore,
      symmetryScore: features.symmetryScore,
      stabilityScore: features.stabilityScore,
      armSupportLikely: features.armSupportLikely,
    });
  }

  velocitySummary(samples, joint, direction = 'extension') {
    const sign = direction === 'extension' ? 1 : -1;
    const valuesFor = (side) => samples
      .map((sample) => sample.angularVelocities?.[joint]?.[side])
      .filter((value) => Number.isFinite(value) && value * sign > 0)
      .map((value) => Math.abs(value));

    const left = valuesFor('left');
    const right = valuesFor('right');
    const average = valuesFor('average');
    const all = average.length ? average : [...left, ...right];

    return {
      meanDegPerSec: meanOrNull(all),
      maxDegPerSec: maxOrNull(all),
      leftMeanDegPerSec: meanOrNull(left),
      rightMeanDegPerSec: meanOrNull(right),
      sampleCount: all.length,
    };
  }

  extensionSamplesFor({ fromMs, toMs }) {
    return this.kinematicSamples.filter((sample) => {
      if (sample.timestampMs < fromMs || sample.timestampMs > toMs) return false;
      const kneeVelocity = sample.angularVelocities?.knees?.average;
      const hipVelocity = sample.angularVelocities?.hips?.average;
      const extensionSignal = (Number.isFinite(kneeVelocity) && kneeVelocity >= MIN_EXTENSION_VELOCITY_DEG_PER_SEC)
        || (Number.isFinite(hipVelocity) && hipVelocity >= MIN_EXTENSION_VELOCITY_DEG_PER_SEC);
      const flexionSignal = (Number.isFinite(kneeVelocity) && kneeVelocity <= MIN_FLEXION_VELOCITY_DEG_PER_SEC)
        || (Number.isFinite(hipVelocity) && hipVelocity <= MIN_FLEXION_VELOCITY_DEG_PER_SEC);
      return extensionSignal || (sample.phase === ChairStandPosePhase.Rising && !flexionSignal);
    });
  }

  findSittingSegment({ fromMs, toMs }) {
    let active = null;
    for (let index = 0; index < this.kinematicSamples.length; index += 1) {
      const sample = this.kinematicSamples[index];
      if (sample.timestampMs < fromMs || sample.timestampMs > toMs) continue;

      const kneeVelocity = sample.angularVelocities?.knees?.average;
      const hipVelocity = sample.angularVelocities?.hips?.average;
      const hipDescent = sample.hipVerticalVelocityBodyHeightsPerSec;
      const flexionSignal = (
        (Number.isFinite(kneeVelocity) && kneeVelocity <= MIN_FLEXION_VELOCITY_DEG_PER_SEC)
        || (Number.isFinite(hipVelocity) && hipVelocity <= MIN_FLEXION_VELOCITY_DEG_PER_SEC)
        || (Number.isFinite(hipDescent) && hipDescent >= MIN_HIP_DESCENT_BODY_HEIGHTS_PER_SEC)
      );

      if (!active && flexionSignal) {
        active = { startIndex: Math.max(index - 1, 0), endIndex: index };
      } else if (active) {
        active.endIndex = index;
        if (sample.phase === ChairStandPosePhase.Seated) {
          break;
        }
      }
    }

    if (!active) return null;
    const samples = this.kinematicSamples.slice(active.startIndex, active.endIndex + 1);
    return samples.length >= 2 ? samples : null;
  }

  summarizeExtension({ samples, countedAtMs }) {
    const startedAtMs = samples[0]?.timestampMs ?? null;
    const endedAtMs = samples.at(-1)?.timestampMs ?? countedAtMs;
    return {
      startedAtMs,
      endedAtMs,
      durationSeconds: startedAtMs !== null && endedAtMs !== null ? (endedAtMs - startedAtMs) / 1000 : null,
      sampleCount: samples.length,
      kneeAngularVelocityDegPerSec: this.velocitySummary(samples, 'knees', 'extension'),
      hipAngularVelocityDegPerSec: this.velocitySummary(samples, 'hips', 'extension'),
    };
  }

  summarizeSitting(samples) {
    if (!samples?.length) return null;
    const startedAtMs = samples[0].timestampMs;
    const endedAtMs = samples.at(-1).timestampMs;
    const hipDescentVelocities = samples
      .map((sample) => sample.hipVerticalVelocityBodyHeightsPerSec)
      .filter((value) => Number.isFinite(value) && value > 0);
    const startHipY = samples[0].hipCenter?.y;
    const endHipY = samples.at(-1).hipCenter?.y;
    const meanBodyHeight = meanOrNull(samples.map((sample) => sample.bodyHeight));
    const hipDescentBodyHeights = Number.isFinite(startHipY) && Number.isFinite(endHipY) && Number.isFinite(meanBodyHeight) && meanBodyHeight > 0
      ? (endHipY - startHipY) / meanBodyHeight
      : null;

    return {
      startedAtMs,
      endedAtMs,
      durationSeconds: (endedAtMs - startedAtMs) / 1000,
      sampleCount: samples.length,
      hipDescentBodyHeights,
      hipDescentVelocityBodyHeightsPerSec: {
        mean: meanOrNull(hipDescentVelocities),
        max: maxOrNull(hipDescentVelocities),
      },
      kneeFlexionAngularVelocityDegPerSec: this.velocitySummary(samples, 'knees', 'flexion'),
      hipFlexionAngularVelocityDegPerSec: this.velocitySummary(samples, 'hips', 'flexion'),
    };
  }

  buildRepetitionResults() {
    return this.repEvents.map((event, index) => {
      const previousCountedAtMs = index > 0 ? this.repEvents[index - 1].countedAtMs : this.startedAt;
      const nextCountedAtMs = this.repEvents[index + 1]?.countedAtMs ?? this.latestTimestampMs ?? event.countedAtMs;
      const extensionSamples = this.extensionSamplesFor({
        fromMs: previousCountedAtMs,
        toMs: event.countedAtMs,
      });
      const sittingSamples = this.findSittingSegment({
        fromMs: event.countedAtMs,
        toMs: nextCountedAtMs,
      });

      return {
        index: event.index,
        countedAtMs: event.countedAtMs,
        manual: Boolean(event.manual),
        repIntervalSeconds: index > 0 ? (event.countedAtMs - this.repEvents[index - 1].countedAtMs) / 1000 : null,
        extension: this.summarizeExtension({ samples: extensionSamples, countedAtMs: event.countedAtMs }),
        sitting: this.summarizeSitting(sittingSamples),
      };
    });
  }

  buildChairStandResult({ finalRepetitionCount, halfStandCredit, completedAt, repIntervalsSeconds }) {
    const repetitions = this.buildRepetitionResults();
    const extensionKneeMeans = repetitions.map((rep) => rep.extension.kneeAngularVelocityDegPerSec.meanDegPerSec);
    const extensionKneeMaxes = repetitions.map((rep) => rep.extension.kneeAngularVelocityDegPerSec.maxDegPerSec);
    const extensionHipMeans = repetitions.map((rep) => rep.extension.hipAngularVelocityDegPerSec.meanDegPerSec);
    const extensionHipMaxes = repetitions.map((rep) => rep.extension.hipAngularVelocityDegPerSec.maxDegPerSec);
    const sittingSegments = repetitions.map((rep) => rep.sitting).filter(Boolean);

    return {
      schemaVersion: CHAIR_STAND_RESULT_SCHEMA_VERSION,
      testType: 'chair_stand',
      durationSeconds: this.durationSeconds,
      repetitionCount: finalRepetitionCount,
      countedRepetitionCount: this.repetitionCount,
      halfStandCredit,
      armUseDisqualified: this.armUseDisqualified,
      startedAtMs: this.startedAt,
      completedAtMs: completedAt,
      frameCount: this.kinematicSamples.length,
      confidence: averageOrNull(this.confidenceSamples) ?? this.latestState.confidence,
      repetitions,
      aggregate: {
        averageRepSeconds: finalRepetitionCount > 0 ? this.durationSeconds / finalRepetitionCount : null,
        fastestRepSeconds: repIntervalsSeconds.length ? Math.min(...repIntervalsSeconds) : null,
        slowestRepSeconds: repIntervalsSeconds.length ? Math.max(...repIntervalsSeconds) : null,
        extensionAngularVelocityDegPerSec: {
          knee: {
            meanOfRepMeans: meanOrNull(extensionKneeMeans),
            maxObserved: maxOrNull(extensionKneeMaxes),
          },
          hip: {
            meanOfRepMeans: meanOrNull(extensionHipMeans),
            maxObserved: maxOrNull(extensionHipMaxes),
          },
        },
        sittingSpeed: {
          observedSegmentCount: sittingSegments.length,
          meanDurationSeconds: meanOrNull(sittingSegments.map((segment) => segment.durationSeconds)),
          fastestDurationSeconds: minOrNull(sittingSegments.map((segment) => segment.durationSeconds)),
          slowestDurationSeconds: maxOrNull(sittingSegments.map((segment) => segment.durationSeconds)),
          meanHipDescentVelocityBodyHeightsPerSec: meanOrNull(sittingSegments.map((segment) => segment.hipDescentVelocityBodyHeightsPerSec.mean)),
          maxHipDescentVelocityBodyHeightsPerSec: maxOrNull(sittingSegments.map((segment) => segment.hipDescentVelocityBodyHeightsPerSec.max)),
          meanKneeFlexionVelocityDegPerSec: meanOrNull(sittingSegments.map((segment) => segment.kneeFlexionAngularVelocityDegPerSec.meanDegPerSec)),
          meanHipFlexionVelocityDegPerSec: meanOrNull(sittingSegments.map((segment) => segment.hipFlexionAngularVelocityDegPerSec.meanDegPerSec)),
        },
        trunkForwardLean: {
          scoreMean: averageOrNull(this.trunkLeanSamples),
          angleMeanDegrees: meanOrNull(this.trunkForwardLeanSamples),
          angleMaxDegrees: maxOrNull(this.trunkForwardLeanSamples),
        },
        symmetryScoreMean: averageOrNull(this.symmetrySamples),
        stabilityScoreMean: averageOrNull(this.stabilitySamples),
      },
      armSupport: {
        disqualified: this.armUseDisqualified,
        supportFrameCount: this.armSupportObservationCount,
      },
    };
  }

  toChairStandFeatures(frame, { previousFeatures = null, previousTimestampMs = null } = {}) {
    const visiblePoint = (name) => this.visiblePoint(frame, name);
    const leftShoulder = visiblePoint(PoseLandmarks.LeftShoulder);
    const rightShoulder = visiblePoint(PoseLandmarks.RightShoulder);
    const leftHip = visiblePoint(PoseLandmarks.LeftHip);
    const rightHip = visiblePoint(PoseLandmarks.RightHip);
    const leftKnee = visiblePoint(PoseLandmarks.LeftKnee);
    const rightKnee = visiblePoint(PoseLandmarks.RightKnee);
    const leftAnkle = visiblePoint(PoseLandmarks.LeftAnkle);
    const rightAnkle = visiblePoint(PoseLandmarks.RightAnkle);

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return null;
    }

    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const hipCenter = midpoint(leftHip, rightHip);
    const kneeCenter = midpoint(leftKnee, rightKnee);
    const bodyCenter = {
      x: (shoulderCenter.x + hipCenter.x) / 2,
      y: (shoulderCenter.y + hipCenter.y) / 2,
    };

    const jointAngles = frame.metrics?.jointAngles || calculateJointAngles(frame.landmarks, { minVisibility: MIN_LANDMARK_VISIBILITY });
    const deltaSeconds = Number.isFinite(previousTimestampMs)
      ? (frame.timestampMs - previousTimestampMs) / 1000
      : null;
    const angularVelocities = frame.metrics?.angularVelocities || calculateAngularVelocities(
      jointAngles,
      previousFeatures?.jointAngles || {},
      deltaSeconds,
    );
    const leftKneeAngle = Number.isFinite(jointAngles.knees.left)
      ? jointAngles.knees.left
      : angleDegrees(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = Number.isFinite(jointAngles.knees.right)
      ? jointAngles.knees.right
      : angleDegrees(rightHip, rightKnee, rightAnkle);
    const leftHipAngle = Number.isFinite(jointAngles.hips.left) ? jointAngles.hips.left : null;
    const rightHipAngle = Number.isFinite(jointAngles.hips.right) ? jointAngles.hips.right : null;
    const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const hipAboveKnees = kneeCenter.y - hipCenter.y;
    const fullBodyVisible = RequiredChairStandLandmarks.every((name) => visiblePoint(name));
    const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder), 0.08);
    const bodyHeight = this.bodyHeight(frame) || Math.max(distance(shoulderCenter, hipCenter) * 3, 0.4);
    const hipVerticalVelocityBodyHeightsPerSec = previousFeatures?.hipCenter && Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? (hipCenter.y - previousFeatures.hipCenter.y) / bodyHeight / deltaSeconds
      : null;

    let phase = ChairStandPosePhase.Unknown;
    if (averageKneeAngle >= STANDING_KNEE_ANGLE && hipAboveKnees >= STANDING_HIP_MARGIN) {
      phase = ChairStandPosePhase.Standing;
    } else if (averageKneeAngle <= SEATED_KNEE_ANGLE || hipAboveKnees < SEATED_HIP_MARGIN) {
      phase = ChairStandPosePhase.Seated;
    } else if (hipAboveKnees >= RISING_HIP_MARGIN) {
      phase = ChairStandPosePhase.Rising;
    }

    const trunkLeanScore = clamp(1 - Math.abs(shoulderCenter.x - hipCenter.x) / (shoulderWidth * 0.75), 0, 1);
    const trunkForwardLean = {
      angleDegrees: Math.atan2(
        Math.abs(shoulderCenter.x - hipCenter.x),
        Math.abs(shoulderCenter.y - hipCenter.y) + MIN_VECTOR_MAGNITUDE,
      ) * 180 / Math.PI,
      shoulderHipOffsetRatio: (shoulderCenter.x - hipCenter.x) / shoulderWidth,
      score: trunkLeanScore,
    };
    const symmetryScore = clamp(1 - Math.abs(leftKneeAngle - rightKneeAngle) / 55, 0, 1);
    const stabilityScore = this.stabilityScoreWith(bodyCenter);
    const confidenceValues = RequiredChairStandLandmarks
      .map((name) => this.landmark(frame, name)?.visibility ?? frame.confidence)
      .filter((value) => Number.isFinite(value));
    const confidence = clamp(confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(confidenceValues.length, 1), 0, 1);

    return {
      timestampMs: frame.timestampMs,
      phase,
      fullBodyVisible,
      confidence,
      trunkLeanScore,
      symmetryScore,
      stabilityScore,
      armSupportLikely: this.armSupportLikely(frame, hipCenter),
      armsCrossedLikely: this.armsCrossedLikely(frame, shoulderWidth),
      halfwayToStanding: averageKneeAngle >= HALFWAY_KNEE_ANGLE && hipAboveKnees >= HALFWAY_HIP_MARGIN,
      bodyCenter,
      hipCenter,
      bodyHeight,
      jointAngles,
      angularVelocities,
      hipVerticalVelocityBodyHeightsPerSec,
      trunkForwardLean,
      debug: {
        leftKneeAngle,
        rightKneeAngle,
        leftHipAngle,
        rightHipAngle,
        averageKneeAngle,
        averageHipAngle: jointAngles.hips.average,
        kneeExtensionVelocity: angularVelocities.knees.average,
        hipExtensionVelocity: angularVelocities.hips.average,
        hipVerticalVelocityBodyHeightsPerSec,
        hipAboveKnees,
      },
    };
  }

  visiblePoint(frame, name) {
    const landmark = this.landmark(frame, name);
    if (!landmark) return null;
    const visibility = landmark.visibility ?? frame.confidence;
    return visibility >= MIN_LANDMARK_VISIBILITY ? { x: landmark.x, y: landmark.y } : null;
  }

  bodyHeight(frame) {
    const ys = (frame.landmarks || [])
      .filter((point) => Number.isFinite(point.y) && (point.visibility ?? frame.confidence ?? 0) >= MIN_LANDMARK_VISIBILITY)
      .map((point) => point.y);
    return ys.length ? Math.max(...ys) - Math.min(...ys) : null;
  }

  landmark(frame, name) {
    return frame.landmarks.find((point) => point.name === name) ?? null;
  }

  armSupportLikely(frame, hipCenter) {
    const leftWrist = this.visiblePoint(frame, PoseLandmarks.LeftWrist);
    const rightWrist = this.visiblePoint(frame, PoseLandmarks.RightWrist);
    if (!leftWrist || !rightWrist) return false;
    return leftWrist.y > hipCenter.y + ARM_SUPPORT_Y_MARGIN && rightWrist.y > hipCenter.y + ARM_SUPPORT_Y_MARGIN;
  }

  armsCrossedLikely(frame, shoulderWidth) {
    const leftWrist = this.visiblePoint(frame, PoseLandmarks.LeftWrist);
    const rightWrist = this.visiblePoint(frame, PoseLandmarks.RightWrist);
    const leftShoulder = this.visiblePoint(frame, PoseLandmarks.LeftShoulder);
    const rightShoulder = this.visiblePoint(frame, PoseLandmarks.RightShoulder);
    const leftHip = this.visiblePoint(frame, PoseLandmarks.LeftHip);
    const rightHip = this.visiblePoint(frame, PoseLandmarks.RightHip);
    if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

    const hipY = (leftHip.y + rightHip.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const wristsInChestBand = leftWrist.y >= shoulderY && leftWrist.y <= hipY && rightWrist.y >= shoulderY && rightWrist.y <= hipY;
    const leftNearRightShoulder = distance(leftWrist, rightShoulder) <= shoulderWidth;
    const rightNearLeftShoulder = distance(rightWrist, leftShoulder) <= shoulderWidth;
    return wristsInChestBand && leftNearRightShoulder && rightNearLeftShoulder;
  }

  featuresToState({ features, repetitionCount, elapsedSeconds, armUseDisqualified }) {
    let warningMessage = null;
    if (armUseDisqualified) {
      warningMessage = 'Arm support was detected. The official Chair Stand score is 0.';
    } else if (!features.fullBodyVisible) {
      warningMessage = 'Move back so shoulders, hips, knees, and ankles are all visible.';
    } else if (features.phase === ChairStandPosePhase.Rising && features.armsCrossedLikely === false) {
      warningMessage = 'Keep both arms crossed in front of the chest while standing.';
    } else if (features.phase === ChairStandPosePhase.Standing && features.trunkLeanScore < TRUNK_WARNING_SCORE) {
      warningMessage = 'Center the trunk so the chest stays above the hips.';
    } else if (features.phase === ChairStandPosePhase.Standing && features.stabilityScore < STABILITY_WARNING_SCORE) {
      warningMessage = 'Movement looks unstable. Slow down and check nearby support.';
    }

    let postureMessage = 'The camera is tracking movement.';
    if (armUseDisqualified) postureMessage = SteadiAssessmentRules.ChairStandArmRule;
    else if (features.phase === ChairStandPosePhase.Standing) postureMessage = 'A full standing posture was detected. Sit safely to prepare for the next rep.';
    else if (features.phase === ChairStandPosePhase.Rising) postureMessage = 'Rising detected. Stand fully, then sit down slowly.';
    else if (features.phase === ChairStandPosePhase.Seated) postureMessage = 'Seated posture detected. Stand when ready.';

    return {
      repetitionCount,
      primaryValue: repetitionCount,
      primaryLabel: 'Chair Stands',
      elapsedSeconds,
      durationSeconds: this.durationSeconds,
      confidence: features.confidence,
      isFullBodyVisible: features.fullBodyVisible,
      warningMessage,
      postureMessage,
      isArmUseSuspected: armUseDisqualified || features.armSupportLikely,
      isStandingOrRising: features.phase === ChairStandPosePhase.Standing || features.phase === ChairStandPosePhase.Rising,
      phase: features.phase,
      trunkLeanScore: features.trunkLeanScore,
      trunkForwardLean: features.trunkForwardLean,
      symmetryScore: features.symmetryScore,
      stabilityScore: features.stabilityScore,
      kneeExtensionAngularVelocityDegPerSec: features.angularVelocities?.knees?.average ?? null,
      hipExtensionAngularVelocityDegPerSec: features.angularVelocities?.hips?.average ?? null,
      hipVerticalVelocityBodyHeightsPerSec: features.hipVerticalVelocityBodyHeightsPerSec,
      armUseDisqualified,
      debug: features.debug,
    };
  }

  stateForMissingPose(timestampMs) {
    return {
      repetitionCount: this.repetitionCount,
      primaryValue: this.repetitionCount,
      primaryLabel: 'Chair Stands',
      elapsedSeconds: this.elapsedSeconds(timestampMs),
      durationSeconds: this.durationSeconds,
      confidence: 0,
      isFullBodyVisible: false,
      warningMessage: 'The camera has not found a full-body pose yet.',
      postureMessage: 'Adjust position so the full body is inside the camera view.',
      isArmUseSuspected: this.armUseDisqualified,
      isStandingOrRising: false,
      phase: ChairStandPosePhase.Unknown,
      armUseDisqualified: this.armUseDisqualified,
    };
  }

  elapsedSeconds(nowMs) {
    const start = this.startedAt ?? nowMs;
    return clamp(Math.floor(Math.max(nowMs - start, 0) / 1000), 0, this.durationSeconds);
  }

  rememberBodyCenter(center) {
    this.recentBodyCenters.push(center);
    while (this.recentBodyCenters.length > STABILITY_SAMPLE_LIMIT) this.recentBodyCenters.shift();
  }

  stabilityScoreWith(center) {
    const samples = [...this.recentBodyCenters, center];
    if (samples.length < MIN_STABILITY_SAMPLES) return 1;
    const meanX = samples.reduce((sum, point) => sum + point.x, 0) / samples.length;
    const meanY = samples.reduce((sum, point) => sum + point.y, 0) / samples.length;
    const variance = samples
      .map((point) => (point.x - meanX) ** 2 + (point.y - meanY) ** 2)
      .reduce((sum, value) => sum + value, 0) / samples.length;
    const sway = Math.sqrt(variance);
    return clamp(1 - sway * 18, 0, 1);
  }
}

function safeTimestamp(frame, index) {
  if (Number.isFinite(frame?.timestampMs)) return frame.timestampMs;
  if (Number.isFinite(frame?.receivedAt)) return frame.receivedAt;
  return index * 100;
}

function normalizeFrame(frame, index) {
  return {
    ...frame,
    timestampMs: safeTimestamp(frame, index),
    landmarks: normalizePoseLandmarks(frame?.landmarks || frame || []),
    confidence: Number.isFinite(frame?.confidence) ? frame.confidence : 0,
  };
}

function framesFromSeries(seriesInput) {
  const frames = Array.isArray(seriesInput)
    ? seriesInput
    : seriesInput?.frames || seriesInput?.landmarkSeries?.frames || [];
  return frames
    .filter(Boolean)
    .map(normalizeFrame)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function analyzeChairStandSeries(seriesInput, { durationSeconds = SteadiAssessmentRules.ChairStandDurationSeconds } = {}) {
  const frames = framesFromSeries(seriesInput);
  const analyzer = new MediaPipeChairStandAnalyzer({ durationSeconds });
  const startedAt = frames[0]?.timestampMs ?? Date.now();
  analyzer.startSession('offline-sequence', startedAt);
  for (const frame of frames) analyzer.addFrame(frame);
  return analyzer.finishSession(frames.at(-1)?.timestampMs ?? startedAt);
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function repetitionLogLine(rep) {
  return [
    `rep ${rep.index}`,
    `countedAt=${fmt(rep.countedAtMs / 1000)}s`,
    `interval=${fmt(rep.repIntervalSeconds)}s`,
    `kneeExtMean=${fmt(rep.extension.kneeAngularVelocityDegPerSec.meanDegPerSec)}deg/s`,
    `kneeExtMax=${fmt(rep.extension.kneeAngularVelocityDegPerSec.maxDegPerSec)}deg/s`,
    `hipExtMean=${fmt(rep.extension.hipAngularVelocityDegPerSec.meanDegPerSec)}deg/s`,
    `hipExtMax=${fmt(rep.extension.hipAngularVelocityDegPerSec.maxDegPerSec)}deg/s`,
    `sitDuration=${fmt(rep.sitting?.durationSeconds)}s`,
    `sitHipV=${fmt(rep.sitting?.hipDescentVelocityBodyHeightsPerSec.mean, 3)}body/s`,
    `sitKneeFlex=${fmt(rep.sitting?.kneeFlexionAngularVelocityDegPerSec.meanDegPerSec)}deg/s`,
  ].join(' | ');
}

export function formatChairStandResultLog(result) {
  const chairStandResult = result.chairStandResult || result;
  return [
    `Chair stand result ${chairStandResult.schemaVersion}`,
    `reps=${chairStandResult.repetitionCount} counted=${chairStandResult.countedRepetitionCount} halfCredit=${chairStandResult.halfStandCredit}`,
    `frames=${chairStandResult.frameCount} confidence=${fmt(chairStandResult.confidence, 3)} armDisqualified=${chairStandResult.armUseDisqualified}`,
    `aggregate kneeExtMean=${fmt(chairStandResult.aggregate.extensionAngularVelocityDegPerSec.knee.meanOfRepMeans)}deg/s kneeExtMax=${fmt(chairStandResult.aggregate.extensionAngularVelocityDegPerSec.knee.maxObserved)}deg/s`,
    `aggregate hipExtMean=${fmt(chairStandResult.aggregate.extensionAngularVelocityDegPerSec.hip.meanOfRepMeans)}deg/s hipExtMax=${fmt(chairStandResult.aggregate.extensionAngularVelocityDegPerSec.hip.maxObserved)}deg/s`,
    `aggregate sitMean=${fmt(chairStandResult.aggregate.sittingSpeed.meanDurationSeconds)}s sitFastest=${fmt(chairStandResult.aggregate.sittingSpeed.fastestDurationSeconds)}s hipDescentV=${fmt(chairStandResult.aggregate.sittingSpeed.meanHipDescentVelocityBodyHeightsPerSec, 3)}body/s`,
    `trunkForwardLean score=${fmt(chairStandResult.aggregate.trunkForwardLean.scoreMean, 3)} angleMean=${fmt(chairStandResult.aggregate.trunkForwardLean.angleMeanDegrees)}deg angleMax=${fmt(chairStandResult.aggregate.trunkForwardLean.angleMaxDegrees)}deg`,
    ...chairStandResult.repetitions.map(repetitionLogLine),
  ].join('\n');
}
