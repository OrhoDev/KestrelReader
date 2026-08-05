<script lang="ts">
  import Library from './components/Library.svelte';
  import Layout from './components/Layout.svelte';
  import { db } from './core/db';
  import { parsePlainText } from './core/parser';
  import { DEFAULT_FOCUS_CONFIG, loadFocusConfig, type FocusConfig } from './core/focusConfig';
  import { reportRuntimeError, type RuntimeErrorDetail } from './core/diagnostics';

  let currentView = $state<'library' | 'reader' | 'settings'>('library');
  let activeBookId = $state<string | null>(null);
  let isExtracting = $state(false);
  let activeTheme = $state<'falcon' | 'sand' | 'steppe'>('falcon');
  let focusConfig = $state<FocusConfig>({ ...DEFAULT_FOCUS_CONFIG });
  let runtimeError = $state<RuntimeErrorDetail | null>(null);

  $effect(() => {
    const onRuntimeError = (event: Event) => {
      runtimeError = (event as CustomEvent<RuntimeErrorDetail>).detail;
    };
    window.addEventListener('kestrel-runtime-error', onRuntimeError);
    return () => window.removeEventListener('kestrel-runtime-error', onRuntimeError);
  });

  $effect(() => {
    db.settings.get('theme').then(s => {
      if (s && (s.value === 'falcon' || s.value === 'sand' || s.value === 'steppe')) {
        activeTheme = s.value;
      }
    });
    loadFocusConfig().then(config => {
      focusConfig = config;
    });
  });

  $effect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
  });

  function setTheme(t: 'falcon' | 'sand' | 'steppe') {
    activeTheme = t;
    db.settings.put({ key: 'theme', value: t });
  }

  function setFocusConfig(config: FocusConfig) {
    focusConfig = config;
  }

  function openBook(id: string) {
    activeBookId = id;
    currentView = 'reader';
  }

  $effect(() => {
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function' && window.location.protocol === 'chrome-extension:';
    if (isExtension) {
      if (activeBookId) return;

      isExtracting = true;
      chrome.runtime.sendMessage({ type: 'EXTRACT_TEXT' }, async (response) => {
        if (response && response.text && response.text.trim().length > 0) {
          try {
            const settings = await db.settings.get('baseWpm');
            const wpm = settings ? settings.value : 300;
            const tokens = parsePlainText(response.text, wpm);

            const newBook = {
              id: crypto.randomUUID(),
              title: 'Web Page Extract',
              author: 'Active Tab',
              format: 'text' as const,
              rawContent: null,
              tokens,
              currentOffset: 0,
              totalWords: tokens.length,
              lastReadAt: Date.now()
            };

            await db.books.put(newBook);
            openBook(newBook.id);
          } catch (e) {
            await reportRuntimeError(e, 'App.extensionExtract');
          }
        }
        isExtracting = false;
      });
    }
  });
</script>

<Layout visualTint={focusConfig.visualTint}>
<div style="width:100%;height:100%;background:var(--bg-primary);color:var(--text-primary);">
  {#if runtimeError}
    <div style="position:fixed;top:0;left:0;right:0;z-index:10000;padding:0.65rem 1rem;background:var(--bg-secondary);border-bottom:1px solid var(--highlight-orp);display:flex;align-items:center;justify-content:space-between;gap:1rem;">
      <p style="margin:0;font-size:0.82rem;color:var(--text-primary);">
        {runtimeError.context}: {runtimeError.message}
      </p>
      <button class="btn-flat" onclick={() => (runtimeError = null)}>Dismiss</button>
    </div>
  {/if}
  {#if isExtracting}
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-primary);z-index:50;">
      <svg style="animation:spin 1s linear infinite;width:2rem;height:2rem;color:var(--highlight-orp);margin-bottom:1rem;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p style="color:var(--text-secondary);font-weight:500;">Extracting page content...</p>
    </div>
  {/if}

  {#if currentView === 'library'}
    <Library
      onPlay={openBook}
      onSettings={() => currentView = 'settings'}
    />
  {:else if currentView === 'reader' && activeBookId}
    {#await import('./components/ReaderCanvas.svelte') then { default: ReaderCanvas }}
      <ReaderCanvas
        bookId={activeBookId}
        {focusConfig}
        onBack={() => currentView = 'library'}
      />
    {/await}
  {:else if currentView === 'settings'}
    {#await import('./components/Settings.svelte') then { default: Settings }}
      <Settings
        onBack={() => currentView = 'library'}
        activeTheme={activeTheme}
        onThemeChange={setTheme}
        {focusConfig}
        onFocusConfigChange={setFocusConfig}
      />
    {/await}
  {/if}
</div>
</Layout>

<style>
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
