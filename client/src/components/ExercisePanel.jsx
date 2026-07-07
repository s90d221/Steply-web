import { recommendationExercises } from '../data/recommendationExercises';
import { recommendationTemplatesForResult, testLabel } from '../pose/recommendationRules';
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

function toExerciseCard(template, index) {
  const copy = friendlyExerciseCopy[template.exerciseKey] || {};
  return {
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
  const dynamicExercises = recommendationTemplates.length
    ? recommendationTemplates.map(toExerciseCard)
    : recommendationExercises;
  const sourceTestLabel = finalResult?.testLabel || testLabel(finalResult?.testType);

  return (
    <div className="panel-grid panel-grid--exercise distance-mode distance-mode--exercise">
      <SteplyCard className="recommendation-header">
        <div>
          <div className="eyebrow">Exercise Recommendation</div>
          <h2>Side Leg Bubble Pop</h2>
          <p>
            This game matches today’s {sourceTestLabel} insight. Lift gently, move at a safe pace, and aim for one calm 10-rep set.
          </p>
        </div>
        <div className="recommendation-time">One set <strong>10</strong> reps</div>
      </SteplyCard>

      <ArExerciseGame
        recommendations={recommendationTemplates}
        remoteCameraFrame={remoteCameraFrame}
        poseAnalysis={poseAnalysis}
      />

      <div className="exercise-grid">
        {dynamicExercises.map((exercise) => (
          <ExerciseCard key={exercise.title} {...exercise} />
        ))}
      </div>

      <div className="exercise-actions">
        <SteplyButton onClick={onViewProgress}>View My Progress</SteplyButton>
        <SteplyButton variant="secondary" onClick={onRestart}>Start Another Mission</SteplyButton>
      </div>
    </div>
  );
}
