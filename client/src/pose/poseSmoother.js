import { normalizePoseLandmarks } from './poseTimeSeries';

export const PoseSmoothingModes = {
  Balance: 'BALANCE',
  Chair: 'CHAIR',
  Tug: 'TUG',
  Game: 'GAME',
};

const MODE_CONFIG = {
  [PoseSmoothingModes.Balance]: {
    alpha: 0.3,
    visibilityAlpha: 0.38,
    minVisibility: 0.38,
    outlierDistance: 0.12,
    maxInterpolationFrames: 3,
    interpolationVisibilityDecay: 0.72,
  },
  [PoseSmoothingModes.Chair]: {
    alpha: 0.42,
    visibilityAlpha: 0.48,
    minVisibility: 0.38,
    outlierDistance: 0.16,
    maxInterpolationFrames: 2,
    interpolationVisibilityDecay: 0.68,
  },
  [PoseSmoothingModes.Tug]: {
    alpha: 0.5,
    visibilityAlpha: 0.55,
    minVisibility: 0.36,
    outlierDistance: 0.21,
    maxInterpolationFrames: 2,
    interpolationVisibilityDecay: 0.62,
  },
  [PoseSmoothingModes.Game]: {
    alpha: 0.68,
    visibilityAlpha: 0.7,
    minVisibility: 0.32,
    outlierDistance: 0.26,
    maxInterpolationFrames: 1,
    interpolationVisibilityDecay: 0.55,
  },
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(previous, next, alpha) {
  if (!finite(previous)) return finite(next) ? next : null;
  if (!finite(next)) return previous;
  return previous + (next - previous) * alpha;
}

function landmarkDistance(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) {
    return null;
  }
  const dz = finite(first.z) && finite(second.z) ? first.z - second.z : 0;
  return Math.hypot(first.x - second.x, first.y - second.y, dz);
}

function smoothPoint(previous, raw, config) {
  if (!previous) return { ...raw, visibility: clamp(raw.visibility ?? 0) };
  return {
    ...raw,
    x: lerp(previous.x, raw.x, config.alpha),
    y: lerp(previous.y, raw.y, config.alpha),
    z: lerp(previous.z, raw.z, config.alpha),
    visibility: clamp(lerp(previous.visibility ?? 0, raw.visibility ?? 0, config.visibilityAlpha)),
  };
}

function interpolatedPoint(previous, config) {
  if (!previous) return null;
  return {
    ...previous,
    visibility: clamp((previous.visibility ?? 0) * config.interpolationVisibilityDecay),
    interpolated: true,
  };
}

export function smoothingModeForTest(testType = '') {
  if (testType === 'four_stage_balance' || testType === 'balance_hold' || testType === 'standing_posture') {
    return PoseSmoothingModes.Balance;
  }
  if (testType === 'timed_up_and_go') return PoseSmoothingModes.Tug;
  if (String(testType).includes('game') || String(testType).includes('ar')) return PoseSmoothingModes.Game;
  return PoseSmoothingModes.Chair;
}

export class PoseSmoother {
  constructor({ mode = PoseSmoothingModes.Chair } = {}) {
    this.mode = mode;
    this.config = MODE_CONFIG[mode] || MODE_CONFIG[PoseSmoothingModes.Chair];
    this.reset();
  }

  setMode(mode) {
    const nextMode = MODE_CONFIG[mode] ? mode : PoseSmoothingModes.Chair;
    if (nextMode === this.mode) return;
    this.mode = nextMode;
    this.config = MODE_CONFIG[nextMode];
    this.reset();
  }

  reset() {
    this.previousByName = new Map();
    this.sequence = 0;
  }

  smooth(rawLandmarks = [], { timestampMs = Date.now() } = {}) {
    const normalized = normalizePoseLandmarks(rawLandmarks);
    const nextByName = new Map();
    let rawVisibleCount = 0;
    let smoothedVisibleCount = 0;
    let interpolatedCount = 0;
    let rejectedOutlierCount = 0;

    const landmarks = normalized.map((raw) => {
      const previousState = this.previousByName.get(raw.name);
      const previous = previousState?.point || null;
      const rawVisibility = clamp(raw.visibility ?? 0);
      const rawVisible = rawVisibility >= this.config.minVisibility && finite(raw.x) && finite(raw.y);
      if (rawVisible) rawVisibleCount += 1;

      let point = null;
      let rejectedOutlier = false;
      if (rawVisible) {
        const jump = landmarkDistance(raw, previous);
        rejectedOutlier = Boolean(
          previous
            && (previous.visibility ?? 0) >= this.config.minVisibility
            && finite(jump)
            && jump > this.config.outlierDistance
        );
        if (rejectedOutlier) {
          rejectedOutlierCount += 1;
          point = {
            ...previous,
            visibility: clamp(Math.min(previous.visibility ?? 0, rawVisibility) * 0.76),
            outlierRejected: true,
          };
        } else {
          point = smoothPoint(previous, raw, this.config);
        }
      } else if (previousState && previousState.missingFrames < this.config.maxInterpolationFrames) {
        point = interpolatedPoint(previous, this.config);
        interpolatedCount += 1;
      } else {
        point = { ...raw, visibility: 0 };
      }

      if ((point.visibility ?? 0) >= this.config.minVisibility) smoothedVisibleCount += 1;
      nextByName.set(raw.name, {
        point,
        missingFrames: rawVisible && !rejectedOutlier ? 0 : (previousState?.missingFrames || 0) + 1,
      });
      return point;
    });

    this.previousByName = nextByName;
    this.sequence += 1;

    return {
      landmarks,
      rawLandmarks: normalized,
      smoothing: {
        mode: this.mode,
        timestampMs,
        sequence: this.sequence,
        rawVisibleCount,
        smoothedVisibleCount,
        interpolatedCount,
        rejectedOutlierCount,
      },
    };
  }
}

export function createPoseSmootherForTest(testType) {
  return new PoseSmoother({ mode: smoothingModeForTest(testType) });
}
