import { calculateOrp, type OrpAnalysis } from './orp';
import type { RsvpConfig } from './rsvpConfig';
import { DEFAULT_RSVP_CONFIG } from './rsvpConfig';

export interface Token {
  text: string;
  orp: OrpAnalysis;
  delayMs: number;
  paragraphIndex?: number;
}

export interface PlaybackToken extends Token {
  sourceStart: number;
  sourceEnd: number;
  chunkWords?: string[];
}

export const PHRASE_CONNECTORS = new Set([
  'u', 'i', 'za', 'na', 'po', 'da', 'in', 'the', 'to', 'on', 'a',
]);

const CONSOLIDATION_DISCOUNT = 0.85;

export function isPhraseConnector(word: string): boolean {
  const stripped = word.replace(/[^\p{L}]/gu, '').toLowerCase();
  return stripped.length >= 1 && stripped.length <= 3 && PHRASE_CONNECTORS.has(stripped);
}

export function calculateChunkedDelay(
  words: string[],
  baseWpm: number,
  timing: RsvpConfig = DEFAULT_RSVP_CONFIG,
): number {
  const total = words.reduce((sum, word) => sum + calculateTokenDelay(word, baseWpm, timing), 0);
  return Math.round(total * CONSOLIDATION_DISCOUNT);
}

export function resolvePlaybackDelay(
  token: PlaybackToken,
  baseWpm: number,
  timing: RsvpConfig = DEFAULT_RSVP_CONFIG,
): number {
  if (token.chunkWords && token.chunkWords.length > 1) {
    return calculateChunkedDelay(token.chunkWords, baseWpm, timing);
  }
  return calculateTokenDelay(token.text, baseWpm, timing);
}

export function buildPlaybackTokens(tokens: Token[], phraseChunking: boolean): PlaybackToken[] {
  if (tokens.length === 0) return [];

  if (!phraseChunking) {
    return tokens.map((token, index) => ({
      ...token,
      delayMs: 0,
      sourceStart: index,
      sourceEnd: index,
    }));
  }

  const playbackTokens: PlaybackToken[] = [];
  let index = 0;

  while (index < tokens.length) {
    const current = tokens[index];

    if (isPhraseConnector(current.text) && index + 1 < tokens.length) {
      const next = tokens[index + 1];
      const chunkWords = [current.text, next.text];
      const combinedText = `${current.text} ${next.text}`;

      playbackTokens.push({
        text: combinedText,
        orp: calculateOrp(combinedText),
        delayMs: 0,
        paragraphIndex: current.paragraphIndex,
        sourceStart: index,
        sourceEnd: index + 1,
        chunkWords,
      });

      index += 2;
      continue;
    }

    playbackTokens.push({
      ...current,
      delayMs: 0,
      sourceStart: index,
      sourceEnd: index,
    });
    index += 1;
  }

  return playbackTokens;
}

export function resolvePlaybackOffset(
  savedRawOffset: number,
  playbackTokens: PlaybackToken[],
): number {
  const match = playbackTokens.findIndex(
    (token) => savedRawOffset >= token.sourceStart && savedRawOffset <= token.sourceEnd,
  );
  return match >= 0 ? match : 0;
}

export function rawOffsetFromPlayback(token: PlaybackToken): number {
  return token.sourceStart;
}

export function calculateTokenDelay(
  text: string,
  baseWpm: number,
  timing: RsvpConfig = DEFAULT_RSVP_CONFIG,
): number {
  const baseDelay = 60000 / baseWpm;
  let multiplier = 1.0;

  if (text.length > 10) {
    multiplier += timing.longWordPause;
  } else if (text.length > 7) {
    multiplier += timing.longWordPause * 0.5;
  }

  const lastChar = text.slice(-1);
  if (['.', '?', '!'].includes(lastChar)) {
    multiplier += timing.sentencePause;
  } else if ([',', ';', ':'].includes(lastChar)) {
    multiplier += timing.commaPause;
  } else if (text.includes('—') || text.includes('-')) {
    multiplier += 0.30;
  }

  return Math.round(baseDelay * multiplier);
}
