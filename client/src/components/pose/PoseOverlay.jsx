import { useEffect, useMemo, useRef, useState } from 'react';
import { PoseConnections } from '../../pose/poseLandmarks';

export const POSE_OVERLAY_MIN_VISIBILITY = 0.35;

export function pointByName(landmarks, minVisibility = POSE_OVERLAY_MIN_VISIBILITY) {
  const map = new Map();
  for (const point of landmarks || []) {
    if ((point.visibility ?? 1) >= minVisibility) map.set(point.name, point);
  }
  return map;
}

export function posePointToOverlayPercent(point) {
  if (!point) return null;
  return {
    x: point.x * 100,
    y: point.y * 100,
  };
}

export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) => (
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height }
      ));
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export function mediaRectForObjectFit(frameSize, containerSize, fit = 'contain') {
  const frameWidth = Number(frameSize?.width);
  const frameHeight = Number(frameSize?.height);
  const containerWidth = Number(containerSize?.width);
  const containerHeight = Number(containerSize?.height);

  if (
    !Number.isFinite(frameWidth)
    || !Number.isFinite(frameHeight)
    || !Number.isFinite(containerWidth)
    || !Number.isFinite(containerHeight)
    || frameWidth <= 0
    || frameHeight <= 0
    || containerWidth <= 0
    || containerHeight <= 0
  ) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const frameRatio = frameWidth / frameHeight;
  const containerRatio = containerWidth / containerHeight;
  const shouldCover = fit === 'cover';

  if (containerRatio > frameRatio) {
    const width = shouldCover ? 100 : (frameRatio / containerRatio) * 100;
    const height = shouldCover ? (containerRatio / frameRatio) * 100 : 100;
    return {
      x: (100 - width) / 2,
      y: (100 - height) / 2,
      width,
      height,
    };
  }

  const width = shouldCover ? (frameRatio / containerRatio) * 100 : 100;
  const height = shouldCover ? 100 : (containerRatio / frameRatio) * 100;
  return {
    x: (100 - width) / 2,
    y: (100 - height) / 2,
    width,
    height,
  };
}

export function mapPointToMediaRect(point, mediaRect) {
  if (!point) return null;
  return {
    x: mediaRect.x + point.x * mediaRect.width,
    y: mediaRect.y + point.y * mediaRect.height,
  };
}

export function PoseOverlay({ landmarks, rawLandmarks = [], showRaw = false, frameSize, fit = 'contain' }) {
  const [overlayRef, overlaySize] = useElementSize();
  const visibleLandmarks = landmarks || [];
  const pointMap = pointByName(visibleLandmarks);
  const rawPointMap = pointByName(rawLandmarks || [], 0.2);
  const mediaRect = useMemo(
    () => mediaRectForObjectFit(frameSize, overlaySize, fit),
    [fit, frameSize, overlaySize],
  );

  return (
    <svg ref={overlayRef} className="pose-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {showRaw ? PoseConnections.map(([from, to]) => {
        const a = rawPointMap.get(from);
        const b = rawPointMap.get(to);
        if (!a || !b) return null;
        const start = mapPointToMediaRect(a, mediaRect);
        const end = mapPointToMediaRect(b, mediaRect);
        return (
          <line
            key={`raw-${from}-${to}`}
            className="pose-overlay__raw-line"
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            vectorEffect="non-scaling-stroke"
          />
        );
      }) : null}
      {PoseConnections.map(([from, to]) => {
        const a = pointMap.get(from);
        const b = pointMap.get(to);
        if (!a || !b) return null;
        const start = mapPointToMediaRect(a, mediaRect);
        const end = mapPointToMediaRect(b, mediaRect);
        return (
          <line
            key={`${from}-${to}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {visibleLandmarks
        .filter((point) => (point.visibility ?? 1) >= 0.35)
        .map((point) => {
          const overlayPoint = mapPointToMediaRect(point, mediaRect);
          return (
            <circle
              key={point.name}
              cx={overlayPoint.x}
              cy={overlayPoint.y}
              r="0.9"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      {showRaw ? (rawLandmarks || [])
        .filter((point) => (point.visibility ?? 1) >= 0.2)
        .map((point) => {
          const overlayPoint = mapPointToMediaRect(point, mediaRect);
          return (
            <circle
              key={`raw-${point.name}`}
              className="pose-overlay__raw-point"
              cx={overlayPoint.x}
              cy={overlayPoint.y}
              r="0.55"
              vectorEffect="non-scaling-stroke"
            />
          );
        }) : null}
    </svg>
  );
}
