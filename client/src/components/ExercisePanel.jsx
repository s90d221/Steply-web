import { useEffect, useMemo, useState } from 'react';
import { recommendationExercises } from '../data/recommendationExercises';
import { recommendationTemplatesForResult, testLabel } from '../pose/recommendationRules';
import { gameTypeForRecommendation } from '../pose/arExerciseEngine';
import { ArExerciseGame } from './ArExerciseGame';
import { PoseOverlay } from './pose/PoseOverlay';
import { SteplyButton, SteplyCard, TimerCircle } from './SteplyPrimitives';

const friendlyExerciseCopy = {
  side_hip_strengthening: {
    description: 'Hold a chair or wall and slowly lift one leg out to the side, then lower with control.',
    safety: 'Keep your body tall. If you feel unsteady, lower your foot and hold your support.',
    type: '10 reps',
  },
  knee_extension: {
    description: 'Sit tall, slowly straighten one knee, pause briefly, then lower your foot.',
    safety: 'Keep your thigh supported by the chair and stop if your knee hurts.',
    type: '10 reps',
  },
  chair_stand: {
    description: 'Stand from a stable chair and sit back down slowly with both feet on the floor.',
    safety: 'Place the chair near a wall and use support when needed.',
    type: '10 reps',
  },
  tandem_stance: {
    description: 'Place one foot in front of the other and hold the stance with support nearby.',
    safety: 'Keep a chair or wall within reach the whole time.',
    type: 'Hold',
  },
  tandem_walk: {
    description: 'Walk slowly heel-to-toe along a clear path while keeping support nearby.',
    safety: 'Use a rail, wall, or helper when needed.',
    type: 'Guided',
  },
  one_leg_stance: {
    description: 'Lift one foot slightly and hold a short, steady balance position.',
    safety: 'Lower your foot before you feel unsteady.',
    type: 'Hold',
  },
  heel_raises: {
    description: 'Hold a chair and rise gently onto your toes, then lower slowly.',
    safety: 'Keep both hands close to support.',
    type: '10 reps',
  },
  toe_raises: {
    description: 'Hold support and lift the front of both feet slightly, then lower with control.',
    safety: 'Keep your heels on the floor and use support the whole time.',
    type: '10 reps',
  },
  supported_tandem_stand: {
    description: 'Stand with one foot in front of the other while keeping support within reach.',
    safety: 'Use a chair, counter, or rail and step out before you feel uncomfortable.',
    type: 'Hold',
  },
  weight_shift_drill: {
    description: 'Hold support and slowly shift weight left and right without lifting your feet.',
    safety: 'Keep the shift small and keep a chair, counter, or rail under your hands.',
    type: '8 reps',
  },
  tai_chi_weight_transfer: {
    description: 'Shift weight slowly from one foot to the other with support nearby.',
    safety: 'Move only a small distance and stop before you feel unsteady.',
    type: '6 reps',
  },
  heel_toe_walking: {
    description: 'Walk slowly heel-to-toe along a clear path while keeping support nearby.',
    safety: 'Use a rail, wall, or helper when needed.',
    type: 'Guided',
  },
  sideways_walking: {
    description: 'Take small sideways steps along a counter or rail.',
    safety: 'Keep your feet from crossing and keep one hand near support.',
    type: 'Guided',
  },
  supported_one_leg_stand: {
    description: 'Hold a chair and lift one foot slightly for a short steady hold.',
    safety: 'Keep both hands close to support and lower the foot early if needed.',
    type: 'Hold',
  },
  sit_to_stand_practice: {
    description: 'Stand from a stable chair and sit back down at a calm pace.',
    safety: 'Place the chair against a wall and use support if needed.',
    type: '5 reps',
  },
  elevated_sit_to_stand: {
    description: 'Use a slightly higher firm chair and stand with even pressure through both feet.',
    safety: 'Keep the chair against a wall and support within reach.',
    type: '5 reps',
  },
  partial_sit_to_stand: {
    description: 'Start from a higher chair and rise only partway, then sit back down with control.',
    safety: 'Keep support close and use only a small range that feels steady.',
    type: '5 reps',
  },
  knee_alignment_sit_to_stand: {
    description: 'Stand and sit slowly while keeping both knees pointing over the toes.',
    safety: 'Use a stable chair and reduce the range if the knees drift inward.',
    type: '5 reps',
  },
  mini_knee_bends: {
    description: 'Hold support, bend the knees slightly, then stand tall again.',
    safety: 'Keep the bend small and keep your knees over your toes.',
    type: '8 reps',
  },
  sit_to_stand_ladder: {
    description: 'Do a short set, rest, then repeat only if the first set felt steady.',
    safety: 'Rest between sets and keep the chair stable.',
    type: 'Sets',
  },
  slow_sit_to_stand: {
    description: 'Stand up, pause, then sit down slowly and quietly.',
    safety: 'Keep the chair against a wall and use support when needed.',
    type: '5 reps',
  },
  supported_walking: {
    description: 'Walk a short clear path with a rail, wall, or helper nearby.',
    safety: 'Keep the path clear and turn slowly.',
    type: 'Guided',
  },
  figure_8_walking: {
    description: 'Walk slowly around two clear markers in a gentle figure-8 path.',
    safety: 'Use supervision if turning felt slow or uneven today.',
    type: 'Guided',
  },
  gentle_walking_plan: {
    description: 'Walk a short clear path at a comfortable pace.',
    safety: 'Keep support nearby and avoid rushing.',
    type: 'Plan',
  },
  balanced_bilateral_practice: {
    description: 'Practice a gentle movement evenly on both sides.',
    safety: 'Move slowly and repeat the check next session.',
    type: 'Gentle',
  },
};

const easyGuidanceByKey = {
  side_hip_strengthening: {
    steps: ['Hold a chair.', 'Lift one leg out to the side.', 'Lower it slowly.'],
    watch: 'Keep your body tall. Do not lean.',
    gameGoal: 'Move your foot toward the side target.',
  },
  sideways_walking: {
    steps: ['Stand beside a counter or rail.', 'Take small side steps.', 'Keep your feet from crossing.'],
    watch: 'Move slowly and keep one hand near support.',
    gameGoal: 'Follow the butterfly path with small side steps.',
  },
  knee_extension: {
    steps: ['Sit tall on a chair.', 'Straighten one knee.', 'Lower your foot slowly.'],
    watch: 'Keep your thigh on the chair.',
    gameGoal: 'Reach the star by straightening your knee.',
  },
  sit_to_stand_practice: {
    steps: ['Sit near the front of the chair.', 'Stand up tall.', 'Sit down slowly.'],
    watch: 'Use both feet evenly.',
    gameGoal: 'Stand tall to reach the star.',
  },
  chair_stand: {
    steps: ['Sit near the front of the chair.', 'Stand up tall.', 'Sit down slowly.'],
    watch: 'Use both feet evenly.',
    gameGoal: 'Stand tall to reach the star.',
  },
  elevated_sit_to_stand: {
    steps: ['Use a higher firm chair.', 'Stand up with support nearby.', 'Sit down with control.'],
    watch: 'Start easier. Do not use a low chair today.',
    gameGoal: 'Reach the star from the higher chair.',
  },
  partial_sit_to_stand: {
    steps: ['Start from a higher chair.', 'Rise only partway.', 'Sit back down slowly.'],
    watch: 'Small range is okay today.',
    gameGoal: 'Reach the lower star with a partial stand.',
  },
  knee_alignment_sit_to_stand: {
    steps: ['Feet flat on the floor.', 'Stand up slowly.', 'Keep knees pointing over toes.'],
    watch: 'Make the movement smaller if knees drift inward.',
    gameGoal: 'Reach the star while knees stay forward.',
  },
  mini_knee_bends: {
    steps: ['Hold support.', 'Bend knees a little.', 'Stand tall again.'],
    watch: 'Keep the bend small.',
    gameGoal: 'Stand tall to reach the star.',
  },
  sit_to_stand_ladder: {
    steps: ['Do a short set.', 'Rest.', 'Repeat only if steady.'],
    watch: 'Rest before you feel tired.',
    gameGoal: 'Complete each star reach calmly.',
  },
  slow_sit_to_stand: {
    steps: ['Stand up.', 'Pause.', 'Sit down slowly and quietly.'],
    watch: 'The slow sitting part matters most.',
    gameGoal: 'Reach the star, then lower with control.',
  },
  weight_shift_drill: {
    steps: ['Hold support.', 'Shift weight to one foot.', 'Come back to the middle.'],
    watch: 'Do not lift your feet.',
    gameGoal: 'Move your body center toward the butterfly.',
  },
  tai_chi_weight_transfer: {
    steps: ['Hold support nearby.', 'Shift weight very slowly.', 'Return to center.'],
    watch: 'Small, smooth movement.',
    gameGoal: 'Guide the butterfly with slow weight transfer.',
  },
  supported_tandem_stand: {
    steps: ['Put one foot in front.', 'Keep support close.', 'Hold still.'],
    watch: 'Step out before you feel unsafe.',
    gameGoal: 'Hold steady while the butterfly timer fills.',
  },
  tandem_stance: {
    steps: ['Put one foot in front.', 'Keep support close.', 'Hold still.'],
    watch: 'Step out before you feel unsafe.',
    gameGoal: 'Hold steady while the butterfly timer fills.',
  },
  supported_one_leg_stand: {
    steps: ['Hold a chair.', 'Lift one foot a little.', 'Hold briefly, then lower.'],
    watch: 'Lower your foot early if needed.',
    gameGoal: 'Keep balance while the timer counts up.',
  },
  one_leg_stance: {
    steps: ['Hold a chair.', 'Lift one foot a little.', 'Hold briefly, then lower.'],
    watch: 'Lower your foot early if needed.',
    gameGoal: 'Keep balance while the timer counts up.',
  },
  heel_raises: {
    steps: ['Hold a chair.', 'Rise onto your toes.', 'Lower your heels slowly.'],
    watch: 'Keep both hands close to support.',
    gameGoal: 'Rise tall to lift the butterfly.',
  },
  toe_raises: {
    steps: ['Hold support.', 'Lift the front of both feet.', 'Lower slowly.'],
    watch: 'Keep heels on the floor.',
    gameGoal: 'Lift toes to guide the butterfly.',
  },
  heel_toe_walking: {
    steps: ['Use a clear path.', 'Step heel-to-toe.', 'Stop before you feel unsteady.'],
    watch: 'Use a rail, wall, or helper.',
    gameGoal: 'Follow the butterfly path step by step.',
  },
  supported_walking: {
    steps: ['Use a clear short path.', 'Walk slowly.', 'Turn carefully.'],
    watch: 'Keep support or a helper nearby.',
    gameGoal: 'Follow the butterfly path.',
  },
  figure_8_walking: {
    steps: ['Place two clear markers.', 'Walk slowly around them.', 'Turn without rushing.'],
    watch: 'Use supervision if turning felt hard today.',
    gameGoal: 'Guide the butterfly around the path.',
  },
  gentle_walking_plan: {
    steps: ['Walk a short clear path.', 'Keep a comfortable pace.', 'Stop and rest.'],
    watch: 'Do not rush.',
    gameGoal: 'Follow the butterfly path.',
  },
  balanced_bilateral_practice: {
    steps: ['Move slowly.', 'Use both sides evenly.', 'Stop if one side feels different.'],
    watch: 'Keep the movement gentle.',
    gameGoal: 'Keep the butterfly centered and steady.',
  },
  balance_retraining: {
    steps: ['Hold support.', 'Stand tall.', 'Shift gently and return to center.'],
    watch: 'Keep support close.',
    gameGoal: 'Guide the butterfly with gentle balance control.',
  },
};

function guidanceForExercise(template = {}) {
  const keys = [
    template.exerciseKey,
    template.id,
    template.arInputKey,
  ].filter(Boolean);
  for (const key of keys) {
    if (easyGuidanceByKey[key]) return easyGuidanceByKey[key];
  }
  const text = `${template.title || ''} ${template.description || ''}`.toLowerCase();
  if (text.includes('chair') || text.includes('sit')) return easyGuidanceByKey.sit_to_stand_practice;
  if (text.includes('knee')) return easyGuidanceByKey.knee_extension;
  if (text.includes('weight')) return easyGuidanceByKey.weight_shift_drill;
  if (text.includes('walk')) return easyGuidanceByKey.supported_walking;
  if (text.includes('one leg') || text.includes('one-leg')) return easyGuidanceByKey.supported_one_leg_stand;
  if (text.includes('tandem') || text.includes('balance')) return easyGuidanceByKey.supported_tandem_stand;
  return {
    steps: ['Move slowly.', 'Keep support close.', 'Stop if it feels unsafe.'],
    watch: 'Use this as gentle practice only.',
    gameGoal: 'Follow the target on screen.',
  };
}

function inferArMetadata(template = {}) {
  if (template.exerciseKey || template.arInputKey || template.gameType) return {};

  const searchable = `${template.title || ''} ${template.description || ''}`.toLowerCase();
  if (searchable.includes('side') || searchable.includes('hip')) {
    return {
      exerciseKey: 'side_hip_strengthening',
      arInputKey: 'side_leg_raise',
    };
  }
  if (searchable.includes('knee')) {
    return {
      exerciseKey: 'knee_extension',
      arInputKey: 'knee_extension',
    };
  }
  if (searchable.includes('chair') || searchable.includes('sit')) {
    return {
      exerciseKey: 'chair_stand',
      arInputKey: 'sit_to_stand',
    };
  }
  if (searchable.includes('one-leg') || searchable.includes('one leg')) {
    return {
      exerciseKey: 'one_leg_stance',
      arInputKey: 'one_leg_stance',
    };
  }
  if (searchable.includes('tandem')) {
    return {
      exerciseKey: 'tandem_stance',
      arInputKey: 'tandem_stance',
    };
  }

  return {
    exerciseKey: 'balance_retraining',
    arInputKey: 'balance_retraining',
  };
}

function exerciseId(template, index) {
  return `${template.exerciseKey || template.arInputKey || template.title}-${index}`;
}

function buildExerciseSourceList(recommendationTemplates) {
  const mergedTemplates = recommendationTemplates.length
    ? [...recommendationTemplates, ...recommendationExercises]
    : recommendationExercises;
  const seen = new Set();

  return mergedTemplates.filter((template) => {
    const key = template.exerciseKey || template.arInputKey || template.id || template.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toExerciseCard(template, index) {
  const arMetadata = inferArMetadata(template);
  const normalizedTemplate = {
    ...template,
    ...arMetadata,
  };
  const copy = friendlyExerciseCopy[template.exerciseKey] || friendlyExerciseCopy[template.id] || {};
  const guidance = guidanceForExercise(normalizedTemplate);
  return {
    ...normalizedTemplate,
    id: exerciseId(normalizedTemplate, index),
    number: index + 1,
    title: template.title,
    description: copy.description || template.description,
    safety: copy.safety || template.safetyNote || template.safetyInstruction,
    minutes: Math.max(1, Math.round((template.durationSeconds || 60) / 60)),
    type: copy.type || 'Guided',
    guidance,
  };
}

function repetitionsFromExercise(exercise) {
  const fromDefault = Number(exercise?.defaultReps);
  if (Number.isFinite(fromDefault) && fromDefault > 0) return Math.round(fromDefault);
  const fromType = Number.parseInt(exercise?.type, 10);
  if (Number.isFinite(fromType)) return fromType;
  const fromTitle = Number.parseInt(exercise?.title, 10);
  if (Number.isFinite(fromTitle)) return fromTitle;
  return 10;
}

function targetSummaryForExercise(exercise) {
  const holdSeconds = Number(exercise?.defaultHoldSec);
  if (Number.isFinite(holdSeconds) && holdSeconds > 0) {
    return {
      value: Math.round(holdSeconds),
      unit: 'sec hold',
      label: `${Math.round(holdSeconds)} sec hold`,
    };
  }
  const reps = repetitionsFromExercise(exercise);
  const sets = Number(exercise?.defaultSets);
  return {
    value: reps,
    unit: Number.isFinite(sets) && sets > 1 ? `${sets} sets` : 'reps',
    label: Number.isFinite(sets) && sets > 1 ? `${sets} sets x ${reps} reps` : `${reps} reps`,
  };
}

function ExerciseCameraPreview({ remoteCameraFrame, poseAnalysis, countdownSeconds }) {
  return (
    <SteplyCard className="mission-camera-card exercise-launch-stage-card">
      <div className="arena-stage arena-stage--camera arena-stage--guided exercise-launch-stage">
        {remoteCameraFrame?.src ? (
          <div className="remote-camera-layer">
            <img
              className="remote-camera-frame"
              src={remoteCameraFrame.src}
              alt="Live camera feed before exercise starts"
            />
            <PoseOverlay
              landmarks={poseAnalysis?.landmarks || []}
              frameSize={poseAnalysis?.frameSize}
              fit="contain"
            />
          </div>
        ) : (
          <>
            <div className="stage-grid" aria-hidden="true" />
            <div className="exercise-launch-message">
              <div className="eyebrow">Camera Setup</div>
              <h3>Bring your body into view</h3>
              <p>The exercise will start after the countdown when the phone camera is ready.</p>
            </div>
          </>
        )}

        <div className="guided-camera-focus" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="exercise-countdown-overlay">
          <span>{countdownSeconds}</span>
          <strong>Starting soon</strong>
        </div>

        <div className="remote-camera-badge">
          <span className={remoteCameraFrame?.src ? 'remote-camera-dot remote-camera-dot--live' : 'remote-camera-dot'} />
          {remoteCameraFrame?.src ? 'Receiving live phone camera stream' : 'Waiting for live phone camera stream'}
        </div>
      </div>
    </SteplyCard>
  );
}

function ExerciseStartControl({ activeExercise, activeGameType, onStart }) {
  const disabled = !activeExercise || !activeGameType;
  return (
    <button
      type="button"
      className="exercise-start-control"
      onClick={onStart}
      disabled={disabled}
    >
      <span>{disabled ? 'Practice Only' : 'Start'}</span>
      <strong>{disabled ? 'No AR game' : 'Exercise'}</strong>
      <small>{disabled ? 'Select another exercise' : '5 sec countdown'}</small>
    </button>
  );
}

export function ExercisePanel({
  finalResult,
  remoteCameraFrame,
  poseAnalysis,
  openRecommendedOnMount = false,
  onViewProgress,
}) {
  const recommendationTemplates = finalResult
    ? recommendationTemplatesForResult(finalResult)
    : [];
  const sourceExercises = useMemo(
    () => buildExerciseSourceList(recommendationTemplates),
    [recommendationTemplates],
  );
  const dynamicExercises = useMemo(
    () => sourceExercises.map(toExerciseCard),
    [sourceExercises],
  );
  const visibleExercises = useMemo(() => dynamicExercises.slice(0, 3), [dynamicExercises]);
  const recommendationSignature = dynamicExercises
    .map((exercise) => `${exercise.title}:${exercise.exerciseKey || ''}:${exercise.arInputKey || ''}`)
    .join('|');
  const [activeExerciseId, setActiveExerciseId] = useState('');
  const [panelMode, setPanelMode] = useState(openRecommendedOnMount ? 'exercise' : 'recommendations');
  const [exercisePhase, setExercisePhase] = useState('idle');
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [liveExerciseState, setLiveExerciseState] = useState(null);
  const activeExercise = dynamicExercises.find((exercise) => exercise.id === activeExerciseId)
    || visibleExercises[0]
    || null;
  const sourceTestLabel = finalResult?.testLabel || testLabel(finalResult?.testType);
  const activeGameType = activeExercise ? gameTypeForRecommendation(activeExercise) : null;
  const safetyGateText = finalResult?.recommendationPlan?.gameDisabledReason || null;
  const activeTarget = targetSummaryForExercise(activeExercise);
  const targetReps = activeTarget.value;
  const configuredHoldSeconds = Number(activeExercise?.defaultHoldSec);
  const isTimedHoldExercise = Boolean(
    liveExerciseState?.isTimedHold
      || (Number.isFinite(configuredHoldSeconds) && configuredHoldSeconds > 0),
  );
  const targetHoldSeconds = liveExerciseState?.targetHoldSeconds
    || (Number.isFinite(configuredHoldSeconds) && configuredHoldSeconds > 0 ? Math.round(configuredHoldSeconds) : 0);
  const holdSeconds = liveExerciseState?.holdSeconds || 0;
  const remainingHoldSeconds = Math.max(0, Math.ceil(targetHoldSeconds - holdSeconds));
  const remainingReps = Math.max(0, (liveExerciseState?.targetRepetitions || targetReps) - (liveExerciseState?.count || 0));
  const activeExerciseIndex = Math.max(
    0,
    visibleExercises.findIndex((exercise) => exercise.id === activeExercise?.id),
  );
  const livePrompt = exercisePhase === 'running'
    ? liveExerciseState?.prompt || 'Move slowly and stay in view.'
    : activeExercise?.guidance?.gameGoal || 'Press Start when ready.';
  const liveMetric = exercisePhase === 'running'
    ? isTimedHoldExercise
      ? `${holdSeconds.toFixed(1)}s`
      : liveExerciseState?.metricLabel || `${liveExerciseState?.count || 0}`
    : activeTarget.label;
  const liveProgressLabel = isTimedHoldExercise
    ? `${holdSeconds.toFixed(1)} / ${targetHoldSeconds || targetReps}s`
    : `${liveExerciseState?.count || 0} / ${liveExerciseState?.targetRepetitions || targetReps}`;
  const liveRemainingLabel = exercisePhase === 'running'
    ? isTimedHoldExercise ? 'Seconds Left' : 'Left'
    : 'Exercise';
  const liveRemainingValue = exercisePhase === 'running'
    ? isTimedHoldExercise ? `${remainingHoldSeconds}s` : remainingReps
    : `${activeExerciseIndex + 1} / ${visibleExercises.length}`;

  useEffect(() => {
    setActiveExerciseId(visibleExercises[0]?.id || '');
    setPanelMode(openRecommendedOnMount ? 'exercise' : 'recommendations');
    setExercisePhase('idle');
    setCountdownSeconds(5);
    setLiveExerciseState(null);
  }, [openRecommendedOnMount, recommendationSignature]);

  useEffect(() => {
    setExercisePhase('idle');
    setCountdownSeconds(5);
    setLiveExerciseState(null);
  }, [activeExercise?.id]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [panelMode]);

  useEffect(() => {
    if (exercisePhase !== 'countdown') return undefined;

    const durationMs = 5000;
    const startedAt = performance.now();
    setCountdownSeconds(5);

    const tick = () => {
      const elapsedMs = performance.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
      setCountdownSeconds(remaining);

      if (elapsedMs >= durationMs) {
        setExercisePhase('running');
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [exercisePhase, activeExercise?.id]);

  const handleSelectExercise = (exerciseId) => {
    setActiveExerciseId(exerciseId);
    setExercisePhase('idle');
    setCountdownSeconds(5);
  };

  const handleOpenExercise = () => {
    setPanelMode('exercise');
    setExercisePhase('idle');
    setCountdownSeconds(5);
    setLiveExerciseState(null);
  };

  const handleChooseAnotherExercise = () => {
    setPanelMode('recommendations');
    setExercisePhase('idle');
    setCountdownSeconds(5);
    setLiveExerciseState(null);
  };

  if (panelMode === 'recommendations') {
    return (
      <div className="exercise-recommendation-screen distance-mode distance-mode--exercise">
        <SteplyCard className="exercise-recommendation-hero">
          <div>
            <div className="eyebrow">Exercise Recommendation</div>
            <h2>{activeExercise?.title || sourceTestLabel}</h2>
            <p>{activeExercise?.description || 'Choose the recommended exercise, then start the matching AR game.'}</p>
          </div>
        </SteplyCard>

        <div className="exercise-recommendation-options" aria-label="Exercise recommendations">
          {visibleExercises.map((exercise, index) => {
            const isActive = exercise.id === activeExercise?.id;
            const isPlayable = Boolean(gameTypeForRecommendation(exercise));
            return (
              <button
                key={exercise.id}
                type="button"
                className={`exercise-recommendation-option ${isActive ? 'exercise-recommendation-option--active' : ''}`}
                onClick={() => handleSelectExercise(exercise.id)}
                disabled={!isPlayable}
              >
                <strong>{index + 1}. {exercise.title}</strong>
                <span>{exercise.type}</span>
                <small>{exercise.guidance?.gameGoal || exercise.description}</small>
              </button>
            );
          })}
        </div>

        <div className="exercise-recommendation-actions">
          <SteplyButton onClick={handleOpenExercise} disabled={!activeGameType}>
            Start Recommended Exercise
          </SteplyButton>
        </div>
      </div>
    );
  }

  return (
    <div className="exercise-mission-layout analysis-layout analysis-layout--guided distance-mode distance-mode--exercise">
      <aside className="mission-guide-column exercise-guide-column">
        <SteplyCard className="movement-guide-card exercise-detail-card">
          <div className="eyebrow">Exercise Type</div>
          <h3>{activeExercise?.title || 'Choose an exercise'}</h3>
          <p>{activeExercise?.description || 'Select one recommended exercise to open the matching live camera game.'}</p>
          <div className="exercise-easy-steps" aria-label="Exercise instructions">
            {(activeExercise?.guidance?.steps || []).map((step, index) => (
              <div className="exercise-easy-step" key={`${activeExercise?.id || 'exercise'}-${step}`}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
          <div className="exercise-detail-target">
            <span>One set</span>
            <strong>{targetReps}</strong>
            <span>{activeTarget.unit}</span>
          </div>
          {activeExercise?.guidance?.watch ? (
            <div className="exercise-detail-watch">{activeExercise.guidance.watch}</div>
          ) : null}
          {activeExercise?.safety ? (
            <div className="exercise-detail-safety">{activeExercise.safety}</div>
          ) : null}
        </SteplyCard>

        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card exercise-status-card">
          <div className="eyebrow">Live Status</div>
          <h3>{livePrompt}</h3>
          <div className="guided-status-row">
            <span>Now</span>
            <strong>{liveMetric}</strong>
          </div>
          <div className="guided-status-row">
            <span>{isTimedHoldExercise ? 'Hold' : 'Count'}</span>
            <strong>{liveProgressLabel}</strong>
          </div>
          <div className="guided-status-row">
            <span>{liveRemainingLabel}</span>
            <strong>{liveRemainingValue}</strong>
          </div>
        </SteplyCard>
      </aside>

      <main className="analysis-main-zone analysis-main-zone--mission exercise-main-zone">
        {exercisePhase === 'running' && activeExercise && activeGameType ? (
          <ArExerciseGame
            key={activeExercise.id}
            recommendations={[activeExercise]}
            remoteCameraFrame={remoteCameraFrame}
            poseAnalysis={poseAnalysis}
            onGameStateChange={setLiveExerciseState}
          />
        ) : exercisePhase === 'countdown' ? (
          <ExerciseCameraPreview
            remoteCameraFrame={remoteCameraFrame}
            poseAnalysis={poseAnalysis}
            countdownSeconds={countdownSeconds}
          />
        ) : (
          <SteplyCard className="mission-camera-card exercise-launch-stage-card">
            <div className="arena-stage arena-stage--camera arena-stage--guided exercise-launch-stage">
              <div className="stage-grid" aria-hidden="true" />
              <div className="exercise-launch-message">
                <div className="eyebrow">Posture Setup</div>
                <h3>{activeExercise?.title || 'Ready posture'}</h3>
                <p>Press Start, then get your full body in view before the game begins.</p>
              </div>
              <div className="guided-camera-focus" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="remote-camera-badge">
                <span className={remoteCameraFrame?.src ? 'remote-camera-dot remote-camera-dot--live' : 'remote-camera-dot'} />
                {remoteCameraFrame?.src ? 'Receiving live phone camera stream' : 'Waiting for live phone camera stream'}
              </div>
            </div>
          </SteplyCard>
        )}
      </main>

      <aside className="analysis-side analysis-side--guided exercise-side-panel">
        {exercisePhase === 'idle' ? (
          <ExerciseStartControl
            activeExercise={activeExercise}
            activeGameType={activeGameType}
            onStart={() => {
              setLiveExerciseState(null);
              setExercisePhase('countdown');
            }}
          />
        ) : (
          <TimerCircle
            value={exercisePhase === 'countdown'
              ? countdownSeconds
              : isTimedHoldExercise
                ? remainingHoldSeconds
                : remainingReps}
            max={exercisePhase === 'countdown'
              ? 5
              : isTimedHoldExercise
                ? targetHoldSeconds || targetReps
                : targetReps}
            label={exercisePhase === 'countdown' ? 'start' : isTimedHoldExercise ? 'sec left' : 'left'}
            score={targetReps}
          />
        )}

        <div className="exercise-actions exercise-actions--guided">
          <SteplyButton onClick={onViewProgress}>View My Progress</SteplyButton>
          <SteplyButton variant="secondary" onClick={handleChooseAnotherExercise}>Choose Another Exercise</SteplyButton>
        </div>

        {safetyGateText ? (
          <SteplyCard className="feedback-stack feedback-stack--warning exercise-safety-gate">
            <div className="eyebrow">Safety</div>
            <h3>Check setup first</h3>
            <p>{safetyGateText}</p>
          </SteplyCard>
        ) : null}
      </aside>
    </div>
  );
}
