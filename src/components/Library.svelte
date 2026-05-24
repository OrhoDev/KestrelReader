<script lang="ts">
  import { db, saveBookRecord, deleteBookBinary, type BookRecord } from '../core/db';
  import { parsePlainText, parseEpub, parsePdf } from '../core/parser';
  import { reportRuntimeError } from '../core/diagnostics';

  let { onPlay, onSettings } = $props<{ onPlay: (id: string) => void, onSettings: () => void }>();

  let books = $state<BookRecord[]>([]);
  let isProcessing = $state(false);
  let isDragging = $state(false);
  let dragDepth = 0;
  let deleteConfirmId = $state<string | null>(null);

  $effect(() => {
    db.books.orderBy('lastReadAt').reverse().toArray().then(b => books = b);
  });

  async function processFile(file: File) {
    isProcessing = true;
    try {
      let tokens = [];
      let format: 'epub' | 'pdf' | 'text' = 'text';

      const fileName = file.name.toLowerCase();
      const settings = await db.settings.get('baseWpm');
      const wpm = settings ? settings.value : 300;

      if (fileName.endsWith('.epub')) {
        format = 'epub';
        tokens = await parseEpub(file, wpm);
      } else if (fileName.endsWith('.pdf')) {
        format = 'pdf';
        tokens = await parsePdf(file, wpm);
      } else {
        format = 'text';
        const text = await file.text();
        tokens = parsePlainText(text, wpm);
      }

      const newBook: BookRecord = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        author: 'Unknown',
        format,
        rawContent: format === 'text' ? null : file,
        tokens,
        currentOffset: 0,
        totalWords: tokens.length,
        lastReadAt: Date.now(),
      };

      await saveBookRecord(newBook);
      books = await db.books.orderBy('lastReadAt').reverse().toArray();
    } catch (err) {
      await reportRuntimeError(err, 'Library.processFile');
      alert('Failed to process document. See console for details.');
    } finally {
      isProcessing = false;
    }
  }

  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    await processFile(target.files[0]);
    target.value = '';
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragDepth += 1;
    isDragging = dragDepth > 0;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    isDragging = dragDepth > 0;
  }

  function resetDragState() {
    dragDepth = 0;
    isDragging = false;
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    const file = e.dataTransfer?.files?.[0];
    if (file) await processFile(file);
  }

  function handleDragEnd() {
    resetDragState();
  }

  async function deleteBook(id: string) {
    const record = await db.books.get(id);
    if (record) await deleteBookBinary(record);
    await db.books.delete(id);
    books = await db.books.orderBy('lastReadAt').reverse().toArray();
    deleteConfirmId = null;
  }

  function formatPercent(book: BookRecord): string {
    if (book.totalWords === 0) return '0%';
    return Math.round((book.currentOffset / book.totalWords) * 100) + '%';
  }
</script>

<div
  class="dotted-grid page-shell library-drop-zone"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondragend={handleDragEnd}
  ondrop={handleDrop}
  role="main"
>
  {#if isDragging}
    <div class="library-drop-overlay" aria-hidden="true">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--highlight-orp)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
      <p style="margin-top:1rem;font-size:1.1rem;font-weight:600;color:var(--highlight-orp);">Drop to import</p>
      <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;">.txt, .epub, .pdf</p>
    </div>
  {/if}

  <div class="page-content library-header">
    <div class="library-brand">
      <img src="/kestrel-black.png" alt="KestrelReader" class="logo-icon-light" style="width:2.2rem;height:2.2rem;object-fit:contain;" />
      <img src="/kestrel-white.png" alt="KestrelReader" class="logo-icon-dark" style="width:2.2rem;height:2.2rem;object-fit:contain;" />
      <h1>KestrelReader</h1>
    </div>
    <button class="btn-flat library-prefs-btn" onclick={onSettings} aria-label="Preferences">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span class="library-prefs-label">Preferences</span>
    </button>
  </div>

  <div class="page-content library-grid">

    <label
      class="card card-import card-interactive"
      style="
        min-height:220px;padding:1.5rem;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;
        {isProcessing ? 'opacity:0.7;pointer-events:none;' : ''}
      "
    >
      {#if isProcessing}
        <svg style="animation:spin 1s linear infinite;width:2rem;height:2rem;color:var(--highlight-orp);margin-bottom:0.75rem;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span style="font-size:0.8rem;color:var(--highlight-orp);font-weight:600;">Processing...</span>
      {:else}
        <svg style="width:2rem;height:2rem;color:var(--text-secondary);margin-bottom:0.75rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">Import File</span>
        <span style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.4rem;line-height:1.5;">
          .txt · .epub · .pdf<br/>or drag & drop
        </span>
      {/if}
      <input type="file" accept=".txt,.epub,.pdf" style="display:none;" onchange={handleFileUpload} disabled={isProcessing} />
    </label>

    {#each books as book (book.id)}
      <div
        class="card card-interactive"
        style="min-height:220px;padding:1.5rem;display:flex;flex-direction:column;justify-content:space-between;position:relative;"
        role="button"
        tabindex="0"
        onclick={() => onPlay(book.id)}
        onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? onPlay(book.id) : null}
      >

        {#if deleteConfirmId === book.id}
          <div style="position:absolute;inset:0;background:var(--bg-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;z-index:10;border-radius:inherit;padding:1rem;text-align:center;">
            <p style="font-size:0.85rem;color:var(--text-primary);font-weight:600;margin:0;">Delete this book?</p>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0;">This cannot be undone.</p>
            <div style="display:flex;gap:0.5rem;margin-top:0.25rem;">
              <button class="btn-flat" onclick={(e) => { e.stopPropagation(); deleteConfirmId = null; }}>Cancel</button>
              <button class="btn-primary" onclick={(e) => { e.stopPropagation(); deleteBook(book.id); }}>Delete</button>
            </div>
          </div>
        {/if}

        <button
          class="btn-icon"
          onclick={(e) => { e.stopPropagation(); deleteConfirmId = book.id; }}
          style="position:absolute;top:0.6rem;right:0.75rem;opacity:0;transition:opacity 0.15s;"
          onmouseenter={(e) => (e.currentTarget as HTMLElement).style.opacity = '1'}
          onmouseleave={(e) => (e.currentTarget as HTMLElement).style.opacity = '0'}
          aria-label="Delete book"
          title="Delete book"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>

        <div>
          <div style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.4rem;">
            <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--text-primary);line-height:1.3;flex:1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title={book.title}>
              {book.title}
            </h3>
          </div>
          <p style="margin:0;font-size:0.75rem;color:var(--text-secondary);">{book.author}</p>
          <p style="margin:0.6rem 0 0 0;font-size:0.7rem;color:var(--text-secondary);font-family:'Fira Code',monospace;">
            {formatPercent(book)} read
          </p>
          <p style="margin:0.2rem 0 0 0;font-size:0.7rem;color:var(--text-secondary);font-family:'Fira Code',monospace;">
            {book.totalWords.toLocaleString()} words
          </p>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1rem;">
          <span class="book-format-label">{book.format}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .library-drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    opacity: 0.96;
    border: 3px dashed var(--highlight-orp);
    pointer-events: none;
  }
</style>
