<script lang="ts">
  let { onClose } = $props<{ onClose: () => void }>();
</script>

<div class="shortcuts-backdrop">
  <button type="button" class="shortcuts-backdrop-close" onclick={onClose} aria-label="Close dialog"></button>
  <div
    class="shortcuts-modal card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="shortcuts-title"
    tabindex="-1"
  >
    <header class="shortcuts-header">
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <button type="button" class="btn-flat" onclick={onClose}>Close</button>
    </header>
    <ul class="shortcuts-list">
      <li><kbd>Space</kbd><span>Play / pause</span></li>
      <li><kbd>←</kbd><span>Rewind 10 words</span></li>
      <li><kbd>→</kbd><span>Skip forward 10 words</span></li>
      <li><kbd>↑</kbd><span>Increase WPM (+25)</span></li>
      <li><kbd>↓</kbd><span>Decrease WPM (−25)</span></li>
      <li><kbd>M</kbd><span>Add pin at current word</span></li>
      <li><kbd>B</kbd><span>Open pins list</span></li>
      <li><kbd>?</kbd><span>Show this help</span></li>
    </ul>
  </div>
</div>

<style>
  .shortcuts-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .shortcuts-backdrop-close {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    cursor: default;
  }

  .shortcuts-modal {
    position: relative;
    z-index: 1;
    width: min(400px, 100%);
    padding: 1.25rem;
  }

  .shortcuts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .shortcuts-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .shortcuts-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .shortcuts-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--ui-border);
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .shortcuts-list li:last-child {
    border-bottom: none;
  }

  .shortcuts-list kbd {
    font-family: 'Fira Code', monospace;
    font-size: 0.78rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }
</style>
