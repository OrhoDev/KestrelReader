<script lang="ts">
  let {
    text,
    pageCount,
    onStartReading,
    onAddPage,
    onCancel,
  } = $props<{
    text: string;
    pageCount: number;
    onStartReading: (text: string) => void;
    onAddPage: (text: string) => void;
    onCancel: () => void;
  }>();

  let editedText = $state('');
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    editedText = text;
  });

  function handleStart() {
    const trimmed = editedText.trim();
    if (!trimmed) {
      errorMessage = 'No text to read.';
      return;
    }
    onStartReading(trimmed);
  }

  function handleAddPage() {
    const trimmed = editedText.trim();
    if (!trimmed) {
      errorMessage = 'Add some text before scanning another page.';
      return;
    }
    onAddPage(trimmed);
  }
</script>

<div class="import-modal-backdrop">
  <button type="button" class="import-modal-backdrop-close" onclick={onCancel} aria-label="Close dialog"></button>
  <div
    class="import-modal card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="scan-review-title"
    tabindex="-1"
  >
    <header class="import-modal-header">
      <h2 id="scan-review-title">Review scanned text</h2>
      <button type="button" class="btn-flat" onclick={onCancel}>Close</button>
    </header>

    <p class="import-modal-hint">
      {#if pageCount > 1}
        {pageCount} pages scanned. Fix any OCR mistakes, then start reading or scan another page.
      {:else}
        Best for a single page or short excerpt. For whole books, use Import File (EPUB/PDF).
      {/if}
    </p>

    <textarea
      class="import-modal-textarea"
      bind:value={editedText}
      rows="12"
      aria-label="Scanned text"
    ></textarea>

    {#if errorMessage}
      <p class="import-modal-error">{errorMessage}</p>
    {/if}

    <footer class="import-modal-footer import-modal-footer-split">
      <button type="button" class="btn-flat" onclick={onCancel}>Discard</button>
      <div class="import-modal-footer-actions">
        <button type="button" class="btn-flat" onclick={handleAddPage}>Scan another page</button>
        <button type="button" class="btn-primary" onclick={handleStart}>Start reading</button>
      </div>
    </footer>
  </div>
</div>

<style>
  .import-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 250;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .import-modal-backdrop-close {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    cursor: default;
  }

  .import-modal {
    position: relative;
    z-index: 1;
    width: min(640px, 100%);
    padding: 1.25rem;
    max-height: 90vh;
    overflow: auto;
  }

  .import-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .import-modal-header h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .import-modal-hint {
    margin: 0 0 1rem;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .import-modal-textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1.5px solid var(--ui-border);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.88rem;
    line-height: 1.55;
    padding: 0.75rem;
    resize: vertical;
    min-height: 220px;
  }

  .import-modal-textarea:focus {
    outline: none;
    border-color: var(--highlight-orp);
  }

  .import-modal-error {
    margin: 0.75rem 0 0;
    font-size: 0.82rem;
    color: #c45c4a;
  }

  .import-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .import-modal-footer-split {
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }

  .import-modal-footer-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
