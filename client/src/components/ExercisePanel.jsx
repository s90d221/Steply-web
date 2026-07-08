import { useEffect, useMemo, useState } from 'react';
import { recommendationExercises } from '../data/recommendationExercises';
import { recommendationTemplatesForResult, testLabel } from '../pose/recommendationRules';
import { gameTypeForRecommendation } from '../pose/arExerciseEngine';
import { ArExerciseGame } from './ArExerciseGame';
import { ExerciseCard, SteplyButton, SteplyCard } from './SteplyPrimitives';

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

function toExerciseCard(template, index) {
  const arMetadata = inferArMetadata(template);
  const normalizedTemplate = {
    ...template,
    ...arMetadata,
  };
  const copy = friendlyExerciseCopy[template.exerciseKey] || friendlyExerciseCopy[template.id] || {};
  return {
    ...normalizedTemplate,
    id: exerciseId(normalizedTemplate, index),
    number: index + 1,
    title: template.title,
    description: copy.description || template.description,
    safety: copy.safety || template.safetyNote || template.safetyInstruction,
    minutes: Math.max(1, Math.round((template.durationSeconds || 60) / 60)),
    type: copy.type || 'Guided',
  };
}

export function ExercisePanel({ finalResult, remoteCameraFrame, poseAnalysis, onRestart, onViewProgress }) {
  const recommendationTemplates = finalResult?.recommendations?.length
    ? finalResult.recommendations
    : finalResult?.recommendationLevel
      ? recommendationTemplatesForResult(finalResult)
      : [];
  const sourceExercises = recommendationTemplates.length ? recommendationTemplates : recommendationExercises;
  const dynamicExercises = useMemo(
    () => sourceExercises.map(toExerciseCard),
    [sourceExercises],
  );
  const recommendationSignature = dynamicExercises
    .map((exercise) => `${exercise.title}:${exercise.exerciseKey || ''}:${exercise.arInputKey || ''}`)
    .join('|');
  const [activeExerciseId, setActiveExerciseId] = useState('');
  const activeExercise = dynamicExercises.find((exercise) => exercise.id === activeExerciseId) || null;
  const sourceTestLabel = finalResult?.testLabel || testLabel(finalResult?.testType);
  const activeGameType = activeExercise ? gameTypeForRecommendation(activeExercise) : null;
  const safetyGateText = finalResult?.recommendationPlan?.gameDisabledReason || null;

  useEffect(() => {
    setActiveExerciseId('');
  }, [recommendationSignature]);

  return (
    <div className="panel-grid panel-grid--exercise distance-mode distance-mode--exercise">
      <SteplyCard className="recommendation-header">
        <div>
          <div className="eyebrow">Exercise Recommendations</div>
          <h2>{activeExercise ? `${activeExercise.title} AR Game` : 'Choose an exercise to start'}</h2>
          <p>
            These games match today’s {sourceTestLabel} insight. Start one recommended exercise, move at a safe pace, and aim for one calm set.
            {safetyGateText ? ` ${safetyGateText}` : ''}
          </p>
        </div>
        <div className="recommendation-time">One set <strong>10</strong> reps</div>
      </SteplyCard>

      {activeExercise && activeGameType ? (
        <ArExerciseGame
          recommendations={[activeExercise]}
          remoteCameraFrame={remoteCameraFrame}
          poseAnalysis={poseAnalysis}
        />
      ) : (
        <SteplyCard className="ar-game-launch-card">
          <div>
            <div className="eyebrow">AR Game</div>
            <h3>Start from a recommended exercise</h3>
            <p>
              Select Start on any exercise card to open the matching live camera game.
              Keep a chair or wall nearby before you begin.
            </p>
          </div>
        </SteplyCard>
      )}

      <div className="exercise-grid">
        {dynamicExercises.map((exercise) => {
          const isActive = exercise.id === activeExerciseId;
          const isPlayable = exercise.gameAllowed !== false && Boolean(gameTypeForRecommendation(exercise));
          return (
            <ExerciseCard
              key={exercise.id}
              {...exercise}
              active={isActive}
              action={(
                <SteplyButton
                  type="button"
                  variant={isActive ? 'secondary' : 'primary'}
                  onClick={() => setActiveExerciseId(exercise.id)}
                  disabled={!isPlayable}
                >
                  {!isPlayable ? 'Supported Practice' : isActive ? 'AR Game Open' : 'Start'}
                </SteplyButton>
              )}
            />
          );
        })}
      </div>

      <div className="exercise-actions">
        <SteplyButton onClick={onViewProgress}>View My Progress</SteplyButton>
        <SteplyButton variant="secondary" onClick={onRestart}>Start Another Mission</SteplyButton>
      </div>
    </div>
  );
}
