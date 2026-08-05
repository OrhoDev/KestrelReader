<script lang="ts">
  import type { BookPin } from '../core/db';

  let {
    pins,
    activeOffset,
    onJump,
    onDelete,
    onClose,
  } = $props<{
    pins: BookPin[];
    activeOffset: number;
    onJump: (offset: number) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
  }>();
</script>

<div class="pins-backdrop">
  <button type="button" class="pins-backdrop-close" onclick={onClose} aria-label="Close pins"></button>
  <div class="pins-modal card" role="dialog" aria-modal="true" aria-labelledby="pins-title" tabindex="-1">
    <header class="pins-header">
      <h2 id="pins-title">Pins</h2>
      <button type="button" class="btn-flat" onclick={onClose}>Close</button>
    </header>

    {#if pins.length === 0}
      <p class="pins-empty">No pins yet. Press <kbd>M</kbd> while reading to add one.</p>
    {:else}
      <ul class="pins-list">
        {#each pins as pin (pin.id)}
          <li class="pins-item">
            <button type="button" class="pins-jump" onclick={() => onJump(pin.offset)}>
              <span class="pins-label">{pin.label}</span>
              <span class="pins-meta">Word {pin.offset + 1}</span>
            </button>
            <button
              type="button"
              class="pins-delete btn-flat"
              onclick={() => onDelete(pin.id)}
              aria-label="Delete pin {pin.label}"
            >×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .pins-backdrop {
    position: fixed;
    inset: 0;
    z-index: 130;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .pins-backdrop-close {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    cursor: default;
  }

  .pins-modal {
    position: relative;
    z-index: 1;
    width: min(420px, 100%);
    padding: 1.25rem;
  }

  .pins-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .pins-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .pins-empty {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .pins-empty kbd {
    font-family: 'Fira Code', monospace;
    font-size: 0.78rem;
    padding: 0.15rem 0.35rem;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: var(--bg-primary);
  }

  .pins-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pins-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border-bottom: 1px solid var(--ui-border);
  }

  .pins-item:last-child {
    border-bottom: none;
  }

  .pins-jump {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .pins-jump:hover .pins-label {
    color: var(--highlight-orp);
  }

  .pins-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .pins-meta {
    font-family: 'Fira Code', monospace;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }

  .pins-delete {
    min-width: 2rem;
    padding: 0.25rem 0.5rem;
    font-size: 1.1rem;
    line-height: 1;
    color: var(--text-secondary);
  }
</style>
