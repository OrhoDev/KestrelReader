<script lang="ts">
  import { db } from '../core/db';
  import {
    saveFocusConfig,
    type FocusConfig,
    type VisualTint,
  } from '../core/focusConfig';

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

  $effect(() => {
    db.settings.get('baseWpm').then(s => { if (s) baseWpm = s.value; });
    db.settings.get('fontSize').then(s => { if (s) fontSize = s.value; });
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

  const themes: { key: 'falcon' | 'sand' | 'steppe'; label: string; desc: string; swatch: string }[] = [
    { key: 'falcon', label: "Falcon's Canopy", desc: 'Warm dark espresso', swatch: '#1E1916' },
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
      <p style="margin:0.5rem 0 0 0;font-size:0.7rem;color:var(--text-secondary);text-align:center;">Preview (ORP highlighted)</p>
    </div>

    <div class="card" style="padding:1.5rem;margin-bottom:1.25rem;">
      <h2 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600;color:var(--text-primary);">Focus &amp; Comfort</h2>

      <div class="focus-setting-list">
        <label class="focus-toggle">
          <input
            type="checkbox"
            checked={focusConfig.bionicAnchor}
            onchange={(e) => updateFocusConfig({ bionicAnchor: e.currentTarget.checked })}
          />
          <span>
            <strong>Bold starting letters</strong>
            <small>Emphasize the opening letters of each word.</small>
          </span>
        </label>

        <label class="focus-toggle">
          <input
            type="checkbox"
            checked={focusConfig.phraseChunking}
            onchange={(e) => updateFocusConfig({ phraseChunking: e.currentTarget.checked })}
          />
          <span>
            <strong>Semantic Phrase Chunking</strong>
            <small>Group tiny connector words with the next word.</small>
          </span>
        </label>

      </div>

      <div style="margin-top:1.25rem;">
        <p style="margin:0 0 0.75rem 0;font-size:0.82rem;color:var(--text-secondary);">Visual Stress Tint</p>
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
