import { PoseLandmarks } from './poseLandmarks';

export const AR_GAME_TARGET_REPETITIONS = 10;

export const ArExerciseGameTypes = {
  BubbleLegRaise: 'bubble_leg_raise',
  StarKneeExtension: 'star_knee_extension',
  ButterflyBalance: 'butterfly_balance',
};

export const ArExerciseGameLabels = {
  [ArExerciseGameTypes.BubbleLegRaise]: 'Side Leg Bubble Pop',
  [ArExerciseGameTypes.StarKneeExtension]: 'Knee Extension Star Reach',
  [ArExerciseGameTypes.ButterflyBalance]: 'Balance Butterfly Hold',
};

export const ArExerciseGameConfig = {
  // Spec 4.4, Otago [21][23]: one set is counted to 10 repetitions.
  targetRepetitions: AR_GAME_TARGET_REPETITIONS,
  bubbleLegRaise: {
    targetAngleDegrees: 28,
    resetAngleDegrees: 14,
  },
  starKneeExtension: {
    targetKneeAngleDegrees: 160,
    resetKneeAngleDegrees: 135,
  },
  butterflyBalance: {
    targetHoldMs: 2500,
    maxCenterSpeedPerSecond: 0.7,
    minOneLegLiftRatio: 0.08,
  },
};

const BUBBLE_KEYS = new Set(['side_leg_raise', 'side_hip_strengthening']);
const STAR_KEYS = new Set(['knee_extension', 'sit_to_stand', 'chair_stand']);
const BUTTERFLY_KEYS = new Set(['balance_retraining', 'tandem_stance', 'tandem_walk', 'one_leg_stance']);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function pointMap(landmarks = [], minVisibility = 0.35) {
  const map = new Map();
  for (const point of landmarks || []) {
    if ((point.visibility ?? 1) >= minVisibility) map.set(point.name, point);
  }
  return map;
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: finite(a.z) && finite(b.z) ? (a.z + b.z) / 2 : null,
  };
}

function distance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDegrees(a, center, c) {
  if (!a || !center || !c) return null;
  const ax = a.x - center.x;
  const ay = a.y - center.y;
  const cx = c.x - center.x;
  const cy = c.y - center.y;
  const magnitude = Math.max(Math.hypot(ax, ay) * Math.hypot(cx, cy), 0.0001);
  return Math.acos(clamp((ax * cx + ay * cy) / magnitude, -1, 1)) * 180 / Math.PI;
}

function overlayPoint(point) {
  if (!point) return null;
  return {
    x: clamp(point.x, 0, 1) * 100,
    y: clamp(point.y, 0, 1) * 100,
  };
}

function landmarksFor(landmarks) {
  const points = pointMap(landmarks);
  const leftShoulder = points.get(PoseLandmarks.LeftShoulder);
  const rightShoulder = points.get(PoseLandmarks.RightShoulder);
  const leftHip = points.get(PoseLandmarks.LeftHip);
  const rightHip = points.get(PoseLandmarks.RightHip);
  const leftKnee = points.get(PoseLandmarks.LeftKnee);
  const rightKnee = points.get(PoseLandmarks.RightKnee);
  const leftAnkle = points.get(PoseLandmarks.LeftAnkle);
  const rightAnkle = points.get(PoseLandmarks.RightAnkle);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const bodyCenter = midpoint(shoulderCenter, hipCenter) || hipCenter || shoulderCenter;
  const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder) || 0, 0.08);
  const hipWidth = Math.max(distance(leftHip, rightHip) || 0, shoulderWidth * 0.75, 0.08);
  const bodyHeight = (() => {
    const ys = [...points.values()].map((point) => point.y).filter(finite);
    return ys.length ? Math.max(...ys) - Math.min(...ys) : 0.5;
  })();

  return {
    points,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    shoulderCenter,
    hipCenter,
    bodyCenter,
    shoulderWidth,
    hipWidth,
    bodyHeight: Math.max(bodyHeight, 0.35),
  };
}

export function gameTypeForRecommendation(recommendation = {}) {
  const keys = [
    recommendation.arInputKey,
    recommendation.exerciseKey,
    recommendation.gameType,
  ].filter(Boolean);
  if (keys.some((key) => BUBBLE_KEYS.has(key))) return ArExerciseGameTypes.BubbleLegRaise;
  if (keys.some((key) => STAR_KEYS.has(key))) return ArExerciseGameTypes.StarKneeExtension;
  if (keys.some((key) => BUTTERFLY_KEYS.has(key))) return ArExerciseGameTypes.ButterflyBalance;
  return null;
}

export function createInitialArGameState(gameType = ArExerciseGameTypes.BubbleLegRaise) {
  return {
    gameType,
    count: 0,
    targetRepetitions: ArExerciseGameConfig.targetRepetitions,
    progress: 0,
    armed: true,
    setComplete: false,
    lastTimestampMs: null,
    holdMs: 0,
    burstKey: 0,
    prompt: 'Step into the camera view to begin.',
    activeSide: null,
    target: { x: 50, y: 50 },
    foot: null,
    metrics: {},
  };
}

function nextCountState(state, timestampMs) {
  const nextCount = Math.min(state.targetRepetitions, state.count + 1);
  return {
    count: nextCount,
    setComplete: nextCount >= state.targetRepetitions,
    burstKey: timestampMs || Date.now(),
  };
}

function sideLegRaiseMetric(landmarks) {
  const pose = landmarksFor(landmarks);
  const sides = [
    {
      side: 'left',
      hip: pose.leftHip,
      knee: pose.leftKnee,
      ankle: pose.leftAnkle,
      direction: -1,
    },
    {
      side: 'right',
      hip: pose.rightHip,
      knee: pose.rightKnee,
      ankle: pose.rightAnkle,
      direction: 1,
    },
  ].map((item) => {
    if (!item.hip || !item.ankle) return { ...item, angleDegrees: 0, foot: null };
    const lateralLift = Math.max(0, (item.ankle.x - item.hip.x) * item.direction);
    const verticalDrop = Math.max(0.02, item.ankle.y - item.hip.y);
    const angle = Math.atan2(lateralLift, verticalDrop) * 180 / Math.PI;
    return {
      ...item,
      angleDegrees: angle,
      foot: overlayPoint(item.ankle),
      knee: overlayPoint(item.knee),
      hip: overlayPoint(item.hip),
      hipWidthPercent: pose.hipWidth * 100,
      bodyHeightPercent: pose.bodyHeight * 100,
    };
  });
  const active = sides[0].angleDegrees >= sides[1].angleDegrees ? sides[0] : sides[1];
  return {
    available: Boolean(active.hip && active.ankle),
    activeSide: active.side,
    angleDegrees: active.angleDegrees,
    foot: active.foot,
    knee: active.knee,
    hip: active.hip,
    direction: active.direction,
    hipWidthPercent: active.hipWidthPercent,
    bodyHeightPercent: active.bodyHeightPercent,
  };
}

function updateBubbleGame(previousState, landmarks, timestampMs) {
  const metric = sideLegRaiseMetric(landmarks);
  const target = ArExerciseGameConfig.bubbleLegRaise;
  if (!metric.available) {
    return {
      ...previousState,
      progress: 0,
      prompt: 'Keep your hip, knee, and ankle visible.',
      metrics: metric,
      lastTimestampMs: timestampMs,
    };
  }

  const progress = clamp(metric.angleDegrees / target.targetAngleDegrees);
  const reached = metric.angleDegrees >= target.targetAngleDegrees;
  const reset = metric.angleDegrees <= target.resetAngleDegrees;
  const counted = previousState.armed && reached && !previousState.setComplete;
  const countPatch = counted ? nextCountState(previousState, timestampMs) : {};
  const foot = metric.foot || { x: 50, y: 76 };
  const knee = metric.knee || foot;
  const hip = metric.hip || knee;
  const lateralOffset = clamp((metric.hipWidthPercent || 12) * 1.2, 10, 22);
  const liftOffset = clamp((metric.bodyHeightPercent || 48) * 0.22, 12, 24);
  const direction = metric.direction || (metric.activeSide === 'left' ? -1 : 1);
  const targetX = clamp(hip.x + direction * lateralOffset, 8, 92);
  const targetY = clamp(knee.y - liftOffset, 8, 82);

  return {
    ...previousState,
    ...countPatch,
    progress,
    armed: counted ? false : previousState.armed || reset,
    activeSide: metric.activeSide,
    target: { x: targetX, y: targetY },
    foot,
    prompt: counted
      ? 'Bubble popped. Nice control.'
      : previousState.setComplete
        ? 'You completed the 10-rep set.'
        : 'Lift one leg gently out to the side.',
    metrics: {
      ...metric,
      targetAngleDegrees: target.targetAngleDegrees,
      resetAngleDegrees: target.resetAngleDegrees,
    },
    lastTimestampMs: timestampMs,
  };
}

function kneeExtensionMetric(landmarks) {
  const pose = landmarksFor(landmarks);
  const leftAngle = angleDegrees(pose.leftHip, pose.leftKnee, pose.leftAnkle);
  const rightAngle = angleDegrees(pose.rightHip, pose.rightKnee, pose.rightAnkle);
  const availableAngles = [
    { side: 'left', angleDegrees: leftAngle, ankle: pose.leftAnkle, knee: pose.leftKnee },
    { side: 'right', angleDegrees: rightAngle, ankle: pose.rightAnkle, knee: pose.rightKnee },
  ].filter((item) => finite(item.angleDegrees));
  const active = availableAngles.sort((a, b) => b.angleDegrees - a.angleDegrees)[0] || null;
  const averageAngle = availableAngles.length
    ? availableAngles.reduce((sum, item) => sum + item.angleDegrees, 0) / availableAngles.length
    : null;
  return {
    available: Boolean(active),
    activeSide: active?.side ?? null,
    kneeAngleDegrees: active?.angleDegrees ?? 0,
    averageKneeAngleDegrees: averageAngle,
    ankle: overlayPoint(active?.ankle),
    knee: overlayPoint(active?.knee),
  };
}

function updateStarGame(previousState, landmarks, timestampMs) {
  const metric = kneeExtensionMetric(landmarks);
  const target = ArExerciseGameConfig.starKneeExtension;
  if (!metric.available) {
    return {
      ...previousState,
      progress: 0,
      prompt: 'Keep your hip, knee, and ankle visible.',
      metrics: metric,
      lastTimestampMs: timestampMs,
    };
  }

  const progress = clamp((metric.kneeAngleDegrees - target.resetKneeAngleDegrees)
    / (target.targetKneeAngleDegrees - target.resetKneeAngleDegrees));
  const reached = metric.kneeAngleDegrees >= target.targetKneeAngleDegrees;
  const reset = metric.kneeAngleDegrees <= target.resetKneeAngleDegrees;
  const counted = previousState.armed && reached && !previousState.setComplete;
  const countPatch = counted ? nextCountState(previousState, timestampMs) : {};
  const ankle = metric.ankle || { x: 50, y: 76 };
  const starY = clamp(ankle.y - 42 * progress, 10, 86);

  return {
    ...previousState,
    ...countPatch,
    progress,
    armed: counted ? false : previousState.armed || reset,
    activeSide: metric.activeSide,
    target: { x: ankle.x, y: starY },
    foot: ankle,
    prompt: counted
      ? 'Star reached. Smooth movement.'
      : previousState.setComplete
        ? 'You completed the 10-rep set.'
        : 'Straighten your knee slowly.',
    metrics: {
      ...metric,
      targetKneeAngleDegrees: target.targetKneeAngleDegrees,
      resetKneeAngleDegrees: target.resetKneeAngleDegrees,
    },
    lastTimestampMs: timestampMs,
  };
}

function balanceMetric(landmarks, exerciseKey) {
  const pose = landmarksFor(landmarks);
  const center = overlayPoint(pose.bodyCenter);
  const leftVisible = Boolean(pose.leftAnkle);
  const rightVisible = Boolean(pose.rightAnkle);
  const bothFeetVisible = leftVisible && rightVisible;
  const lateralSeparation = bothFeetVisible ? Math.abs(pose.leftAnkle.x - pose.rightAnkle.x) / pose.shoulderWidth : null;
  const apSeparation = bothFeetVisible
    ? Math.abs((finite(pose.leftAnkle.z) && finite(pose.rightAnkle.z))
      ? pose.leftAnkle.z - pose.rightAnkle.z
      : pose.leftAnkle.y - pose.rightAnkle.y) / pose.shoulderWidth
    : null;
  const verticalLiftRatio = bothFeetVisible
    ? Math.abs(pose.leftAnkle.y - pose.rightAnkle.y) / pose.bodyHeight
    : 0;
  const oneLegProgress = clamp(verticalLiftRatio / ArExerciseGameConfig.butterflyBalance.minOneLegLiftRatio);
  const tandemProgress = bothFeetVisible
    ? clamp(Math.min(
      lateralSeparation === null ? 0 : (0.55 - lateralSeparation) / 0.35,
      apSeparation === null ? 0.5 : apSeparation / 0.12,
    ))
    : 0;
  const wantsOneLeg = exerciseKey === 'one_leg_stance';
  const stanceProgress = wantsOneLeg ? oneLegProgress : Math.max(tandemProgress, oneLegProgress * 0.8);

  return {
    available: Boolean(pose.bodyCenter && pose.leftHip && pose.rightHip),
    center,
    stanceProgress,
    oneLegProgress,
    tandemProgress,
    lateralSeparation,
    apSeparation,
    verticalLiftRatio,
  };
}

function centerSpeed(previousState, center, timestampMs) {
  const previousCenter = previousState.metrics?.center;
  const previousTimestamp = previousState.lastTimestampMs;
  if (!previousCenter || !center || !finite(previousTimestamp) || !finite(timestampMs)) return 0;
  const deltaSeconds = Math.max((timestampMs - previousTimestamp) / 1000, 0.001);
  return Math.hypot(center.x - previousCenter.x, center.y - previousCenter.y) / 100 / deltaSeconds;
}

function updateButterflyGame(previousState, landmarks, timestampMs, recommendation = {}) {
  const metric = balanceMetric(landmarks, recommendation.exerciseKey || recommendation.arInputKey);
  const target = ArExerciseGameConfig.butterflyBalance;
  if (!metric.available) {
    return {
      ...previousState,
      progress: 0,
      holdMs: 0,
      prompt: 'Keep your full body inside the camera view.',
      metrics: metric,
      lastTimestampMs: timestampMs,
    };
  }

  const speed = centerSpeed(previousState, metric.center, timestampMs);
  const stable = metric.stanceProgress >= 0.85 && speed <= target.maxCenterSpeedPerSecond;
  const deltaMs = finite(previousState.lastTimestampMs)
    ? Math.max(timestampMs - previousState.lastTimestampMs, 0)
    : 0;
  const holdMs = stable && !previousState.setComplete
    ? Math.min(target.targetHoldMs, previousState.holdMs + deltaMs)
    : Math.max(0, previousState.holdMs - deltaMs * 0.7);
  const reached = holdMs >= target.targetHoldMs;
  const counted = reached && previousState.armed && !previousState.setComplete;
  const countPatch = counted ? nextCountState(previousState, timestampMs) : {};
  const nextHoldMs = counted ? 0 : holdMs;
  const center = metric.center || { x: 50, y: 50 };

  return {
    ...previousState,
    ...countPatch,
    progress: clamp(nextHoldMs / target.targetHoldMs),
    holdMs: nextHoldMs,
    armed: counted ? false : previousState.armed || metric.stanceProgress < 0.45,
    target: {
      x: clamp(center.x + Math.sin((previousState.count + 1) * 1.7) * 18, 12, 88),
      y: clamp(center.y - 22 - Math.cos((previousState.count + 1) * 1.2) * 8, 10, 72),
    },
    prompt: counted
      ? 'Butterfly reached. Keep breathing.'
      : previousState.setComplete
        ? 'You completed the 10-rep set.'
        : 'Hold this balance position gently.',
    metrics: {
      ...metric,
      center: metric.center,
      centerSpeedPerSecond: speed,
      stable,
      targetHoldMs: target.targetHoldMs,
    },
    lastTimestampMs: timestampMs,
  };
}

export function updateArExerciseGame(previousState, {
  landmarks = [],
  recommendation = {},
  timestampMs = performance.now(),
} = {}) {
  const gameType = previousState?.gameType || gameTypeForRecommendation(recommendation);
  const state = previousState || createInitialArGameState(gameType);
  if (state.setComplete) return { ...state, lastTimestampMs: timestampMs };

  if (gameType === ArExerciseGameTypes.BubbleLegRaise) {
    return updateBubbleGame(state, landmarks, timestampMs);
  }
  if (gameType === ArExerciseGameTypes.StarKneeExtension) {
    return updateStarGame(state, landmarks, timestampMs);
  }
  if (gameType === ArExerciseGameTypes.ButterflyBalance) {
    return updateButterflyGame(state, landmarks, timestampMs, recommendation);
  }
  return {
    ...state,
    prompt: 'Choose an exercise to begin.',
    lastTimestampMs: timestampMs,
  };
}
