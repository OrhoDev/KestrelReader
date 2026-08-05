<script lang="ts">
  import { db } from '../core/db';
  import { parsePlainText } from '../core/parser';
  import {
    BENCHMARK_PASSAGE,
    BENCHMARK_QUESTIONS,
    scoreBenchmark,
    wpmFromDuration,
    type BenchmarkResult,
  } from '../core/benchmark';

  let { onClose } = $props<{ onClose: () => void }>();

  type Phase = 'intro' | 'reading' | 'quiz' | 'result';

  let phase = $state<Phase>('intro');
  let offset = $state(0);
  let isPlaying = $state(false);
  let startedAt = $state(0);
  let answers = $state<number[]>(BENCHMARK_QUESTIONS.map(() => -1));
  let result = $state<BenchmarkResult | null>(null);

  const tokens = parsePlainText(BENCHMARK_PASSAGE);
  const wordCount = tokens.length;
  let currentWord = $derived(tokens[offset]?.text ?? '');

  $effect(() => {
    if (!isPlaying || offset >= tokens.length - 1) return;
    const timeout = setTimeout(() => {
      offset += 1;
      if (offset >= tokens.length - 1) {
        isPlaying = false;
        phase = 'quiz';
      }
    }, 220);
    return () => clearTimeout(timeout);
  });

  function startReading() {
    offset = 0;
    startedAt = Date.now();
    isPlaying = true;
    phase = 'reading';
  }

  function togglePlay() {
    if (phase !== 'reading') return;
    isPlaying = !isPlaying;
    if (!isPlaying && offset >= tokens.length - 1) {
      phase = 'quiz';
    }
  }

  async function submitQuiz() {
    const seconds = (Date.now() - startedAt) / 1000;
    const correctCount = scoreBenchmark(answers);
    const wpm = wpmFromDuration(wordCount, seconds);
    const payload: BenchmarkResult = {
      wpm,
      correctCount,
      totalQuestions: BENCHMARK_QUESTIONS.length,
      completedAt: Date.now(),
    };
    result = payload;
    await db.settings.put({ key: 'benchmarkLast', value: payload });
    phase = 'result';
  }

  const allAnswered = $derived(answers.every((a) => a >= 0));
</script>

<div class="benchmark-backdrop">
  <button type="button" class="benchmark-backdrop-close" onclick={onClose} aria-label="Close benchmark"></button>
  <div class="benchmark-modal card" role="dialog" aria-modal="true" tabindex="-1">
    <header class="benchmark-header">
      <h2>Reading benchmark</h2>
      <button type="button" class="btn-flat" onclick={onClose}>Close</button>
    </header>

    {#if phase === 'intro'}
      <p class="benchmark-copy">
        Read a short passage at RSVP speed, then answer three questions. You get WPM and a comprehension score.
      </p>
      <button type="button" class="btn-primary" onclick={startReading}>Start benchmark</button>
    {:else if phase === 'reading'}
      <div class="benchmark-stage" onclick={togglePlay} onkeydown={(e) => e.key === 'Enter' && togglePlay()} role="button" tabindex="0">
        <p class="benchmark-word">{currentWord}</p>
        <p class="benchmark-meta">{offset + 1} / {wordCount} words · {isPlaying ? 'Playing' : 'Paused'}</p>
      </div>
      <button type="button" class="btn-flat" onclick={togglePlay}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button type="button" class="btn-primary" onclick={() => { isPlaying = false; phase = 'quiz'; }}>
        Finish & quiz
      </button>
    {:else if phase === 'quiz'}
      <div class="benchmark-quiz">
        {#each BENCHMARK_QUESTIONS as question, qi}
          <fieldset class="benchmark-question">
            <legend>{question.prompt}</legend>
            {#each question.options as option, oi}
              <label class="benchmark-option">
                <input
                  type="radio"
                  name="q-{question.id}"
                  checked={answers[qi] === oi}
                  onchange={() => { answers[qi] = oi; }}
                />
                <span>{option}</span>
              </label>
            {/each}
          </fieldset>
        {/each}
      </div>
      <button type="button" class="btn-primary" disabled={!allAnswered} onclick={() => void submitQuiz()}>
        See results
      </button>
    {:else if result}
      <div class="benchmark-result">
        <p><strong>{result.wpm} WPM</strong></p>
        <p>{result.correctCount} of {result.totalQuestions} comprehension questions correct.</p>
      </div>
      <button type="button" class="btn-primary" onclick={onClose}>Done</button>
    {/if}
  </div>
</div>

<style>
  .benchmark-backdrop {
    position: fixed;
    inset: 0;
    z-index: 140;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .benchmark-backdrop-close {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    cursor: default;
  }

  .benchmark-modal {
    position: relative;
    z-index: 1;
    width: min(520px, 100%);
    padding: 1.25rem;
  }

  .benchmark-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .benchmark-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .benchmark-copy {
    margin: 0 0 1rem;
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .benchmark-stage {
    margin-bottom: 1rem;
    padding: 2rem 1rem;
    border: 1px dashed var(--ui-border);
    border-radius: 10px;
    text-align: center;
    cursor: pointer;
  }

  .benchmark-word {
    margin: 0;
    font-family: 'Atkinson Hyperlegible', 'Fira Code', monospace;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .benchmark-meta {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: 'Fira Code', monospace;
  }

  .benchmark-quiz {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .benchmark-question {
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    padding: 0.75rem;
    margin: 0;
  }

  .benchmark-question legend {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    padding: 0 0.25rem;
  }

  .benchmark-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-top: 0.45rem;
    font-size: 0.82rem;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .benchmark-result p {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .benchmark-result p:first-child {
    font-size: 1.1rem;
    color: var(--text-primary);
  }
</style>
