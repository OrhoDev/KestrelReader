<script lang="ts">
  import type { Snippet } from 'svelte';
  import { VISUAL_TINT_COLORS, type VisualTint } from '../core/focusConfig';

  let {
    visualTint = 'none',
    children,
  } = $props<{
    visualTint?: VisualTint;
    children: Snippet;
  }>();

  let tintColor = $derived(
    VISUAL_TINT_COLORS[visualTint as VisualTint] ?? VISUAL_TINT_COLORS.none,
  );
</script>

<div class="app-layout">
  {@render children()}
  <div
    class="visual-tint-overlay"
    aria-hidden="true"
    style="background-color: {tintColor};"
  ></div>
</div>

<style>
  .app-layout {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .visual-tint-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
    transition: background-color 0.35s ease;
  }
</style>
