<script lang="ts">
  import { untrack } from 'svelte';
  import { db, loadBook, type BookMeta } from '../core/db';
  import type { BookRecord, BookPin } from '../core/db';
  import {
    buildPlaybackTokens,
    rawOffsetFromPlayback,
    resolvePlaybackDelay,
    resolvePlaybackOffset,
    type PlaybackToken,
  } from '../core/pacer';
  import { type FocusConfig } from '../core/focusConfig';
  import { saveLocalProgress, loadLocalProgress } from '../core/progress';
  import {
    loadRsvpConfig,
    effectiveWpm,
    DEFAULT_RSVP_CONFIG,
    type RsvpConfig,
  } from '../core/rsvpConfig';
  import { recordReading } from '../core/statistics';
  import { speakWord, stopSpeech } from '../core/tts';
  import ContextPanel from './ContextPanel.svelte';
  import ShortcutsHelp from './ShortcutsHelp.svelte';
  import ReaderPins from './ReaderPins.svelte';
  import '../assets/fonts/fonts-reader.css';

  let { bookId, focusConfig, onBack } = $props<{
    bookId: string;
    focusConfig: FocusConfig;
    onBack: () => void;
  }>();

  let book = $state<BookRecord | null>(null);
  let isPlaying = $state(false);
  let playbackOffset = $state(0);
  let rawOffset = $state(0);
  let baseWpm = $state(300);
  let fontSize = $state(2.2);
  let rsvpConfig = $state<RsvpConfig>({ ...DEFAULT_RSVP_CONFIG });
  let showShortcuts = $state(false);
  let showPins = $state(false);
  let pendingWords = $state(0);

  let playbackTokens = $derived(
    book ? buildPlaybackTokens(book.tokens, focusConfig.phraseChunking) : [],
  );

  let currentToken = $derived(playbackTokens[playbackOffset] as PlaybackToken | undefined);
  let controlsVisible = $derived(!isPlaying);

  let isCompact = $state(false);
  let contextExpanded = $state(false);
  let wasCompact = false;

  $effect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const isExtension = window.location.protocol === 'chrome-extension:';
    const sync = () => {
      const nowCompact = mq.matches || isExtension;
      if (nowCompact && !wasCompact) contextExpanded = false;
      wasCompact = nowCompact;
      isCompact = nowCompact;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  type DisplayToken = { text: string; globalIndex: number; paragraphIndex?: number };
  let contextTokens = $state<DisplayToken[]>([]);
  let contextWindowStart = $state(-1);
  let contextWindowEnd = $state(-1);

  const PEEK_RADIUS = 12;

  let peekTokens = $derived.by(() => {
    if (!controlsVisible || isPlaying || !book || book.tokens.length === 0) return [];
    const offset = Math.max(0, Math.min(rawOffset, book.tokens.length - 1));
    const start = Math.max(0, offset - PEEK_RADIUS);
    const end = Math.min(book.tokens.length - 1, offset + PEEK_RADIUS);
    return buildContextSlice(start, end);
  });

  let bookPins = $derived(book?.pins ?? []);

  let contextRadius = $derived(isCompact ? 60 : 100);

  function buildContextSlice(startIdx: number, endIdx: number): DisplayToken[] {
    if (!book) return [];
    return book.tokens.slice(startIdx, endIdx + 1).map((t, idx) => ({
      text: t.text,
      globalIndex: startIdx + idx,
      paragraphIndex: t.paragraphIndex,
    }));
  }

  function scrollActiveWordIntoView() {
    requestAnimationFrame(() => {
      const el = document.getElementById('active-word');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  $effect(() => {
    if (!book || book.tokens.length === 0) {
      contextTokens = [];
      contextWindowStart = -1;
      contextWindowEnd = -1;
      return;
    }

    const offset = Math.max(0, Math.min(rawOffset, book.tokens.length - 1));
    if (offset >= contextWindowStart && offset <= contextWindowEnd) return;

    const token = book.tokens[offset];
    let startIdx: number;
    let endIdx: number;

    if (token.paragraphIndex !== undefined) {
      const pIdx = token.paragraphIndex;
      startIdx = offset;
      while (
        startIdx > 0 &&
        offset - startIdx <= contextRadius &&
        book.tokens[startIdx - 1].paragraphIndex !== undefined &&
        book.tokens[startIdx - 1].paragraphIndex! >= pIdx - 1
      ) {
        startIdx--;
      }
      endIdx = offset;
      while (
        endIdx < book.tokens.length - 1 &&
        endIdx - offset <= contextRadius &&
        book.tokens[endIdx + 1].paragraphIndex !== undefined &&
        book.tokens[endIdx + 1].paragraphIndex! <= pIdx + 1
      ) {
        endIdx++;
      }
    } else {
      startIdx = Math.max(0, offset - contextRadius);
      endIdx = Math.min(book.tokens.length - 1, offset + contextRadius);
    }

    contextWindowStart = startIdx;
    contextWindowEnd = endIdx;
    contextTokens = buildContextSlice(startIdx, endIdx);

    if (!isPlaying && (!isCompact || contextExpanded)) {
      scrollActiveWordIntoView();
    }
  });

  $effect(() => {
    if (!isPlaying && (!isCompact || contextExpanded)) {
      rawOffset;
      scrollActiveWordIntoView();
    }
  });

  $effect(() => {
    const id = bookId;
    let cancelled = false;

    loadBook(id).then(async (b) => {
      if (cancelled || !b) return;
      book = b;
      rawOffset = await loadLocalProgress(id, b.currentOffset || 0);
    });

    db.settings.get('baseWpm').then((s) => {
      if (!cancelled && s) baseWpm = s.value;
    });
    db.settings.get('fontSize').then((s) => {
      if (!cancelled && s) fontSize = s.value;
    });
    loadRsvpConfig().then((config) => {
      if (!cancelled) rsvpConfig = config;
    });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!book || playbackTokens.length === 0 || isPlaying) return;
    focusConfig.phraseChunking;
    playbackOffset = resolvePlaybackOffset(untrack(() => rawOffset), playbackTokens);
  });

  let progressSaveTimer: ReturnType<typeof setTimeout> | undefined;

  function updateWpm(newWpm: number) {
    baseWpm = Math.max(100, Math.min(1000, newWpm));
    db.settings.put({ key: 'baseWpm', value: baseWpm });
  }

  function countWordsInToken(token: PlaybackToken): number {
    return token.chunkWords?.length ?? 1;
  }

  async function flushReadingStats(seconds = 0) {
    if (pendingWords <= 0 && seconds <= 0) return;
    await recordReading(pendingWords, seconds);
    pendingWords = 0;
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (showPins && e.key === 'Escape') {
      showPins = false;
      e.preventDefault();
      return;
    }
    if (showShortcuts && e.key === 'Escape') {
      showShortcuts = false;
      e.preventDefault();
      return;
    }
    if (e.key === '?') {
      showShortcuts = !showShortcuts;
      e.preventDefault();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      addPin();
      e.preventDefault();
      return;
    }
    if (e.key === 'b' || e.key === 'B') {
      showPins = !showPins;
      e.preventDefault();
      return;
    }
    if (e.key === ' ') {
      togglePlay();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      rewind();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      forward();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      updateWpm(baseWpm + 25);
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      updateWpm(baseWpm - 25);
      e.preventDefault();
    }
  }

  $effect(() => {
    if (!isPlaying || !focusConfig.ttsEnabled || !currentToken) return;
    const wpm = effectiveWpm(baseWpm, playbackOffset, rsvpConfig);
    speakWord(currentToken.text, wpm);
    return () => stopSpeech();
  });

  $effect(() => {
    if (isPlaying && currentToken) {
      const wpm = effectiveWpm(baseWpm, playbackOffset, rsvpConfig);
      const delay = resolvePlaybackDelay(currentToken, wpm, rsvpConfig);
      const timeout = setTimeout(() => {
        pendingWords += countWordsInToken(currentToken);
        if (playbackTokens.length > 0 && playbackOffset < playbackTokens.length - 1) {
          playbackOffset += 1;
          const next = playbackTokens[playbackOffset];
          if (next) rawOffset = rawOffsetFromPlayback(next);
        } else {
          isPlaying = false;
        }
      }, delay);
      return () => clearTimeout(timeout);
    }
  });

  $effect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      void flushReadingStats(10);
    }, 10000);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!isPlaying && book) {
      const offset = rawOffset;
      clearTimeout(progressSaveTimer);
      progressSaveTimer = setTimeout(() => {
        void saveLocalProgress(bookId, offset);
      }, 400);
      return () => clearTimeout(progressSaveTimer);
    }
  });

  $effect(() => {
    if (isPlaying && book) {
      const interval = setInterval(() => {
        void saveLocalProgress(bookId, rawOffset);
      }, 5000);
      return () => clearInterval(interval);
    }
  });

  function togglePlay() {
    isPlaying = !isPlaying;
    if (!isPlaying) {
      stopSpeech();
      void flushReadingStats();
      void saveLocalProgress(bookId, rawOffset);
    }
  }

  function rewind() {
    playbackOffset = Math.max(0, playbackOffset - 10);
    const token = playbackTokens[playbackOffset];
    if (token) rawOffset = rawOffsetFromPlayback(token);
  }

  function forward() {
    playbackOffset = Math.min(playbackTokens.length - 1, playbackOffset + 10);
    const token = playbackTokens[playbackOffset];
    if (token) rawOffset = rawOffsetFromPlayback(token);
  }

  function jumpToChapter(startOffset: number) {
    selectRawOffset(startOffset);
    isPlaying = false;
  }

  function selectRawOffset(nextRawOffset: number) {
    if (!book) return;
    rawOffset = nextRawOffset;
    playbackOffset = resolvePlaybackOffset(rawOffset, playbackTokens);
  }

  async function saveBookPatch(patch: Partial<BookMeta>) {
    if (!book) return;
    book = { ...book, ...patch };
    await db.books.update(book.id, patch);
  }

  function addPin() {
    if (!book) return;
    const pin: BookPin = {
      id: crypto.randomUUID(),
      label: `Pin ${(book.pins?.length ?? 0) + 1}`,
      offset: rawOffset,
      createdAt: Date.now(),
    };
    void saveBookPatch({ pins: [...(book.pins ?? []), pin] });
  }

  function deletePin(id: string) {
    if (!book?.pins) return;
    void saveBookPatch({ pins: book.pins.filter((p) => p.id !== id) });
  }

  function jumpToPin(offset: number) {
    selectRawOffset(offset);
    showPins = false;
    isPlaying = false;
  }

  let progressPct = $derived(
    book && book.tokens.length > 0
      ? Math.round((rawOffset / book.tokens.length) * 100)
      : 0,
  );

  function toggleContext(e: Event) {
    e.stopPropagation();
    contextExpanded = !contextExpanded;
  }

  function closeContext(e: Event) {
    e.stopPropagation();
    contextExpanded = false;
  }

  let activeChapterStart = $derived.by(() => {
    if (!book?.chapters?.length) return 0;
    let start = book.chapters[0].startOffset;
    for (const chapter of book.chapters) {
      if (rawOffset >= chapter.startOffset) start = chapter.startOffset;
    }
    return start;
  });

  let bottomControlsStyle = $derived(
    isCompact && controlsVisible && !contextExpanded ? 'bottom: 2.5rem;' : '',
  );

  let bottomStackVisible = $derived(controlsVisible && !(isCompact && contextExpanded));

  let wordLineEl = $state<HTMLDivElement | undefined>(undefined);
  let orpShiftPx = $state(0);

  function measureOrpShift() {
    if (!wordLineEl) return;
    const prefix = wordLineEl.querySelector('.reader-word-prefix') as HTMLElement | null;
    const focal = wordLineEl.querySelector('.reader-word-focal') as HTMLElement | null;
    if (!prefix || !focal) {
      orpShiftPx = 0;
      return;
    }
    orpShiftPx = prefix.offsetWidth + focal.offsetWidth / 2;
  }

  $effect(() => {
    currentToken?.text;
    fontSize;
    focusConfig.bionicAnchor;
    wordLineEl;
    requestAnimationFrame(measureOrpShift);
  });

  $effect(() => {
    if (!wordLineEl) return;
    const observer = new ResizeObserver(() => measureOrpShift());
    observer.observe(wordLineEl);
    return () => observer.disconnect();
  });
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

<div class="reader-shell">
  <ContextPanel
    {contextTokens}
    peekTokens={peekTokens}
    activeRawOffset={rawOffset}
    {isCompact}
    {controlsVisible}
    {contextExpanded}
    contextOnPause={focusConfig.contextOnPause}
    onToggleContext={toggleContext}
    onCloseContext={closeContext}
    onSelectOffset={selectRawOffset}
    onTogglePlay={togglePlay}
  />

  <div
    class="reader-stage"
    style="
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      overflow:hidden;
      cursor:{isPlaying ? 'none' : 'default'};
    "
    onclick={togglePlay}
    onkeydown={(e) => (e.key === 'Enter' ? togglePlay() : null)}
    role="button"
    tabindex="0"
  >
    <div
      class="reader-top-bar"
      style="
        opacity:{controlsVisible ? '1' : '0'};
        transition:opacity 0.6s ease;
        pointer-events:{controlsVisible ? 'auto' : 'none'};
      "
    >
      <button
        class="btn-flat"
        onclick={(e) => {
          e.stopPropagation();
          onBack();
        }}
        onkeydown={(e) => e.stopPropagation()}
      >
        ← Library
      </button>

      <div class="reader-title">
        <span>{book?.title || 'Loading...'}</span>
        {#if book}
          <span style="font-size:0.72rem;font-family:'Fira Code',monospace;color:var(--highlight-orp);">
            {progressPct}%
          </span>
        {/if}
      </div>

      <div class="reader-top-actions">
        {#if book?.chapters && book.chapters.length > 1}
          <select
            class="reader-chapter-select"
            aria-label="Jump to chapter"
            value={activeChapterStart}
            onchange={(e) => {
              e.stopPropagation();
              const value = parseInt((e.currentTarget as HTMLSelectElement).value, 10);
              if (!Number.isNaN(value)) jumpToChapter(value);
            }}
            onclick={(e) => e.stopPropagation()}
          >
            {#each book.chapters as chapter}
              <option value={chapter.startOffset}>{chapter.title}</option>
            {/each}
          </select>
        {/if}
        <button
          type="button"
          class="btn-flat reader-help-btn"
          onclick={(e) => { e.stopPropagation(); showPins = true; }}
          onkeydown={(e) => e.stopPropagation()}
          aria-label="Pins"
          title="Pins (B)"
        >
          {#if bookPins.length > 0}
            <span class="reader-pins-count">{bookPins.length}</span>
          {:else}
            ◎
          {/if}
        </button>
        <button
          type="button"
          class="btn-flat reader-help-btn"
          onclick={(e) => { e.stopPropagation(); showShortcuts = true; }}
          onkeydown={(e) => e.stopPropagation()}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >?</button>
      </div>
    </div>

    <div
      style="
      position:absolute;left:0;right:0;
      top:calc(50% - 40px);
      height:80px;
      display:flex;flex-direction:column;
      justify-content:space-between;
      pointer-events:none;
    "
    >
      <div style="position:relative;width:100%;">
        <div style="border-top:1px solid var(--ui-border);opacity:0.5;width:100%;"></div>
        <div
          style="
          position:absolute;top:-4px;left:50%;transform:translateX(-50%);
          width:1px;height:8px;background:var(--highlight-orp);opacity:0.7;
        "
        ></div>
      </div>
      <div style="position:relative;width:100%;">
        <div style="border-top:1px solid var(--ui-border);opacity:0.5;width:100%;"></div>
        <div
          style="
          position:absolute;top:-4px;left:50%;transform:translateX(-50%);
          width:1px;height:8px;background:var(--highlight-orp);opacity:0.7;
        "
        ></div>
      </div>
    </div>

    <div class="reader-word-viewport">
      {#if currentToken}
        <div
          bind:this={wordLineEl}
          class="reader-word-line reader-font"
          class:reader-word-bionic={focusConfig.bionicAnchor}
          style="transform: translate(-{orpShiftPx}px, -50%); font-size: {fontSize}rem;"
        >
          <span class="reader-word-prefix">{currentToken.orp.prefix}</span>
          <span class="reader-word-focal">{currentToken.orp.focalChar}</span>
          <span class="reader-word-suffix">{currentToken.orp.suffix}</span>
        </div>
      {:else}
        <span class="reader-word-placeholder reader-font" style="font-size: {fontSize}rem;">···</span>
      {/if}
    </div>

    <div
      class="reader-bottom-stack{isCompact ? ' is-compact' : ''}"
      style="
        opacity:{bottomStackVisible ? '1' : '0'};
        transition:opacity 0.6s ease;
        pointer-events:{bottomStackVisible ? 'auto' : 'none'};
        {bottomControlsStyle}
      "
    >
      <div class="reader-bottom-controls">
        <button
          class="btn-flat btn-lg"
          onclick={(e) => {
            e.stopPropagation();
            rewind();
          }}
          onkeydown={(e) => e.stopPropagation()}
          title="Rewind 10 words (←)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>
          Rewind
        </button>

        <button
          class="btn-primary btn-lg"
          onclick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          onkeydown={(e) => e.stopPropagation()}
        >
          {#if isPlaying}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            Pause
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play
          {/if}
        </button>

        <button
          class="btn-flat btn-lg"
          onclick={(e) => {
            e.stopPropagation();
            forward();
          }}
          onkeydown={(e) => e.stopPropagation()}
          title="Skip forward 10 words (→)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>
          Skip
        </button>

        <div class="control-group" role="group" aria-label="WPM control">
          <button
            class="btn-step"
            onclick={(e) => {
              e.stopPropagation();
              updateWpm(baseWpm - 25);
            }}
            aria-label="Decrease speed"
          >−</button>
          <span style="font-family:'Fira Code',monospace;font-size:1rem;font-weight:600;color:var(--text-primary);min-width:80px;text-align:center;">
            {baseWpm} wpm
          </span>
          <button
            class="btn-step"
            onclick={(e) => {
              e.stopPropagation();
              updateWpm(baseWpm + 25);
            }}
            aria-label="Increase speed"
          >+</button>
        </div>
      </div>
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--ui-border);">
      <div style="height:100%;background:var(--highlight-orp);width:{progressPct}%;transition:width 0.1s linear;"></div>
    </div>
  </div>
</div>

{#if showShortcuts}
  <ShortcutsHelp onClose={() => (showShortcuts = false)} />
{/if}

{#if showPins}
  <ReaderPins
    pins={bookPins}
    activeOffset={rawOffset}
    onJump={jumpToPin}
    onDelete={deletePin}
    onClose={() => (showPins = false)}
  />
{/if}

<style>
  .reader-top-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    justify-content: flex-end;
  }

  .reader-chapter-select {
    max-width: 140px;
    padding: 0.35rem 0.5rem;
    font-size: 0.72rem;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-secondary);
  }

  .reader-help-btn {
    min-width: 2rem;
    padding: 0.35rem 0.55rem;
    font-family: 'Fira Code', monospace;
    font-weight: 700;
  }

  .reader-pins-count {
    font-size: 0.72rem;
    color: var(--highlight-orp);
  }
</style>
