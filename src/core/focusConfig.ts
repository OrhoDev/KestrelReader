import { db } from './db';

export type VisualTint = 'none' | 'mint' | 'peach' | 'sky';

export interface FocusConfig {
  bionicAnchor: boolean;
  phraseChunking: boolean;
  visualTint: VisualTint;
}

export const DEFAULT_FOCUS_CONFIG: FocusConfig = {
  bionicAnchor: false,
  phraseChunking: false,
  visualTint: 'none',
};

const FOCUS_CONFIG_KEY = 'focusConfig';

export async function loadFocusConfig(): Promise<FocusConfig> {
  const record = await db.settings.get(FOCUS_CONFIG_KEY);
  if (!record?.value || typeof record.value !== 'object') {
    return { ...DEFAULT_FOCUS_CONFIG };
  }

  const stored = record.value as Partial<FocusConfig>;
  return {
    bionicAnchor: stored.bionicAnchor ?? DEFAULT_FOCUS_CONFIG.bionicAnchor,
    phraseChunking: stored.phraseChunking ?? DEFAULT_FOCUS_CONFIG.phraseChunking,
    visualTint: isVisualTint(stored.visualTint) ? stored.visualTint : DEFAULT_FOCUS_CONFIG.visualTint,
  };
}

export async function saveFocusConfig(config: FocusConfig): Promise<void> {
  await db.settings.put({ key: FOCUS_CONFIG_KEY, value: config });
}

function isVisualTint(value: unknown): value is VisualTint {
  return value === 'none' || value === 'mint' || value === 'peach' || value === 'sky';
}

export const VISUAL_TINT_COLORS: Record<VisualTint, string> = {
  none: 'transparent',
  mint: 'hsla(142, 70%, 50%, 0.08)',
  peach: 'hsla(38, 92%, 50%, 0.08)',
  sky: 'hsla(199, 89%, 48%, 0.08)',
};
