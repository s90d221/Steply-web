import { PoseLandmarks } from './poseLandmarks';

export const DEFAULT_KINEMATIC_MIN_VISIBILITY = 0.45;

const MIN_VECTOR_MAGNITUDE = 0.000001;
const DEFAULT_CENTER_LANDMARKS = [
  PoseLandmarks.LeftShoulder,
  PoseLandmarks.RightShoulder,
  PoseLandmarks.LeftHip,
  PoseLandmarks.RightHip,
  PoseLandmarks.LeftKnee,
  PoseLandmarks.RightKnee,
  PoseLandmarks.LeftAnkle,
  PoseLandmarks.RightAnkle,
];

const LEFT_RIGHT_JOINTS = ['knees', 'hips', 'ankles'];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function landmarkMap(landmarks = []) {
  return new Map((landmarks || []).map((point) => [point.name, point]));
}

export function visibilityOf(point, fallback = 0) {
  if (!point) return 0;
  return Number.isFinite(point.visibility) ? point.visibility : fallback;
}

export function isVisibleLandmark(point, minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY) {
  return Boolean(
    point
      && isFiniteNumber(point.x)
      && isFiniteNumber(point.y)
      && visibilityOf(point, 0) >= minVisibility,
  );
}

export function visibleLandmark(landmarksOrMap, name, minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY) {
  const points = landmarksOrMap instanceof Map ? landmarksOrMap : landmarkMap(landmarksOrMap);
  const point = points.get(name);
  return isVisibleLandmark(point, minVisibility) ? point : null;
}

export function midpoint(first, second) {
  if (!first || !second) return null;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: isFiniteNumber(first.z) && isFiniteNumber(second.z) ? (first.z + second.z) / 2 : null,
  };
}

export function distance(first, second, { includeZ = false } = {}) {
  if (!first || !second || !isFiniteNumber(first.x) || !isFiniteNumber(first.y) || !isFiniteNumber(second.x) || !isFiniteNumber(second.y)) {
    return null;
  }
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const dz = includeZ && isFiniteNumber(first.z) && isFiniteNumber(second.z)
    ? first.z - second.z
    : 0;
  return Math.hypot(dx, dy, dz);
}

export function averageNumbers(values = []) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function calculateAngleDegrees(first, center, third) {
  if (!first || !center || !third) return null;
  if (
    !isFiniteNumber(first.x)
    || !isFiniteNumber(first.y)
    || !isFiniteNumber(center.x)
    || !isFiniteNumber(center.y)
    || !isFiniteNumber(third.x)
    || !isFiniteNumber(third.y)
  ) {
    return null;
  }

  const firstVectorX = first.x - center.x;
  const firstVectorY = first.y - center.y;
  const secondVectorX = third.x - center.x;
  const secondVectorY = third.y - center.y;
  const magnitude = Math.max(
    Math.hypot(firstVectorX, firstVectorY) * Math.hypot(secondVectorX, secondVectorY),
    MIN_VECTOR_MAGNITUDE,
  );
  const dot = firstVectorX * secondVectorX + firstVectorY * secondVectorY;
  return Math.acos(clamp(dot / magnitude, -1, 1)) * 180 / Math.PI;
}

export function calculateJointAngles(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const points = landmarkMap(landmarks);
  const point = (name) => visibleLandmark(points, name, minVisibility);
  const leftHip = point(PoseLandmarks.LeftHip);
  const rightHip = point(PoseLandmarks.RightHip);
  const leftKnee = point(PoseLandmarks.LeftKnee);
  const rightKnee = point(PoseLandmarks.RightKnee);
  const leftAnkle = point(PoseLandmarks.LeftAnkle);
  const rightAnkle = point(PoseLandmarks.RightAnkle);
  const leftShoulder = point(PoseLandmarks.LeftShoulder);
  const rightShoulder = point(PoseLandmarks.RightShoulder);
  const leftFoot = point(PoseLandmarks.LeftFootIndex) || point(PoseLandmarks.LeftHeel);
  const rightFoot = point(PoseLandmarks.RightFootIndex) || point(PoseLandmarks.RightHeel);

  const leftKneeAngle = calculateAngleDegrees(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngleDegrees(rightHip, rightKnee, rightAnkle);
  const leftHipAngle = calculateAngleDegrees(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = calculateAngleDegrees(rightShoulder, rightHip, rightKnee);
  const leftAnkleAngle = calculateAngleDegrees(leftKnee, leftAnkle, leftFoot);
  const rightAnkleAngle = calculateAngleDegrees(rightKnee, rightAnkle, rightFoot);

  return {
    knees: {
      left: leftKneeAngle,
      right: rightKneeAngle,
      average: averageNumbers([leftKneeAngle, rightKneeAngle]),
    },
    hips: {
      left: leftHipAngle,
      right: rightHipAngle,
      average: averageNumbers([leftHipAngle, rightHipAngle]),
    },
    ankles: {
      left: leftAnkleAngle,
      right: rightAnkleAngle,
      average: averageNumbers([leftAnkleAngle, rightAnkleAngle]),
    },
  };
}

export function calculateAngularVelocity(currentAngle, previousAngle, deltaSeconds) {
  if (!Number.isFinite(currentAngle) || !Number.isFinite(previousAngle) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return null;
  }
  return (currentAngle - previousAngle) / deltaSeconds;
}

export function calculateAngularVelocities(currentAngles = {}, previousAngles = {}, deltaSeconds) {
  const velocities = {};
  for (const joint of LEFT_RIGHT_JOINTS) {
    velocities[joint] = {
      left: calculateAngularVelocity(currentAngles[joint]?.left, previousAngles[joint]?.left, deltaSeconds),
      right: calculateAngularVelocity(currentAngles[joint]?.right, previousAngles[joint]?.right, deltaSeconds),
      average: calculateAngularVelocity(currentAngles[joint]?.average, previousAngles[joint]?.average, deltaSeconds),
    };
  }
  return velocities;
}

export function calculateLeftRightAsymmetry(leftValue, rightValue, { normalizer = 180 } = {}) {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
  const signedDifference = leftValue - rightValue;
  const absoluteDifference = Math.abs(signedDifference);
  const denominator = Math.max(Math.abs(normalizer || 0), MIN_VECTOR_MAGNITUDE);
  return {
    signedDifference,
    absoluteDifference,
    normalizedDifference: absoluteDifference / denominator,
  };
}

export function calculateJointAsymmetry(jointAngles = {}) {
  const asymmetry = {};
  for (const joint of LEFT_RIGHT_JOINTS) {
    asymmetry[joint] = calculateLeftRightAsymmetry(jointAngles[joint]?.left, jointAngles[joint]?.right);
  }
  return asymmetry;
}

export function calculateBodyCenter(
  landmarks = [],
  { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY, landmarkNames = DEFAULT_CENTER_LANDMARKS } = {},
) {
  const points = landmarkMap(landmarks);
  const visible = landmarkNames
    .map((name) => visibleLandmark(points, name, minVisibility))
    .filter(Boolean);

  if (!visible.length) return null;

  const center = {
    x: averageNumbers(visible.map((point) => point.x)),
    y: averageNumbers(visible.map((point) => point.y)),
    z: averageNumbers(visible.map((point) => point.z).filter(Number.isFinite)),
    visibility: averageNumbers(visible.map((point) => visibilityOf(point, 0))),
    sampleCount: visible.length,
  };
  return Number.isFinite(center.x) && Number.isFinite(center.y) ? center : null;
}

export function calculateBodyBox(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const visible = (landmarks || []).filter((point) => isVisibleLandmark(point, minVisibility));
  if (!visible.length) return null;
  const xs = visible.map((point) => point.x).filter(Number.isFinite);
  const ys = visible.map((point) => point.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function calculateShoulderCenter(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const points = landmarkMap(landmarks);
  return midpoint(
    visibleLandmark(points, PoseLandmarks.LeftShoulder, minVisibility),
    visibleLandmark(points, PoseLandmarks.RightShoulder, minVisibility),
  );
}

export function calculatePelvisCenter(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const points = landmarkMap(landmarks);
  return midpoint(
    visibleLandmark(points, PoseLandmarks.LeftHip, minVisibility),
    visibleLandmark(points, PoseLandmarks.RightHip, minVisibility),
  );
}

export function calculateTrunkCenter(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  return midpoint(
    calculateShoulderCenter(landmarks, { minVisibility }),
    calculatePelvisCenter(landmarks, { minVisibility }),
  );
}

export function calculateBodyHeight(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const box = calculateBodyBox(landmarks, { minVisibility });
  return box?.height ?? null;
}

export function calculateFootCenter(landmarksOrMap, side, { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const points = landmarksOrMap instanceof Map ? landmarksOrMap : landmarkMap(landmarksOrMap);
  const names = side === 'left'
    ? [PoseLandmarks.LeftAnkle, PoseLandmarks.LeftHeel, PoseLandmarks.LeftFootIndex]
    : [PoseLandmarks.RightAnkle, PoseLandmarks.RightHeel, PoseLandmarks.RightFootIndex];
  const visible = names.map((name) => visibleLandmark(points, name, minVisibility)).filter(Boolean);
  if (!visible.length) return null;
  const center = {
    x: averageNumbers(visible.map((point) => point.x)),
    y: averageNumbers(visible.map((point) => point.y)),
    z: averageNumbers(visible.map((point) => point.z).filter(Number.isFinite)),
    visibility: averageNumbers(visible.map((point) => visibilityOf(point, 0))),
    sampleCount: visible.length,
  };
  return Number.isFinite(center.x) && Number.isFinite(center.y) ? center : null;
}

export function calculateBaseOfSupport(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const points = landmarkMap(landmarks);
  const leftFoot = calculateFootCenter(points, 'left', { minVisibility });
  const rightFoot = calculateFootCenter(points, 'right', { minVisibility });
  if (!leftFoot && !rightFoot) return null;
  if (!leftFoot || !rightFoot) {
    const foot = leftFoot || rightFoot;
    return {
      center: foot,
      width: 0,
      leftFoot,
      rightFoot,
      bothFeetVisible: false,
    };
  }
  return {
    center: midpoint(leftFoot, rightFoot),
    width: distance(leftFoot, rightFoot),
    leftFoot,
    rightFoot,
    bothFeetVisible: true,
  };
}

export function calculateJointAngle(first, center, third) {
  return calculateAngleDegrees(first, center, third);
}

export function normalizeByBodyHeight(value, landmarks = [], options = {}) {
  if (!Number.isFinite(value)) return null;
  const height = calculateBodyHeight(landmarks, options);
  return height && height > 0 ? value / height : null;
}

export function normalizeByShoulderWidth(value, landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  if (!Number.isFinite(value)) return null;
  const points = landmarkMap(landmarks);
  const width = distance(
    visibleLandmark(points, PoseLandmarks.LeftShoulder, minVisibility),
    visibleLandmark(points, PoseLandmarks.RightShoulder, minVisibility),
  );
  return width && width > 0 ? value / width : null;
}

export function calculateTrunkLean(landmarks = [], { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY } = {}) {
  const points = landmarkMap(landmarks);
  const leftShoulder = visibleLandmark(points, PoseLandmarks.LeftShoulder, minVisibility);
  const rightShoulder = visibleLandmark(points, PoseLandmarks.RightShoulder, minVisibility);
  const leftHip = visibleLandmark(points, PoseLandmarks.LeftHip, minVisibility);
  const rightHip = visibleLandmark(points, PoseLandmarks.RightHip, minVisibility);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder) || 0, 0.08);
  const lateralOffset = Math.abs(shoulderCenter.x - hipCenter.x) / shoulderWidth;
  const angleDegrees = Math.atan2(
    Math.abs(shoulderCenter.x - hipCenter.x),
    Math.abs(shoulderCenter.y - hipCenter.y) + MIN_VECTOR_MAGNITUDE,
  ) * 180 / Math.PI;

  return {
    angleDegrees,
    lateralOffset,
    score: clamp(1 - lateralOffset / 0.75, 0, 1),
    shoulderCenter,
    hipCenter,
  };
}

export function calculateLandmarkDisplacement(
  currentLandmarks = [],
  previousLandmarks = [],
  { minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY, landmarkNames = DEFAULT_CENTER_LANDMARKS } = {},
) {
  const current = landmarkMap(currentLandmarks);
  const previous = landmarkMap(previousLandmarks);
  const byLandmark = {};
  const planarDistances = [];
  const spatialDistances = [];

  for (const name of landmarkNames) {
    const currentPoint = visibleLandmark(current, name, minVisibility);
    const previousPoint = visibleLandmark(previous, name, minVisibility);
    if (!currentPoint || !previousPoint) continue;
    const dx = currentPoint.x - previousPoint.x;
    const dy = currentPoint.y - previousPoint.y;
    const dz = isFiniteNumber(currentPoint.z) && isFiniteNumber(previousPoint.z)
      ? currentPoint.z - previousPoint.z
      : null;
    const planarDistance = Math.hypot(dx, dy);
    const spatialDistance = dz === null ? planarDistance : Math.hypot(dx, dy, dz);
    byLandmark[name] = {
      dx,
      dy,
      dz,
      planarDistance,
      spatialDistance,
    };
    planarDistances.push(planarDistance);
    spatialDistances.push(spatialDistance);
  }

  return {
    sampleCount: planarDistances.length,
    averagePlanarDistance: averageNumbers(planarDistances),
    averageSpatialDistance: averageNumbers(spatialDistances),
    byLandmark,
  };
}

function axisStats(points, key) {
  const values = points.map((point) => point[key]).filter(Number.isFinite);
  if (values.length < 2) {
    return {
      range: null,
      standardDeviation: null,
      meanAbsoluteVelocity: null,
    };
  }

  const mean = averageNumbers(values);
  const variance = averageNumbers(values.map((value) => (value - mean) ** 2));
  const deltas = [];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const deltaSeconds = (current.timestampMs - previous.timestampMs) / 1000;
    if (Number.isFinite(current[key]) && Number.isFinite(previous[key]) && deltaSeconds > 0) {
      deltas.push(Math.abs(current[key] - previous[key]) / deltaSeconds);
    }
  }

  return {
    range: Math.max(...values) - Math.min(...values),
    standardDeviation: Math.sqrt(variance),
    meanAbsoluteVelocity: averageNumbers(deltas),
  };
}

export function calculateSwayMetrics(
  frames = [],
  {
    minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY,
    landmarkNames = DEFAULT_CENTER_LANDMARKS,
    windowMs = null,
  } = {},
) {
  const latestTimestampMs = frames.at(-1)?.timestampMs;
  const sampledFrames = Number.isFinite(windowMs) && Number.isFinite(latestTimestampMs)
    ? frames.filter((frame) => latestTimestampMs - frame.timestampMs <= windowMs)
    : frames;
  const centers = sampledFrames
    .map((frame) => {
      const center = calculateBodyCenter(frame.landmarks, { minVisibility, landmarkNames });
      return center ? { ...center, timestampMs: frame.timestampMs } : null;
    })
    .filter(Boolean);

  if (centers.length < 2) {
    return {
      sampleCount: centers.length,
      durationMs: 0,
      lateral: axisStats(centers, 'x'),
      anteriorPosterior: axisStats(centers, 'z'),
      anteriorPosteriorAxis: 'z',
      centerPathLength: null,
    };
  }

  const hasDepth = centers.filter((center) => Number.isFinite(center.z)).length >= 2;
  const anteriorPosteriorAxis = hasDepth ? 'z' : 'y';
  let centerPathLength = 0;
  for (let index = 1; index < centers.length; index += 1) {
    const current = centers[index];
    const previous = centers[index - 1];
    const dz = hasDepth && Number.isFinite(current.z) && Number.isFinite(previous.z)
      ? current.z - previous.z
      : 0;
    centerPathLength += Math.hypot(current.x - previous.x, current.y - previous.y, dz);
  }

  return {
    sampleCount: centers.length,
    durationMs: centers.at(-1).timestampMs - centers[0].timestampMs,
    lateral: axisStats(centers, 'x'),
    anteriorPosterior: axisStats(centers, anteriorPosteriorAxis),
    anteriorPosteriorAxis,
    centerPathLength,
  };
}

export function derivePoseMetrics({
  currentFrame,
  previousFrame = null,
  frames = [],
  minVisibility = DEFAULT_KINEMATIC_MIN_VISIBILITY,
} = {}) {
  if (!currentFrame?.landmarks) {
    return {
      jointAngles: calculateJointAngles([], { minVisibility }),
      angularVelocities: calculateAngularVelocities({}, {}, null),
      asymmetry: calculateJointAsymmetry({}),
      trunkLean: null,
      bodyCenter: null,
      displacement: null,
      sway: calculateSwayMetrics([], { minVisibility }),
    };
  }

  const jointAngles = calculateJointAngles(currentFrame.landmarks, { minVisibility });
  const previousAngles = previousFrame?.landmarks
    ? calculateJointAngles(previousFrame.landmarks, { minVisibility })
    : {};
  const deltaSeconds = previousFrame?.timestampMs
    ? (currentFrame.timestampMs - previousFrame.timestampMs) / 1000
    : null;

  return {
    jointAngles,
    angularVelocities: calculateAngularVelocities(jointAngles, previousAngles, deltaSeconds),
    asymmetry: calculateJointAsymmetry(jointAngles),
    trunkLean: calculateTrunkLean(currentFrame.landmarks, { minVisibility }),
    bodyCenter: calculateBodyCenter(currentFrame.landmarks, { minVisibility }),
    displacement: previousFrame?.landmarks
      ? calculateLandmarkDisplacement(currentFrame.landmarks, previousFrame.landmarks, { minVisibility })
      : null,
    sway: calculateSwayMetrics(frames, { minVisibility }),
  };
}
