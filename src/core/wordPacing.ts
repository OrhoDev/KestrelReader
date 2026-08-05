/** Heuristics for adaptive RSVP delays per word. */

export function estimateSyllables(word: string): number {
  const w = word.replace(/[^\p{L}]/gu, '').toLowerCase();
  if (!w) return 1;
  if (w.length <= 3) return 1;
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

export function isLikelyName(word: string): boolean {
  const core = word.replace(/[^\p{L}]/gu, '');
  if (core.length < 2) return false;
  if (word.endsWith('.')) return false;
  return /^[\p{Lu}]/u.test(core);
}

export function hasDigits(word: string): boolean {
  return /\d/.test(word);
}

export function adaptiveDelayMultiplier(word: string): number {
  let extra = 0;
  const syllables = estimateSyllables(word);

  if (syllables >= 4) extra += 0.15;
  else if (syllables === 3) extra += 0.08;

  if (isLikelyName(word)) extra += 0.12;
  if (hasDigits(word)) extra += 0.1;

  const stripped = word.replace(/[^\p{L}]/gu, '');
  if (stripped.length > 12) extra += 0.1;

  return 1 + extra;
}
