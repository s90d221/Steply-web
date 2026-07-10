import { useEffect, useMemo, useState } from 'react';
import {
  mapPointToMediaRect,
  mediaRectForObjectFit,
  PoseOverlay,
  useElementSize,
} from './pose/PoseOverlay';
import {
  ArExerciseGameLabels,
  ArExerciseGameTypes,
  createInitialArGameState,
  gameTypeForRecommendation,
  updateArExerciseGame,
} from '../pose/arExerciseEngine';
import { SteplyButton } from './SteplyPrimitives';

function gameObjectLabel(gameType) {
  if (gameType === ArExerciseGameTypes.BubbleLegRaise) return '○';
  if (gameType === ArExerciseGameTypes.StarKneeExtension) return '★';
  return '';
}

function gameObjectClass(gameType, burstKey) {
  const base = gameType === ArExerciseGameTypes.BubbleLegRaise
    ? 'ar-game-object ar-game-object--bubble'
    : gameType === ArExerciseGameTypes.StarKneeExtension
      ? 'ar-game-object ar-game-object--star'
      : 'ar-game-object ar-game-object--butterfly';
  return burstKey ? `${base} ar-game-object--burst` : base;
}

function ButterflyObject() {
  return (
    <span className="ar-game-butterfly" aria-hidden="true">
      <span className="ar-game-butterfly__wing ar-game-butterfly__wing--left" />
      <span className="ar-game-butterfly__body" />
      <span className="ar-game-butterfly__wing ar-game-butterfly__wing--right" />
    </span>
  );
}

function RecommendationTabs({ recommendations, activeIndex, onSelect }) {
  if (recommendations.length <= 1) return null;
  return (
    <div className="ar-game-tabs" role="tablist" aria-label="AR exercise games">
      {recommendations.map((recommendation, index) => (
        <button
          key={`${recommendation.exerciseKey || recommendation.title}-${index}`}
          type="button"
          className={index === activeIndex ? 'ar-game-tab ar-game-tab--active' : 'ar-game-tab'}
          onClick={() => onSelect(index)}
        >
          {recommendation.title}
        </button>
      ))}
    </div>
  );
}

export function ArExerciseGame({
  recommendations = [],
  remoteCameraFrame,
  poseAnalysis,
  onGameStateChange,
}) {
  const playableRecommendations = useMemo(
    () => recommendations.filter((recommendation) => gameTypeForRecommendation(recommendation)),
    [recommendations],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRecommendation = playableRecommendations[activeIndex] || playableRecommendations[0] || null;
  const gameType = activeRecommendation ? gameTypeForRecommendation(activeRecommendation) : null;
  const [gameState, setGameState] = useState(() => createInitialArGameState(gameType, activeRecommendation));
  const [stageRef, stageSize] = useElementSize();
  const frameAspectRatio = poseAnalysis?.frameSize?.width && poseAnalysis?.frameSize?.height
    ? poseAnalysis.frameSize.width / poseAnalysis.frameSize.height
    : null;

  useEffect(() => {
    if (activeIndex >= playableRecommendations.length) setActiveIndex(0);
  }, [activeIndex, playableRecommendations.length]);

  useEffect(() => {
    if (!gameType) return;
    setGameState(createInitialArGameState(gameType, activeRecommendation));
  }, [gameType, activeRecommendation?.exerciseKey, activeRecommendation?.arInputKey]);

  useEffect(() => {
    if (!remoteCameraFrame?.src || !poseAnalysis?.previewSetupFrame) return;
    poseAnalysis.previewSetupFrame(remoteCameraFrame.blob || remoteCameraFrame.src);
  }, [
    poseAnalysis,
    remoteCameraFrame?.blob,
    remoteCameraFrame?.receivedAt,
    remoteCameraFrame?.sequence,
    remoteCameraFrame?.src,
  ]);

  useEffect(() => {
    if (!gameType || !activeRecommendation) return;
    const timestampMs = performance.now();
    setGameState((current) => updateArExerciseGame(
      current?.gameType === gameType ? current : createInitialArGameState(gameType, activeRecommendation),
      {
        landmarks: poseAnalysis?.landmarks || [],
        recommendation: activeRecommendation,
        timestampMs,
      },
    ));
  }, [activeRecommendation, gameType, poseAnalysis?.landmarks]);

  const cameraMediaRect = useMemo(
    () => mediaRectForObjectFit(poseAnalysis?.frameSize, stageSize, 'contain'),
    [poseAnalysis?.frameSize, stageSize],
  );

  const target = gameState.target || { x: 50, y: 50 };
  const hasLivePose = Boolean(poseAnalysis?.landmarks?.length);
  const showDemoBubblePath = !remoteCameraFrame?.src
    && !hasLivePose
    && gameType === ArExerciseGameTypes.BubbleLegRaise;
  const visualTarget = showDemoBubblePath ? { x: 62, y: 20 } : target;
  const mappedVisualTarget = remoteCameraFrame?.src
    ? mapPointToMediaRect({ x: visualTarget.x / 100, y: visualTarget.y / 100 }, cameraMediaRect)
    : visualTarget;
  const progressPercent = Math.round((gameState.progress || 0) * 100);
  const objectStyle = {
    left: `${mappedVisualTarget.x}%`,
    top: `${mappedVisualTarget.y}%`,
  };
  const objectContent = gameType === ArExerciseGameTypes.ButterflyBalance
    ? <ButterflyObject />
    : gameObjectLabel(gameType);
  const configuredHoldSeconds = Number(activeRecommendation?.defaultHoldSec);
  const timedHoldMode = gameType === ArExerciseGameTypes.ButterflyBalance
    && Number.isFinite(configuredHoldSeconds)
    && configuredHoldSeconds > 0
    && (gameState.metrics?.mode || 'hold') === 'hold';
  const targetHoldSeconds = timedHoldMode
    ? Math.max(1, Math.round((gameState.targetHoldMs || configuredHoldSeconds * 1000) / 1000))
    : 0;
  const holdSeconds = timedHoldMode
    ? Math.min(targetHoldSeconds, gameState.setComplete ? targetHoldSeconds : (gameState.holdMs || 0) / 1000)
    : 0;
  const holdSecondsText = holdSeconds.toFixed(1);
  const holdProgressLabel = timedHoldMode ? `${holdSecondsText} / ${targetHoldSeconds}s` : null;
  const metricLabel = !gameType
    ? ''
    : timedHoldMode
      ? `${holdSecondsText}s`
      : gameType === ArExerciseGameTypes.BubbleLegRaise
        ? `${Math.round(gameState.metrics?.angleDegrees || 0)}°`
        : gameType === ArExerciseGameTypes.StarKneeExtension
          ? `${Math.round(gameState.metrics?.kneeAngleDegrees || 0)}°`
          : gameState.metrics?.mode === 'weight_shift' || gameState.metrics?.mode === 'walking_path'
            ? `${gameState.count}`
            : `${(gameState.holdMs / 1000 || 0).toFixed(1)}s`;
  const gameTitle = activeRecommendation?.arGameName || ArExerciseGameLabels[gameType] || 'AR Exercise';
  const remainingCount = Math.max(0, gameState.targetRepetitions - gameState.count);

  useEffect(() => {
    if (!activeRecommendation || !gameType) return;
    onGameStateChange?.({
      ...gameState,
      gameType,
      gameTitle,
      metricLabel,
      isTimedHold: timedHoldMode,
      holdSeconds,
      targetHoldSeconds,
      progressLabel: holdProgressLabel || `${gameState.count} / ${gameState.targetRepetitions}`,
      recommendation: activeRecommendation,
    });
  }, [activeRecommendation, gameState, gameTitle, gameType, holdProgressLabel, holdSeconds, metricLabel, onGameStateChange, targetHoldSeconds, timedHoldMode]);

  if (!activeRecommendation || !gameType) return null;

  return (
    <section className={`ar-game ar-game--${gameType}`} aria-label={gameTitle}>
      <div className="ar-game__header">
        <div>
          <div className="eyebrow">Live feedback</div>
          <h3>{gameTitle}</h3>
        </div>
        <div className={gameState.setComplete ? 'ar-game__counter ar-game__counter--complete' : 'ar-game__counter'}>
          <span>{timedHoldMode ? Math.ceil(holdSeconds) : gameState.count}</span>
          <small>{timedHoldMode ? `/ ${targetHoldSeconds}s` : `/ ${gameState.targetRepetitions}`}</small>
        </div>
      </div>

      <RecommendationTabs
        recommendations={playableRecommendations}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
      />

      <div
        className="ar-game-stage"
        ref={stageRef}
        style={frameAspectRatio ? { '--ar-camera-aspect-ratio': frameAspectRatio } : null}
      >
        {remoteCameraFrame?.src ? (
          <img
            className="ar-game-camera-frame"
            src={remoteCameraFrame.src}
            alt="Live camera feed for AR exercise game"
          />
        ) : (
          <div className="ar-game-camera-placeholder" />
        )}
        <PoseOverlay landmarks={poseAnalysis?.landmarks || []} frameSize={poseAnalysis?.frameSize} fit="contain" />
        {showDemoBubblePath ? (
          <div className="ar-game-demo-path" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        <div
          key={gameState.burstKey || `${gameType}-target`}
          className={gameObjectClass(gameType, gameState.burstKey)}
          style={objectStyle}
        >
          {objectContent}
        </div>
        <div className="ar-game-target-ring" style={objectStyle} aria-hidden="true" />
        <div className="ar-game-live-coach" aria-live="polite">
          <strong>{gameState.setComplete ? 'Set complete' : gameState.prompt}</strong>
          <span>{holdProgressLabel || `${gameState.count} / ${gameState.targetRepetitions}`}</span>
        </div>
      </div>

      <div className="ar-game__footer">
        <div className="ar-game-progress" aria-label="Game progress">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="ar-game__status">
          <strong>{metricLabel}</strong>
          <span>{gameState.prompt}</span>
        </div>
        <div className={gameState.setComplete ? 'ar-game-achievement ar-game-achievement--complete' : 'ar-game-achievement'}>
          <span>✓</span>
          <strong>{gameState.setComplete ? 'Safe Steps Badge' : timedHoldMode ? 'Hold timer' : 'Reps to badge'}</strong>
          <small>
            {gameState.setComplete
              ? 'You completed the set'
              : timedHoldMode
                ? `${Math.max(0, Math.ceil(targetHoldSeconds - holdSeconds))} sec left`
                : `${remainingCount} reps`}
          </small>
        </div>
        <SteplyButton
          className="ar-game__reset"
          onClick={() => setGameState(createInitialArGameState(gameType, activeRecommendation))}
        >
          Restart set
        </SteplyButton>
      </div>
    </section>
  );
}
