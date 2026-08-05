<script lang="ts">
  import { db } from '../core/db';
  import {
    saveFocusConfig,
    type FocusConfig,
    type VisualTint,
  } from '../core/focusConfig';
  import {
    loadRsvpConfig,
    saveRsvpConfig,
    DEFAULT_RSVP_CONFIG,
    type RsvpConfig,
  } from '../core/rsvpConfig';
  import {
    getReadingStatsSummary,
    formatReadingTime,
    type ReadingStatsSummary,
  } from '../core/statistics';
  import { exportLibraryBackup, importLibraryBackup } from '../core/libraryBackup';
  import { reportRuntimeError } from '../core/diagnostics';

  let {
    onBack,
    activeTheme,
    onThemeChange,
    focusConfig,
    onFocusConfigChange,
  } = $props<{
    onBack: () => void;
    activeTheme: 'falcon' | 'sand' | 'steppe';
    onThemeChange: (t: 'falcon' | 'sand' | 'steppe') => void;
    focusConfig: FocusConfig;
    onFocusConfigChange: (config: FocusConfig) => void;
  }>();

  let baseWpm = $state(300);
  let fontSize = $state(2.2);
  let rsvpConfig = $state<RsvpConfig>({ ...DEFAULT_RSVP_CONFIG });
  let stats = $state<ReadingStatsSummary | null>(null);
  let backupMessage = $state<string | null>(null);

  $effect(() => {
    db.settings.get('baseWpm').then((s) => { if (s) baseWpm = s.value; });
    db.settings.get('fontSize').then((s) => { if (s) fontSize = s.value; });
    loadRsvpConfig().then((c) => { rsvpConfig = c; });
    getReadingStatsSummary().then((s) => { stats = s; });
  });

  function saveWpm() {
    db.settings.put({ key: 'baseWpm', value: baseWpm });
  }

  function saveFontSize() {
    db.settings.put({ key: 'fontSize', value: fontSize });
  }

  async function updateFocusConfig(patch: Partial<FocusConfig>) {
    const next = { ...focusConfig, ...patch };
    await saveFocusConfig(next);
    onFocusConfigChange(next);
  }

  async function updateRsvpConfig(patch: Partial<RsvpConfig>) {
    const next = { ...rsvpConfig, ...patch };
    rsvpConfig = next;
    await saveRsvpConfig(next);
  }

  async function handleExport() {
    backupMessage = null;
    try {
      await exportLibraryBackup();
      backupMessage = 'Backup downloaded.';
    } catch (err) {
      await reportRuntimeError(err, 'Settings.export');
      backupMessage = 'Export failed.';
    }
  }

  async function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    backupMessage = null;
    try {
      const count = await importLibraryBackup(file);
      backupMessage = `Imported ${count} book${count === 1 ? '' : 's'}.`;
    } catch (err) {
      await reportRuntimeError(err, 'Settings.import');
      backupMessage = err instanceof Error ? err.message : 'Import failed.';
    }
  }

  const themes: { key: 'falcon' | 'sand' | 'steppe'; label: string; desc: string; swatch: string }[] = [
    { key: 'falcon', label: "Canopy", desc: 'Warm dark espresso', swatch: '#1E1916' },
    { key: 'sand',   label: 'Sand & Slate',    desc: 'Soft oatmeal light',  swatch: '#F4EFEA' },
    { key: 'steppe', label: 'High Steppe',     desc: 'Mid-contrast clay',   swatch: '#8C827A' },
  ];

  const tintOptions: { key: VisualTint; label: string; swatch: string }[] = [
    { key: 'none', label: 'None', swatch: 'transparent' },
    { key: 'mint', label: 'Mint', swatch: 'hsla(142, 70%, 50%, 0.35)' },
    { key: 'peach', label: 'Peach', swatch: 'hsla(38, 92%, 50%, 0.35)' },
    { key: 'sky', label: 'Sky', swatch: 'hsla(199, 89%, 48%, 0.35)' },
  ];
</script>

<div class="dotted-grid page-shell">
  <div class="page-content-narrow">

    <div class="settings-header">
      <button class="btn-flat" onclick={onBack}>← Back</button>
      <h1>Preferences</h1>
    </div>

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Reading Speed</h2>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.75rem;">
        <label for="wpm-slider" style="font-size:0.82rem;color:var(--text-secondary);">Words Per Minute</label>
        <span style="font-family:'Fira Code',monospace;font-size:1.6rem;font-weight:700;color:var(--highlight-orp);">{baseWpm}</span>
      </div>
      <input
        id="wpm-slider"
        type="range"
        min="100" max="1000" step="10"
        bind:value={baseWpm}
        onchange={saveWpm}
        style="width:100%;accent-color:var(--highlight-orp);cursor:pointer;"
      />
      <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);font-family:'Fira Code',monospace;margin-top:0.4rem;">
        <span>100</span><span>500</span><span>1000</span>
      </div>
    </div>

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Reader Font Size</h2>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.75rem;">
        <label for="font-slider" style="font-size:0.82rem;color:var(--text-secondary);">Size</label>
        <span style="font-family:'Fira Code',monospace;font-size:1.6rem;font-weight:700;color:var(--highlight-orp);">{fontSize.toFixed(1)}rem</span>
      </div>
      <input
        id="font-slider"
        type="range"
        min="1.4" max="3.6" step="0.1"
        bind:value={fontSize}
        onchange={saveFontSize}
        style="width:100%;accent-color:var(--highlight-orp);cursor:pointer;"
      />
      <div style="
        margin-top:1.25rem;padding:1rem;
        background:var(--bg-primary);
        border:1px dashed var(--ui-border);
        border-radius:8px;
        text-align:center;
        font-family:'Atkinson Hyperlegible','Fira Code',monospace;
        font-size:{fontSize}rem;
        font-weight:700;
        letter-spacing:0.04em;
        color:var(--text-primary);
      ">
        K<span style="color:var(--highlight-orp);">e</span>strel
      </div>
      <p style="margin:0.5rem 0 0 0;font-size:0.7rem;color:var(--text-secondary);text-align:center;">Preview with ORP highlight</p>
    </div>

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Focus</h2>

      <div class="focus-setting-list">
        <label class="focus-toggle">
          <input
            type="checkbox"
            checked={focusConfig.bionicAnchor}
            onchange={(e) => updateFocusConfig({ bionicAnchor: e.currentTarget.checked })}
          />
          <span>
            <strong>Bold starting letters</strong>
            <small>Bold the first letters of each word.</small>
          </span>
        </label>

        <label class="focus-toggle">
          <input
            type="checkbox"
            checked={focusConfig.contextOnPause}
            onchange={(e) => updateFocusConfig({ contextOnPause: e.currentTarget.checked })}
          />
          <span>
            <strong>Context on pause</strong>
            <small>Show surrounding words when paused on mobile.</small>
          </span>
        </label>

        <label class="focus-toggle">
          <input
            type="checkbox"
            checked={focusConfig.phraseChunking}
            onchange={(e) => updateFocusConfig({ phraseChunking: e.currentTarget.checked })}
          />
          <span>
            <strong>Phrase chunking</strong>
            <small>Pair short words with the next word.</small>
          </span>
        </label>

      </div>

      <div style="margin-top:1.25rem;">
        <p style="margin:0 0 0.75rem 0;font-size:0.82rem;color:var(--text-secondary);">Background tint</p>
        <div class="focus-tint-grid">
          {#each tintOptions as tint}
            <button
              class="btn-option focus-tint-option{focusConfig.visualTint === tint.key ? ' is-active' : ''}"
              onclick={() => updateFocusConfig({ visualTint: tint.key })}
            >
              <div class="focus-tint-swatch" style="background:{tint.swatch};"></div>
              <span>{tint.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    {#if stats}
      <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
        <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Reading stats</h2>
        <div class="settings-stats-grid">
          <div><span class="settings-stat-value">{stats.wordsToday.toLocaleString()}</span><span class="settings-stat-label">words today</span></div>
          <div><span class="settings-stat-value">{stats.wordsWeek.toLocaleString()}</span><span class="settings-stat-label">words this week</span></div>
          <div><span class="settings-stat-value">{formatReadingTime(stats.secondsToday)}</span><span class="settings-stat-label">reading today</span></div>
          <div><span class="settings-stat-value">{stats.streakDays}</span><span class="settings-stat-label">day streak</span></div>
        </div>
      </div>
    {/if}

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">RSVP timing</h2>

        <label class="focus-toggle" style="margin-bottom:1rem;">
        <input
          type="checkbox"
          checked={rsvpConfig.adaptivePacing}
          onchange={(e) => updateRsvpConfig({ adaptivePacing: e.currentTarget.checked })}
        />
        <span>
          <strong>Adaptive pacing</strong>
          <small>Slow down on long words, names, and numbers.</small>
        </span>
      </label>

      <label class="focus-toggle" style="margin-bottom:1rem;">
        <input
          type="checkbox"
          checked={rsvpConfig.rampUpEnabled}
          onchange={(e) => updateRsvpConfig({ rampUpEnabled: e.currentTarget.checked })}
        />
        <span>
          <strong>Ramp up speed</strong>
          <small>Start below target WPM and increase.</small>
        </span>
      </label>

      <div style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.35rem;">
          <span>Sentence pause</span>
          <span>{rsvpConfig.sentencePause.toFixed(1)}×</span>
        </div>
        <input type="range" min="0" max="3" step="0.1" bind:value={rsvpConfig.sentencePause} onchange={() => updateRsvpConfig({ sentencePause: rsvpConfig.sentencePause })} style="width:100%;accent-color:var(--highlight-orp);" />
      </div>

      <div style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.35rem;">
          <span>Comma pause</span>
          <span>{rsvpConfig.commaPause.toFixed(1)}×</span>
        </div>
        <input type="range" min="0" max="2" step="0.1" bind:value={rsvpConfig.commaPause} onchange={() => updateRsvpConfig({ commaPause: rsvpConfig.commaPause })} style="width:100%;accent-color:var(--highlight-orp);" />
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.35rem;">
          <span>Long word pause</span>
          <span>{rsvpConfig.longWordPause.toFixed(1)}×</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" bind:value={rsvpConfig.longWordPause} onchange={() => updateRsvpConfig({ longWordPause: rsvpConfig.longWordPause })} style="width:100%;accent-color:var(--highlight-orp);" />
      </div>
    </div>

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 0.75rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Library backup</h2>
      <p style="margin:0 0 1rem;font-size:0.82rem;line-height:1.55;color:var(--text-secondary);">
        Export library and settings as JSON. EPUB and PDF files are not included. Import those again separately.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
        <button type="button" class="btn-flat" onclick={handleExport}>Download backup</button>
        <label class="btn-flat" style="cursor:pointer;">
          Import backup
          <input type="file" accept="application/json,.json" hidden onchange={handleImportFile} />
        </label>
      </div>
      {#if backupMessage}
        <p style="margin:0.75rem 0 0;font-size:0.82rem;color:var(--text-secondary);">{backupMessage}</p>
      {/if}
    </div>

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Theme</h2>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        {#each themes as theme}
          <button
            class="btn-option{activeTheme === theme.key ? ' is-active' : ''}"
            onclick={() => onThemeChange(theme.key)}
          >
            <div style="
              width:2rem;height:2rem;flex-shrink:0;
              background:{theme.swatch};
              border:1.5px solid var(--ui-border);
              border-radius:50%;
            "></div>
            <div>
              <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">{theme.label}</div>
              <div style="font-size:0.74rem;color:var(--text-secondary);">{theme.desc}</div>
            </div>
            {#if activeTheme === theme.key}
              <svg style="margin-left:auto;color:var(--highlight-orp);flex-shrink:0;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>

  </div>
</div>

<style>
  .settings-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .settings-stat-value {
    display: block;
    font-family: 'Fira Code', monospace;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--highlight-orp);
  }

  .settings-stat-label {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }
</style>
