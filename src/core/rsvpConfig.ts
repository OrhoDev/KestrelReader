import { db } from './db';

export interface RsvpConfig {
  sentencePause: number;
  commaPause: number;
  longWordPause: number;
  rampUpEnabled: boolean;
  rampUpWords: number;
  adaptivePacing: boolean;
}

export const DEFAULT_RSVP_CONFIG: RsvpConfig = {
  sentencePause: 1.2,
  commaPause: 0.5,
  longWordPause: 0.2,
  rampUpEnabled: true,
  rampUpWords: 40,
  adaptivePacing: true,
};

const RSVP_CONFIG_KEY = 'rsvpConfig';

export async function loadRsvpConfig(): Promise<RsvpConfig> {
  const record = await db.settings.get(RSVP_CONFIG_KEY);
  if (!record?.value || typeof record.value !== 'object') {
    return { ...DEFAULT_RSVP_CONFIG };
  }
  const stored = record.value as Partial<RsvpConfig>;
  return {
    sentencePause: clamp(stored.sentencePause ?? DEFAULT_RSVP_CONFIG.sentencePause, 0, 3),
    commaPause: clamp(stored.commaPause ?? DEFAULT_RSVP_CONFIG.commaPause, 0, 2),
    longWordPause: clamp(stored.longWordPause ?? DEFAULT_RSVP_CONFIG.longWordPause, 0, 1),
    rampUpEnabled: stored.rampUpEnabled ?? DEFAULT_RSVP_CONFIG.rampUpEnabled,
    rampUpWords: clamp(stored.rampUpWords ?? DEFAULT_RSVP_CONFIG.rampUpWords, 5, 200),
    adaptivePacing: stored.adaptivePacing ?? DEFAULT_RSVP_CONFIG.adaptivePacing,
  };
}

export async function saveRsvpConfig(config: RsvpConfig): Promise<void> {
  await db.settings.put({ key: RSVP_CONFIG_KEY, value: config });
}

export function effectiveWpm(baseWpm: number, playbackOffset: number, config: RsvpConfig): number {
  if (!config.rampUpEnabled || config.rampUpWords <= 0) return baseWpm;
  const progress = Math.min(1, playbackOffset / config.rampUpWords);
  return Math.round(100 + (baseWpm - 100) * progress);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
