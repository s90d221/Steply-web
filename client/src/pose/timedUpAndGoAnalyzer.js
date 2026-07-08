import { PoseLandmarks, RequiredChairStandLandmarks } from './poseLandmarks';
import { calculateJointAngles } from './poseKinematics';
import { normalizePoseLandmarks } from './poseTimeSeries';

export const TIMED_UP_AND_GO_TEST_TYPE = 'timed_up_and_go';
export const TUG_RESULT_SCHEMA_VERSION = 'timed_up_and_go_result.v1';

const DEFAULT_TUG_DURATION_SECONDS = 45;
const MIN_LANDMARK_VISIBILITY = 0.45;
const STANDING_KNEE_ANGLE = 150;
const SEATED_KNEE_ANGLE = 128;
const RISING_HIP_MARGIN = 0.04;
const SEATED_HIP_MARGIN = 0.03;
const MIN_VECTOR_MAGNITUDE = 0.0001;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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
const stdDevOrNull = (values) => {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  const mean = meanOrNull(finite);
  return Math.sqrt(meanOrNull(finite.map((value) => (value - mean) ** 2)));
};

function distance(first, second) {
  if (!first || !second) return null;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function midpoint(first, second) {
  if (!first || !second) return null;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: Number.isFinite(first.z) && Number.isFinite(second.z) ? (first.z + second.z) / 2 : null,
  };
}

function visiblePoint(frame, name) {
  const landmark = frame.landmarks.find((point) => point.name === name);
  if (!landmark) return null;
  const visibility = landmark.visibility ?? frame.confidence ?? 0;
  return visibility >= MIN_LANDMARK_VISIBILITY ? landmark : null;
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

function bodyHeight(frame) {
  const ys = (frame.landmarks || [])
    .filter((point) => Number.isFinite(point.y) && (point.visibility ?? frame.confidence ?? 0) >= MIN_LANDMARK_VISIBILITY)
    .map((point) => point.y);
  return ys.length ? Math.max(...ys) - Math.min(...ys) : null;
}

function phaseFromFeatures({ averageKneeAngle, hipAboveKnees, centerSpeed }) {
  if (averageKneeAngle <= SEATED_KNEE_ANGLE || hipAboveKnees < SEATED_HIP_MARGIN) return 'seated';
  if (averageKneeAngle >= STANDING_KNEE_ANGLE && centerSpeed > 0.05) return 'walking';
  if (averageKneeAngle >= STANDING_KNEE_ANGLE) return 'standing';
  if (hipAboveKnees >= RISING_HIP_MARGIN) return 'rising';
  return 'unknown';
}

function possibleSupport(frame, hipCenter, shoulderCenter, shoulderWidth) {
  const leftWrist = visiblePoint(frame, PoseLandmarks.LeftWrist);
  const rightWrist = visiblePoint(frame, PoseLandmarks.RightWrist);
  if (!hipCenter || !shoulderCenter) return false;
  const wrists = [leftWrist, rightWrist].filter(Boolean);
  return wrists.some((wrist) => {
    const low = wrist.y >= hipCenter.y - 0.02;
    const far = Math.abs(wrist.x - shoulderCenter.x) >= shoulderWidth * 0.8;
    return low && far;
  });
}

function supportSideCount(frame, hipCenter, shoulderCenter, shoulderWidth) {
  const wrists = [
    visiblePoint(frame, PoseLandmarks.LeftWrist),
    visiblePoint(frame, PoseLandmarks.RightWrist),
  ].filter(Boolean);
  return wrists.filter((wrist) => (
    wrist.y >= hipCenter.y - 0.02
    && Math.abs(wrist.x - shoulderCenter.x) >= shoulderWidth * 0.8
  )).length;
}

function frameFeatures(frame, previousFeature = null) {
  const leftShoulder = visiblePoint(frame, PoseLandmarks.LeftShoulder);
  const rightShoulder = visiblePoint(frame, PoseLandmarks.RightShoulder);
  const leftHip = visiblePoint(frame, PoseLandmarks.LeftHip);
  const rightHip = visiblePoint(frame, PoseLandmarks.RightHip);
  const leftKnee = visiblePoint(frame, PoseLandmarks.LeftKnee);
  const rightKnee = visiblePoint(frame, PoseLandmarks.RightKnee);
  const leftAnkle = visiblePoint(frame, PoseLandmarks.LeftAnkle);
  const rightAnkle = visiblePoint(frame, PoseLandmarks.RightAnkle);
  const leftHeel = visiblePoint(frame, PoseLandmarks.LeftHeel);
  const rightHeel = visiblePoint(frame, PoseLandmarks.RightHeel);
  const leftFootIndex = visiblePoint(frame, PoseLandmarks.LeftFootIndex);
  const rightFootIndex = visiblePoint(frame, PoseLandmarks.RightFootIndex);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
    return null;
  }

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const kneeCenter = midpoint(leftKnee, rightKnee);
  const ankleCenter = midpoint(leftAnkle, rightAnkle);
  const bodyCenter = midpoint(shoulderCenter, hipCenter);
  const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder) || 0, 0.08);
  const height = Math.max(bodyHeight(frame) || 0, 0.4);
  const jointAngles = frame.metrics?.jointAngles || calculateJointAngles(frame.landmarks, { minVisibility: MIN_LANDMARK_VISIBILITY });
  const averageKneeAngle = Number.isFinite(jointAngles.knees?.average)
    ? jointAngles.knees.average
    : meanOrNull([jointAngles.knees?.left, jointAngles.knees?.right]) ?? 0;
  const hipAboveKnees = kneeCenter.y - hipCenter.y;
  const deltaSeconds = previousFeature
    ? Math.max((frame.timestampMs - previousFeature.timestampMs) / 1000, 0)
    : 0;
  const centerDelta = previousFeature?.bodyCenter && deltaSeconds > 0
    ? distance(bodyCenter, previousFeature.bodyCenter) / height
    : 0;
  const centerSpeed = deltaSeconds > 0 ? centerDelta / deltaSeconds : 0;
  const lateralSpeed = previousFeature?.bodyCenter && deltaSeconds > 0
    ? Math.abs(bodyCenter.x - previousFeature.bodyCenter.x) / shoulderWidth / deltaSeconds
    : 0;
  const ankleWidthRatio = Math.abs(leftAnkle.x - rightAnkle.x) / shoulderWidth;
  const ankleVerticalSpread = Math.abs(leftAnkle.y - rightAnkle.y) / height;
  const leftWrist = visiblePoint(frame, PoseLandmarks.LeftWrist);
  const rightWrist = visiblePoint(frame, PoseLandmarks.RightWrist);
  const fullBodyVisible = RequiredChairStandLandmarks.every((name) => visiblePoint(frame, name));
  const feetVisible = Boolean(leftHeel && rightHeel && leftFootIndex && rightFootIndex);
  const confidenceValues = RequiredChairStandLandmarks
    .map((name) => visiblePoint(frame, name)?.visibility ?? frame.confidence)
    .filter(Number.isFinite);
  const confidence = confidenceValues.length ? meanOrNull(confidenceValues) : frame.confidence;

  return {
    timestampMs: frame.timestampMs,
    confidence,
    fullBodyVisible,
    bodyCenter,
    shoulderCenter,
    hipCenter,
    ankleCenter,
    shoulderWidth,
    bodyHeight: height,
    leftAnkle,
    rightAnkle,
    feetVisible,
    leftWrist,
    rightWrist,
    centerSpeed,
    lateralSpeed,
    ankleWidthRatio,
    ankleVerticalSpread,
    supportLikely: possibleSupport(frame, hipCenter, shoulderCenter, shoulderWidth),
    supportSideCount: supportSideCount(frame, hipCenter, shoulderCenter, shoulderWidth),
    phase: phaseFromFeatures({ averageKneeAngle, hipAboveKnees, centerSpeed }),
  };
}

function firstTime(features, predicate) {
  return features.find(predicate)?.timestampMs ?? null;
}

function lastTime(features, predicate) {
  for (let index = features.length - 1; index >= 0; index -= 1) {
    if (predicate(features[index])) return features[index].timestampMs;
  }
  return null;
}

function secondsBetween(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 1000;
}

function estimateStepCount(features) {
  const walking = features.filter((feature) => feature.phase === 'walking' || feature.centerSpeed > 0.04);
  const reliableWalking = walking.filter((feature) => feature.feetVisible);
  if (reliableWalking.length < 8) return null;
  const signals = reliableWalking.map((feature) => feature.ankleVerticalSpread);
  const mean = meanOrNull(signals) ?? 0;
  let peaks = 0;
  for (let index = 1; index < signals.length - 1; index += 1) {
    if (signals[index] > mean && signals[index] > signals[index - 1] && signals[index] > signals[index + 1]) peaks += 1;
  }
  return Math.max(peaks, 1);
}

function estimateTurnDuration(features, totalTimeSec) {
  const moving = features.filter((feature) => feature.phase === 'walking' || feature.centerSpeed > 0.04);
  if (moving.length < 6) return clamp((totalTimeSec || 12) * 0.16, 1.2, 4.5);
  const xs = moving.map((feature) => feature.bodyCenter.x);
  const minX = minOrNull(xs);
  const maxX = maxOrNull(xs);
  const travel = Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0;
  if (travel < 0.08) return clamp((totalTimeSec || 12) * 0.18, 1.4, 5);
  const extreme = moving.find((feature) => (
    Math.abs(feature.bodyCenter.x - minX) < travel * 0.08
    || Math.abs(feature.bodyCenter.x - maxX) < travel * 0.08
  ));
  if (!extreme) return clamp((totalTimeSec || 12) * 0.16, 1.2, 4.5);
  const lowSpeedAroundTurn = moving.filter((feature) => (
    Math.abs(feature.timestampMs - extreme.timestampMs) <= 2500
    && feature.centerSpeed < 0.08
  ));
  if (lowSpeedAroundTurn.length >= 2) {
    return Math.max(
      1,
      (lowSpeedAroundTurn.at(-1).timestampMs - lowSpeedAroundTurn[0].timestampMs) / 1000,
    );
  }
  return clamp((totalTimeSec || 12) * 0.14, 1.2, 4);
}

function estimateArmSwingAsymmetry(features) {
  const left = features.map((feature) => feature.leftWrist?.x).filter(Number.isFinite);
  const right = features.map((feature) => feature.rightWrist?.x).filter(Number.isFinite);
  if (left.length < 4 || right.length < 4) return null;
  const leftRange = Math.max(...left) - Math.min(...left);
  const rightRange = Math.max(...right) - Math.min(...right);
  const denominator = Math.max(leftRange, rightRange, MIN_VECTOR_MAGNITUDE);
  return Math.abs(leftRange - rightRange) / denominator;
}

function buildTugResult({ features, startedAt, completedAt, durationSeconds }) {
  const totalTimeSec = Math.max((completedAt - startedAt) / 1000, 0);
  const firstRising = firstTime(features, (feature) => feature.phase === 'rising' || feature.phase === 'standing' || feature.phase === 'walking');
  const firstWalking = firstTime(features, (feature) => feature.phase === 'walking');
  const lastSitting = lastTime(features, (feature) => feature.phase === 'seated');
  const sitToStandTimeSec = secondsBetween(startedAt, firstWalking || firstRising)
    ?? clamp(totalTimeSec * 0.18, 1.2, 3.5);
  const sitDownTimeSec = lastSitting && completedAt - lastSitting < totalTimeSec * 1000 * 0.4
    ? secondsBetween(lastSitting, completedAt)
    : clamp(totalTimeSec * 0.12, 1, 3);
  const turnDurationSec = estimateTurnDuration(features, totalTimeSec);
  const walkTime = Math.max(totalTimeSec - sitToStandTimeSec - sitDownTimeSec - turnDurationSec, totalTimeSec * 0.35);
  const walkOutTimeSec = walkTime / 2;
  const returnWalkTimeSec = walkTime / 2;
  const stepCount = estimateStepCount(features);
  const gaitSpeedEstimate = walkTime > 0 ? 6 / walkTime : null;
  const stepLengthEstimate = stepCount > 0 ? 6 / stepCount : null;
  const ankleWidths = features.map((feature) => feature.ankleWidthRatio).filter(Number.isFinite);
  const stepWidthVariability = stdDevOrNull(ankleWidths);
  const stepLengthVariability = stepLengthEstimate ? clamp((stdDevOrNull(features.map((feature) => feature.centerSpeed)) || 0) / 0.2, 0, 1) : null;
  const footClearance = meanOrNull(features.map((feature) => feature.ankleVerticalSpread));
  const shufflingScore = stepLengthEstimate
    ? clamp((0.48 - stepLengthEstimate) / 0.28 + (0.04 - (footClearance || 0.04)) / 0.08, 0, 1)
    : null;
  const supportRatio = features.length
    ? features.filter((feature) => feature.supportLikely).length / features.length
    : 0;
  const highLateralSpeedCount = features.filter((feature) => feature.lateralSpeed > 1.35).length;

  return {
    schemaVersion: TUG_RESULT_SCHEMA_VERSION,
    testType: TIMED_UP_AND_GO_TEST_TYPE,
    durationSeconds,
    totalTimeSec,
    sitToStandTimeSec,
    walkOutTimeSec,
    turnDurationSec,
    returnWalkTimeSec,
    sitDownTimeSec,
    gaitSpeedEstimate,
    stepCount,
    stepLengthEstimate,
    stepLengthVariability,
    stepWidthVariability,
    shufflingScore,
    armSwingAsymmetry: estimateArmSwingAsymmetry(features),
    turnStepCount: stepCount ? Math.max(2, Math.round(turnDurationSec * 1.4)) : null,
    enBlocTurningDetected: turnDurationSec >= 3.2 && (stepWidthVariability ?? 0) < 0.03,
    wallOrFurnitureSupportDetected: supportRatio >= 0.12,
    lossOfBalanceDetected: highLateralSpeedCount >= 2,
    confidenceScore: meanOrNull(features.map((feature) => feature.confidence)) ?? 0,
    confidence: meanOrNull(features.map((feature) => feature.confidence)) ?? 0,
    frameCount: features.length,
    startedAtMs: startedAt,
    completedAtMs: completedAt,
    estimatedMetrics: [
      'sitToStandTimeSec',
      'walkOutTimeSec',
      'turnDurationSec',
      'returnWalkTimeSec',
      'sitDownTimeSec',
      'gaitSpeedEstimate',
      'stepCount',
      'stepLengthEstimate',
      'stepLengthVariability',
      'stepWidthVariability',
      'shufflingScore',
      'turnStepCount',
      'enBlocTurningDetected',
    ],
    unavailableMetrics: stepCount ? [] : ['stepCount', 'stepLengthEstimate', 'turnStepCount'],
  };
}

function defaultState(durationSeconds = DEFAULT_TUG_DURATION_SECONDS) {
  return {
    repetitionCount: 0,
    primaryValue: 0,
    primaryLabel: 'TUG Time',
    elapsedSeconds: 0,
    durationSeconds,
    confidence: 0,
    isFullBodyVisible: false,
    warningMessage: 'Move back so your full body and the chair are visible.',
    postureMessage: 'Sit in the chair and get ready to stand, walk, turn, return, and sit.',
    isArmUseSuspected: false,
    isStandingOrRising: false,
    phase: 'waiting',
  };
}

export class TimedUpAndGoAnalyzer {
  constructor({ durationSeconds = DEFAULT_TUG_DURATION_SECONDS } = {}) {
    this.durationSeconds = durationSeconds;
    this.reset();
  }

  startSession(userId = 'remote-user', startedAt = Date.now()) {
    this.reset();
    this.userId = userId;
    this.startedAt = startedAt;
    this.latestTimestampMs = startedAt;
  }

  addFrame(frameInput) {
    if (this.startedAt === null) return this.latestState;
    const frame = normalizeFrame(frameInput, this.frames.length);
    const previousFeature = this.features.at(-1) || null;
    const feature = frameFeatures(frame, previousFeature);
    this.frames.push(frame);
    this.latestTimestampMs = frame.timestampMs;

    if (!feature) {
      this.latestState = this.stateForMissingPose(frame.timestampMs);
      return this.latestState;
    }

    this.features.push(feature);
    this.latestState = this.stateFromFeature(feature);
    return this.latestState;
  }

  addManualRepetition() {
    return this.latestState;
  }

  getCurrentState(nowMs = Date.now()) {
    return { ...this.latestState, elapsedSeconds: this.elapsedSeconds(nowMs), primaryValue: this.elapsedSeconds(nowMs) };
  }

  finishSession(completedAt = Date.now()) {
    const tugResult = buildTugResult({
      features: this.features,
      startedAt: this.startedAt ?? completedAt,
      completedAt,
      durationSeconds: this.durationSeconds,
    });
    const total = Number(tugResult.totalTimeSec.toFixed(2));
    return {
      testType: TIMED_UP_AND_GO_TEST_TYPE,
      primaryValue: total,
      primaryLabel: 'TUG Time',
      repetitionCount: total,
      durationSeconds: this.durationSeconds,
      confidence: tugResult.confidence,
      stabilityScore: clamp(1 - (tugResult.shufflingScore || 0) * 0.6, 0, 1),
      symmetryScore: clamp(1 - (tugResult.armSwingAsymmetry || 0), 0, 1),
      trunkLeanScore: null,
      recommendationLevel: total >= 12 ? 'practice_needed' : 'steady',
      summaryMessage: `${total} seconds measured for Timed Up and Go.`,
      tugResult,
      startedAt: this.startedAt,
      completedAt,
    };
  }

  reset() {
    this.userId = null;
    this.startedAt = null;
    this.latestTimestampMs = null;
    this.frames = [];
    this.features = [];
    this.latestState = defaultState(this.durationSeconds);
  }

  elapsedSeconds(nowMs) {
    const start = this.startedAt ?? nowMs;
    return clamp(Math.floor(Math.max(nowMs - start, 0) / 1000), 0, this.durationSeconds);
  }

  stateFromFeature(feature) {
    const elapsedSeconds = this.elapsedSeconds(feature.timestampMs);
    const phaseMessages = {
      seated: 'Start seated. When ready, stand and walk to the mark.',
      rising: 'Stand fully, then walk at your comfortable pace.',
      standing: 'Walk to the mark, turn slowly, return, and sit.',
      walking: 'Keep walking steadily, turn slowly, and return to the chair.',
      unknown: 'Keep your body visible in the camera view.',
    };

    return {
      repetitionCount: elapsedSeconds,
      primaryValue: elapsedSeconds,
      primaryLabel: 'TUG Time',
      elapsedSeconds,
      durationSeconds: this.durationSeconds,
      confidence: feature.confidence,
      isFullBodyVisible: feature.fullBodyVisible,
      warningMessage: !feature.fullBodyVisible
        ? 'Move back so the full body, chair, and walking path are visible.'
        : feature.feetVisible ? null : 'Keep both feet visible so walking steps can be reviewed.',
      postureMessage: phaseMessages[feature.phase] || phaseMessages.unknown,
      isArmUseSuspected: feature.supportLikely,
      isStandingOrRising: feature.phase === 'standing' || feature.phase === 'rising' || feature.phase === 'walking',
      phase: feature.phase,
      stabilityScore: clamp(1 - feature.lateralSpeed / 1.5, 0, 1),
      symmetryScore: clamp(1 - Math.abs(feature.ankleWidthRatio - 1) / 1.5, 0, 1),
    };
  }

  stateForMissingPose(timestampMs) {
    return {
      repetitionCount: this.elapsedSeconds(timestampMs),
      primaryValue: this.elapsedSeconds(timestampMs),
      primaryLabel: 'TUG Time',
      elapsedSeconds: this.elapsedSeconds(timestampMs),
      durationSeconds: this.durationSeconds,
      confidence: 0,
      isFullBodyVisible: false,
      warningMessage: 'The camera has not found a full-body TUG pose yet.',
      postureMessage: 'Adjust the phone so the chair, body, and walking path are visible.',
      isArmUseSuspected: false,
      isStandingOrRising: false,
      phase: 'unknown',
    };
  }
}

export function analyzeTimedUpAndGoSeries(seriesInput, { durationSeconds = DEFAULT_TUG_DURATION_SECONDS } = {}) {
  const frames = (Array.isArray(seriesInput)
    ? seriesInput
    : seriesInput?.frames || seriesInput?.landmarkSeries?.frames || [])
    .filter(Boolean)
    .map(normalizeFrame)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const analyzer = new TimedUpAndGoAnalyzer({ durationSeconds });
  const startedAt = frames[0]?.timestampMs ?? Date.now();
  analyzer.startSession('offline-sequence', startedAt);
  for (const frame of frames) analyzer.addFrame(frame);
  return analyzer.finishSession(frames.at(-1)?.timestampMs ?? startedAt);
}
