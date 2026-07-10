export const journeySteps = [
  {
    id: 'assessment',
    number: 1,
    title: 'STEADI Assessment',
    description: 'Step 1 screen and v1 function check',
    activeWhen: ['start', 'analysis'],
  },
  {
    id: 'weakness',
    number: 2,
    title: 'AI Motion Analysis',
    description: 'MediaPipe landmarks and quality gate',
    activeWhen: ['result'],
  },
  {
    id: 'recommendation',
    number: 3,
    title: 'Pose Judgement',
    description: 'Hold time, reps, support, and validity',
    activeWhen: ['result'],
  },
  {
    id: 'practice',
    number: 4,
    title: 'Otago Prescription',
    description: 'Weak area mapped to safe exercise',
    activeWhen: ['exercise'],
  },
  {
    id: 'progress',
    number: 5,
    title: 'Care Agent',
    description: 'Next action, review timing, and reports',
    activeWhen: ['progress', 'start'],
  },
];
