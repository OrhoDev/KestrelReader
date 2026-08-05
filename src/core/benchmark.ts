export interface BenchmarkQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export const BENCHMARK_PASSAGE = `
The kestrel is a small falcon known for its habit of hovering while hunting. Unlike larger raptors that rely on speed from a dive, the kestrel can stay nearly motionless in the air, scanning fields and roadsides for prey. Its sharp eyes detect the ultraviolet trails left by small mammals moving through grass.

Speed reading tools display words one at a time at a fixed point on screen. This method is called Rapid Serial Visual Presentation, or RSVP. The goal is to reduce eye movement so readers can process text faster. Good tools also slow down on punctuation and difficult words so comprehension stays high.

When you practice RSVP reading, pause often enough to check that you still understand the material. Tap back to earlier words when a sentence feels unclear. Context panels and bookmarks help you re-read without leaving the flow of the session.
`.trim();

export const BENCHMARK_QUESTIONS: BenchmarkQuestion[] = [
  {
    id: 'q1',
    prompt: 'What hunting style is associated with kestrels in the passage?',
    options: ['Diving at high speed', 'Hovering in place', 'Hunting only at night', 'Catching fish from water'],
    correctIndex: 1,
  },
  {
    id: 'q2',
    prompt: 'What does RSVP stand for?',
    options: [
      'Rapid Serial Visual Presentation',
      'Reading Speed Visual Process',
      'Real-time Sentence Voice Playback',
      'Random Sequential Word Placement',
    ],
    correctIndex: 0,
  },
  {
    id: 'q3',
    prompt: 'According to the passage, what helps comprehension during RSVP?',
    options: [
      'Never pausing during playback',
      'Reading only short social posts',
      'Slowing on punctuation and using context to re-read',
      'Disabling all bookmarks',
    ],
    correctIndex: 2,
  },
];

export interface BenchmarkResult {
  wpm: number;
  correctCount: number;
  totalQuestions: number;
  completedAt: number;
}

export function scoreBenchmark(answers: number[]): number {
  let correct = 0;
  for (let i = 0; i < BENCHMARK_QUESTIONS.length; i++) {
    if (answers[i] === BENCHMARK_QUESTIONS[i].correctIndex) correct += 1;
  }
  return correct;
}

export function wpmFromDuration(wordCount: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.round((wordCount / seconds) * 60);
}
