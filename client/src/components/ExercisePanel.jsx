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
  const copy = friendlyExerciseCopy[template.exerciseKey] || {};
  return {
    ...normalizedTemplate,
    id: exerciseId(normalizedTemplate, index),
    number: index + 1,
    title: template.title,
    description: copy.description || template.description,
    safety: copy.safety || template.safetyNote,
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
            These games match today’s {sourceTestLabel} insight. Start one recommended exercise, move at a safe pace, and aim for one calm 10-rep set.
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
          const isPlayable = Boolean(gameTypeForRecommendation(exercise));
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
                  {isActive ? 'AR Game Open' : 'Start'}
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
