<script lang="ts">
  import { db, saveBookRecord, deleteBookBinary, type BookRecord } from '../core/db';
  import { parsePlainText } from '../core/parser';
  import { reportRuntimeError } from '../core/diagnostics';
  import { createBookFromText, createBookFromTokens, findContinueBook } from '../core/bookFactory';
  import TextImportModal from './TextImportModal.svelte';

  let { onPlay, onSettings, extensionSavedBookId = null, extensionSavedTitle = null } = $props<{
    onPlay: (id: string) => void;
    onSettings: () => void;
    extensionSavedBookId?: string | null;
    extensionSavedTitle?: string | null;
  }>();

  let books = $state<BookRecord[]>([]);
  let isProcessing = $state(false);
  let isDragging = $state(false);
  let dragDepth = 0;
  let deleteConfirmId = $state<string | null>(null);
  let showScanner = $state(false);
  let scannerStream = $state<MediaStream | null>(null);
  let textImportMode = $state<'paste' | 'url' | null>(null);
  let errorMessage = $state<string | null>(null);
  let searchQuery = $state('');
  let sortMode = $state<'lastRead' | 'title' | 'progress'>('lastRead');

  const isExtension =
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === 'function' &&
    window.location.protocol === 'chrome-extension:';

  const canScan =
    typeof window !== 'undefined' &&
    !isExtension &&
    (typeof navigator.mediaDevices?.getUserMedia === 'function' ||
      typeof HTMLCanvasElement !== 'undefined');

  let isMobileViewport = $state(false);

  $effect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => {
      isMobileViewport = mq.matches;
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  const showScan = $derived(canScan && isMobileViewport);

  async function refreshBooks() {
    books = await db.books.orderBy('lastReadAt').reverse().toArray();
  }

  $effect(() => {
    refreshBooks();
  });

  let continueBook = $derived(findContinueBook(books));

  let displayedBooks = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = books;
    if (query) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(query) ||
          b.author.toLowerCase().includes(query),
      );
    }
    const sorted = [...list];
    if (sortMode === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === 'progress') {
      sorted.sort((a, b) => {
        const pa = a.totalWords > 0 ? a.currentOffset / a.totalWords : 0;
        const pb = b.totalWords > 0 ? b.currentOffset / b.totalWords : 0;
        return pb - pa;
      });
    } else {
      sorted.sort((a, b) => b.lastReadAt - a.lastReadAt);
    }
    return sorted;
  });

  async function getBaseWpm(): Promise<number> {
    const settings = await db.settings.get('baseWpm');
    return settings ? settings.value : 300;
  }

  function setError(message: string) {
    errorMessage = message;
  }

  async function processFile(file: File) {
    isProcessing = true;
    errorMessage = null;
    try {
      const wpm = await getBaseWpm();
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.epub')) {
        const { parseEpubWithMeta } = await import('../core/parser-epub');
        const result = await parseEpubWithMeta(file, wpm);
        await saveBookRecord({
          id: crypto.randomUUID(),
          title: result.title || file.name.replace(/\.[^/.]+$/, ''),
          author: result.author || 'Unknown',
          format: 'epub',
          rawContent: file,
          tokens: result.tokens,
          chapters: result.chapters.length > 1 ? result.chapters : undefined,
          currentOffset: 0,
          totalWords: result.tokens.length,
          lastReadAt: Date.now(),
        });
      } else if (fileName.endsWith('.pdf')) {
        const { parsePdf } = await import('../core/parser-pdf');
        const tokens = await parsePdf(file, wpm);
        await saveBookRecord({
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          author: 'Unknown',
          format: 'pdf',
          rawContent: file,
          tokens,
          currentOffset: 0,
          totalWords: tokens.length,
          lastReadAt: Date.now(),
        });
      } else if (fileName.endsWith('.docx')) {
        const { parseDocx } = await import('../core/parser-docx');
        const parsed = await parseDocx(file);
        await createBookFromText(parsed.text, {
          title: parsed.title,
          author: parsed.author,
          format: 'docx',
          rawContent: file,
          wpm,
        });
      } else if (fileName.endsWith('.mobi') || fileName.endsWith('.azw') || fileName.endsWith('.azw3')) {
        const { parseMobi } = await import('../core/parser-mobi');
        const parsed = await parseMobi(file);
        await createBookFromText(parsed.text, {
          title: parsed.title,
          author: parsed.author,
          format: 'mobi',
          rawContent: file,
          wpm,
        });
      } else {
        const text = await file.text();
        await createBookFromText(text, {
          title: file.name.replace(/\.[^/.]+$/, ''),
          author: 'Unknown',
          format: 'text',
          wpm,
        });
      }

      await refreshBooks();
    } catch (err) {
      await reportRuntimeError(err, 'Library.processFile');
      setError('Failed to process that file.');
    } finally {
      isProcessing = false;
    }
  }

  async function handleTextImport(payload: {
    title: string;
    author: string;
    text: string;
    format: 'paste' | 'url';
  }) {
    textImportMode = null;
    isProcessing = true;
    errorMessage = null;
    try {
      const wpm = await getBaseWpm();
      const book = await createBookFromText(payload.text, {
        title: payload.title,
        author: payload.author,
        format: payload.format,
        wpm,
      });
      await refreshBooks();
      onPlay(book.id);
    } catch (err) {
      await reportRuntimeError(err, 'Library.handleTextImport');
      setError(err instanceof Error ? err.message : 'Import failed.');
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
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
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
    await refreshBooks();
    deleteConfirmId = null;
  }

  function formatPercent(book: BookRecord): string {
    if (book.totalWords === 0) return '0%';
    return Math.round((book.currentOffset / book.totalWords) * 100) + '%';
  }

  function formatScanTitle(): string {
    const now = new Date();
    return `Scan ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  function releaseScannerStream() {
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop());
      scannerStream = null;
    }
  }

  async function openScanner() {
    releaseScannerStream();
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        scannerStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      }
    } catch {
      scannerStream = null;
    }
    showScanner = true;
  }

  function closeScanner() {
    showScanner = false;
    releaseScannerStream();
  }

  async function handleScanComplete(text: string) {
    closeScanner();
    isProcessing = true;
    errorMessage = null;
    try {
      const wpm = await getBaseWpm();
      const tokens = parsePlainText(text, wpm);
      const book = await createBookFromTokens(tokens, {
        title: formatScanTitle(),
        author: 'Camera scan',
        format: 'scan',
      });
      await refreshBooks();
      onPlay(book.id);
    } catch (err) {
      await reportRuntimeError(err, 'Library.handleScanComplete');
      setError(err instanceof Error ? err.message : 'Failed to process scanned text.');
    } finally {
      isProcessing = false;
    }
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

  {#if isExtension && extensionSavedBookId}
    <div class="page-content library-extension-banner card">
      <p>Article saved: <strong>{extensionSavedTitle ?? 'Web article'}</strong></p>
      <button type="button" class="btn-primary" onclick={() => onPlay(extensionSavedBookId!)}>Read now</button>
    </div>
  {/if}

  {#if errorMessage}
    <div class="library-error-banner page-content">
      <p>{errorMessage}</p>
      <button type="button" class="btn-flat" onclick={() => (errorMessage = null)}>Dismiss</button>
    </div>
  {/if}

  <div class="page-content library-header">
    <div class="library-brand">
      <img src="/kestrel-black.png" alt="" width="44" height="44" class="logo-icon-light library-logo" />
      <img src="/kestrel-white.png" alt="" width="44" height="44" class="logo-icon-dark library-logo" />
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

  {#if continueBook}
    <div class="page-content library-continue">
      <button type="button" class="card card-interactive library-continue-card" onclick={() => onPlay(continueBook.id)}>
        <div>
          <p class="library-continue-title">{continueBook.title}</p>
          <p class="library-continue-meta">{formatPercent(continueBook)} · {continueBook.totalWords.toLocaleString()} words</p>
        </div>
        <span class="btn-primary library-continue-btn">Resume</span>
      </button>
    </div>
  {/if}

  <div class="page-content library-toolbar">
    <input
      type="search"
      class="library-search"
      placeholder="Search library…"
      bind:value={searchQuery}
      aria-label="Search library"
    />
    <select class="library-sort" bind:value={sortMode} aria-label="Sort library">
      <option value="lastRead">Last read</option>
      <option value="title">Title</option>
      <option value="progress">Progress</option>
    </select>
  </div>

  <div class="page-content library-grid">
    {#if showScan}
      <button
        type="button"
        class="card card-import card-interactive"
        style="min-height:200px;padding:1.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"
        onclick={() => void openScanner()}
        disabled={isProcessing}
      >
        <svg style="width:2rem;height:2rem;color:var(--highlight-orp);margin-bottom:0.75rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">Scan Text</span>
        <span style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.4rem;line-height:1.5;">Photo of a page</span>
      </button>
    {/if}

    <button
      type="button"
      class="card card-import card-interactive"
      style="min-height:200px;padding:1.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"
      onclick={() => (textImportMode = 'paste')}
      disabled={isProcessing}
    >
      <svg style="width:2rem;height:2rem;color:var(--text-secondary);margin-bottom:0.75rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">Paste Text</span>
        <span style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.4rem;">Paste or type text</span>
    </button>

    {#if !isExtension}
      <button
        type="button"
        class="card card-import card-interactive"
        style="min-height:200px;padding:1.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"
        onclick={() => (textImportMode = 'url')}
        disabled={isProcessing}
      >
        <svg style="width:2rem;height:2rem;color:var(--text-secondary);margin-bottom:0.75rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">From URL</span>
        <span style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.4rem;">Web article URL</span>
      </button>
    {/if}

    <label
      class="card card-import card-interactive"
      style="min-height:200px;padding:1.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;{isProcessing ? 'opacity:0.7;pointer-events:none;' : ''}"
    >
      {#if isProcessing}
        <svg class="library-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span style="font-size:0.8rem;color:var(--highlight-orp);font-weight:600;">Processing…</span>
      {:else}
        <svg style="width:2rem;height:2rem;color:var(--text-secondary);margin-bottom:0.75rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">Import File</span>
        <span style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.4rem;line-height:1.5;">.txt · .epub · .pdf · .docx · .mobi</span>
      {/if}
      <input type="file" accept=".txt,.epub,.pdf,.docx,.mobi,.azw,.azw3" style="display:none;" onchange={handleFileUpload} disabled={isProcessing} />
    </label>

    {#if books.length === 0 && !isProcessing}
      <div class="library-empty card" style="grid-column:1/-1;padding:2rem;text-align:center;">
        <p style="margin:0;font-size:0.9rem;color:var(--text-secondary);line-height:1.6;">
          Your library is empty. Import a file, paste text, or scan a page.
        </p>
      </div>
    {:else if displayedBooks.length === 0}
      <div class="library-empty card" style="grid-column:1/-1;padding:1.5rem;text-align:center;">
        <p style="margin:0;font-size:0.85rem;color:var(--text-secondary);">No results for that search.</p>
      </div>
    {/if}

    {#each displayedBooks as book (book.id)}
      <div
        class="card card-interactive"
        style="min-height:200px;padding:1.5rem;display:flex;flex-direction:column;justify-content:space-between;position:relative;"
        role="button"
        tabindex="0"
        onclick={() => onPlay(book.id)}
        onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? onPlay(book.id) : null}
      >
        {#if deleteConfirmId === book.id}
          <div style="position:absolute;inset:0;background:var(--bg-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;z-index:10;border-radius:inherit;padding:1rem;text-align:center;">
            <p style="font-size:0.85rem;color:var(--text-primary);font-weight:600;margin:0;">Delete this book?</p>
            <div style="display:flex;gap:0.5rem;">
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
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>

        <div>
          <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--text-primary);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title={book.title}>{book.title}</h3>
          <p style="margin:0.4rem 0 0;font-size:0.75rem;color:var(--text-secondary);">{book.author}</p>
          <p style="margin:0.6rem 0 0;font-size:0.7rem;color:var(--text-secondary);font-family:'Fira Code',monospace;">{formatPercent(book)} read</p>
          <p style="margin:0.2rem 0 0;font-size:0.7rem;color:var(--text-secondary);font-family:'Fira Code',monospace;">{book.totalWords.toLocaleString()} words</p>
        </div>

        <div style="margin-top:1rem;">
          <span class="book-format-label">{book.format}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

{#if textImportMode}
  <TextImportModal
    mode={textImportMode}
    onComplete={handleTextImport}
    onCancel={() => (textImportMode = null)}
  />
{/if}

{#if showScanner}
  {#await import('./ScanCapture.svelte')}
    <div class="scan-boot" role="status">Loading scanner…</div>
  {:then { default: ScanCapture }}
    <ScanCapture
      initialStream={scannerStream}
      onComplete={handleScanComplete}
      onCancel={closeScanner}
    />
  {/await}
{/if}

<style>
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .library-logo {
    width: 2.2rem;
    height: 2.2rem;
    object-fit: contain;
  }

  .library-spinner {
    animation: spin 1s linear infinite;
    width: 2rem;
    height: 2rem;
    color: var(--highlight-orp);
    margin-bottom: 0.75rem;
  }

  .library-extension-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    padding: 1rem 1.25rem;
  }

  .library-extension-banner p {
    margin: 0;
    font-size: 0.88rem;
    color: var(--text-secondary);
  }

  .library-error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid #c45c4a;
    border-radius: 8px;
    background: color-mix(in srgb, #c45c4a 12%, var(--bg-secondary));
  }

  .library-error-banner p {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-primary);
  }

  .library-continue {
    margin-bottom: 1.5rem;
  }

  .library-continue-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.15rem 1.35rem;
    text-align: left;
    width: 100%;
    border: none;
    cursor: pointer;
  }

  .library-continue-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .library-continue-meta {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: var(--text-secondary);
    font-family: 'Fira Code', monospace;
  }

  .library-continue-btn {
    flex-shrink: 0;
    padding: 0.45rem 1rem;
    font-size: 0.82rem;
  }

  .library-toolbar {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .library-search {
    flex: 1;
    min-width: 160px;
    padding: 0.5rem 0.75rem;
    border: 1.5px solid var(--ui-border);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.85rem;
  }

  .library-search:focus {
    outline: none;
    border-color: var(--highlight-orp);
  }

  .library-sort {
    padding: 0.5rem 0.75rem;
    border: 1.5px solid var(--ui-border);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.85rem;
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

  .scan-boot {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-size: 0.9rem;
  }
</style>
