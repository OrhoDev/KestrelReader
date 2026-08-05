import { calculateOrp } from './orp';
import { calculateTokenDelay, type Token } from './pacer';
import { sanitizeText } from './sanitizer';

export function parsePlainText(text: string, baseWpm: number): Token[] {
  const cleaned = sanitizeText(text);
  const paragraphs = cleaned.split(/\n\s*\n/);

  const tokens: Token[] = [];

  paragraphs.forEach((paragraph, pIndex) => {
    const rawWords = paragraph.trim().split(/\s+/).filter((word) => word.length > 0);

    rawWords.forEach((word) => {
      tokens.push({
        text: word,
        orp: calculateOrp(word),
        delayMs: calculateTokenDelay(word, baseWpm),
        paragraphIndex: pIndex,
      });
    });
  });

  return tokens;
}
