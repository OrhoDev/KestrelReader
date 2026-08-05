<script lang="ts">
  type DisplayToken = { text: string; globalIndex: number; paragraphIndex?: number };

  let {
    contextTokens,
    peekTokens = [],
    activeRawOffset,
    isCompact = false,
    controlsVisible,
    contextExpanded = false,
    contextOnPause = true,
    onToggleContext,
    onCloseContext,
    onSelectOffset,
    onTogglePlay,
  } = $props<{
    contextTokens: DisplayToken[];
    peekTokens?: DisplayToken[];
    activeRawOffset: number;
    isCompact?: boolean;
    controlsVisible: boolean;
    contextExpanded?: boolean;
    contextOnPause?: boolean;
    onToggleContext?: (e: Event) => void;
    onCloseContext?: (e: Event) => void;
    onSelectOffset: (offset: number) => void;
    onTogglePlay: () => void;
  }>();

  let panelClass = $derived(
    `reader-context-panel${!controlsVisible ? ' is-hidden' : ''}`,
  );

  let showPeek = $derived(
    isCompact && controlsVisible && contextOnPause && !contextExpanded && peekTokens.length > 0,
  );

  function isTokenActive(globalIndex: number): boolean {
    return globalIndex === activeRawOffset;
  }

  function handleTokenKeydown(e: KeyboardEvent, globalIndex: number) {
    if (e.key === 'Enter') {
      e.stopPropagation();
      onSelectOffset(globalIndex);
    } else if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onTogglePlay();
    }
  }
</script>

{#snippet contextBody(tokens: DisplayToken[])}
  {#each tokens as token, i (token.globalIndex)}
    {#if i > 0 && token.paragraphIndex !== undefined && tokens[i - 1].paragraphIndex !== token.paragraphIndex}
      <br /><br />
    {/if}
    <span
      id={isTokenActive(token.globalIndex) ? 'active-word' : undefined}
      role="button"
      tabindex="0"
      onclick={(e) => {
        e.stopPropagation();
        onSelectOffset(token.globalIndex);
      }}
      onkeydown={(e) => handleTokenKeydown(e, token.globalIndex)}
      class="context-word"
      class:context-word-active={isTokenActive(token.globalIndex)}
    >{token.text}</span>
  {/each}
{/snippet}

{#if showPeek}
  <div class="reader-context-peek" aria-label="Reading context">
  {@render contextBody(peekTokens)}
  </div>
{/if}

{#if !isCompact}
  <div class={panelClass}>
    {@render contextBody(contextTokens)}
  </div>
{:else if controlsVisible}
  {#if contextExpanded}
    <button class="context-backdrop" aria-label="Close context" onclick={onCloseContext}></button>
  {/if}
  <div class="reader-context-drawer" class:is-expanded={contextExpanded}>
    <button
      class="reader-context-drawer-handle"
      onclick={onToggleContext}
      aria-label={contextExpanded ? 'Close context' : 'Open context'}
      aria-expanded={contextExpanded}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    {#if contextExpanded}
      <div class="reader-context-drawer-body">
        {@render contextBody(contextTokens)}
      </div>
    {/if}
  </div>
{/if}
