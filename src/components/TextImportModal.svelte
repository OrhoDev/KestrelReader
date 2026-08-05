<script lang="ts">
  let {
    mode,
    onComplete,
    onCancel,
  } = $props<{
    mode: 'paste' | 'url';
    onComplete: (payload: { title: string; author: string; text: string; format: 'paste' | 'url' }) => void;
    onCancel: () => void;
  }>();

  let pastedText = $state('');
  let urlValue = $state('');
  let isLoading = $state(false);
  let errorMessage = $state<string | null>(null);

  const title = $derived(mode === 'paste' ? 'Paste text' : 'Import from URL');
  const hint = $derived(
    mode === 'paste'
      ? 'Paste text to read with RSVP.'
      : 'Enter a URL. Some sites block fetching. Use the extension if it fails.',
  );

  async function handleSubmit() {
    errorMessage = null;
    isLoading = true;
    try {
      if (mode === 'paste') {
        const text = pastedText.trim();
        if (!text) {
          errorMessage = 'Paste some text first.';
          return;
        }
        const preview = text.slice(0, 48).replace(/\s+/g, ' ');
        onComplete({
          title: preview.length < text.length ? `${preview}…` : preview,
          author: 'Pasted text',
          text,
          format: 'paste',
        });
        return;
      }

      const { fetchArticleFromUrl } = await import('../core/urlImport');
      const article = await fetchArticleFromUrl(urlValue);
      onComplete({
        title: article.title,
        author: article.author,
        text: article.text,
        format: 'url',
      });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Import failed.';
    } finally {
      isLoading = false;
    }
  }

  async function pasteFromClipboard() {
    errorMessage = null;
    try {
      pastedText = await navigator.clipboard.readText();
    } catch {
      errorMessage = 'Could not read clipboard. Paste manually instead.';
    }
  }
</script>

<div class="import-modal-backdrop">
  <button type="button" class="import-modal-backdrop-close" onclick={onCancel} aria-label="Close dialog"></button>
  <div
    class="import-modal card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-modal-title"
    tabindex="-1"
  >
    <header class="import-modal-header">
      <h2 id="import-modal-title">{title}</h2>
      <button type="button" class="btn-flat" onclick={onCancel}>Close</button>
    </header>

    <p class="import-modal-hint">{hint}</p>

    {#if mode === 'paste'}
      <div class="import-modal-actions">
        <button type="button" class="btn-flat" onclick={pasteFromClipboard}>Read from clipboard</button>
      </div>
      <textarea
        class="import-modal-textarea"
        bind:value={pastedText}
        placeholder="Paste text here…"
        rows="10"
      ></textarea>
    {:else}
      <input
        class="import-modal-input"
        type="url"
        bind:value={urlValue}
        placeholder="https://example.com/article"
        onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
      />
    {/if}

    {#if errorMessage}
      <p class="import-modal-error">{errorMessage}</p>
    {/if}

    <footer class="import-modal-footer">
      <button type="button" class="btn-flat" onclick={onCancel} disabled={isLoading}>Cancel</button>
      <button type="button" class="btn-primary" onclick={handleSubmit} disabled={isLoading}>
        {isLoading ? 'Importing…' : 'Start reading'}
      </button>
    </footer>
  </div>
</div>

<style>
  .import-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
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
    width: min(560px, 100%);
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

  .import-modal-actions {
    margin-bottom: 0.75rem;
  }

  .import-modal-textarea,
  .import-modal-input {
    width: 100%;
    box-sizing: border-box;
    border: 1.5px solid var(--ui-border);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.88rem;
    padding: 0.75rem;
    resize: vertical;
  }

  .import-modal-textarea:focus,
  .import-modal-input:focus {
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
</style>
