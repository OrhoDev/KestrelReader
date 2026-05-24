import { calculateOrp } from './orp';
import { calculateTokenDelay, type Token } from './pacer';
import { sanitizeText } from './sanitizer';
import ePub from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function parsePlainText(text: string, baseWpm: number): Token[] {
  const cleaned = sanitizeText(text);
  const paragraphs = cleaned.split(/\n\s*\n/);
  
  const tokens: Token[] = [];
  
  paragraphs.forEach((paragraph, pIndex) => {
    const rawWords = paragraph.trim().split(/\s+/).filter(word => word.length > 0);
    
    rawWords.forEach(word => {
      tokens.push({
        text: word,
        orp: calculateOrp(word),
        delayMs: calculateTokenDelay(word, baseWpm),
        paragraphIndex: pIndex
      });
    });
  });
  
  return tokens;
}

function extractSectionText(root: Element | Document | null | undefined): string {
  if (!root) return '';

  if ('body' in root && root.body) {
    return root.body.textContent ?? '';
  }

  const body = root.getElementsByTagName?.('body')?.[0];
  return (body?.textContent ?? root.textContent ?? '').trim();
}

export async function parseEpub(file: File | Blob, baseWpm: number): Promise<Token[]> {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);

  await book.ready;

  let fullText = '';
  const loadSection = book.load.bind(book);

  // @ts-ignore
  for (const item of book.spine.spineItems) {
    try {
      const root = await item.load(loadSection);
      const sectionText = extractSectionText(root);
      if (sectionText) {
        fullText += `\n\n${sectionText}`;
      }
    } finally {
      item.unload();
    }
  }

  if (!fullText.trim()) {
    throw new Error('No readable text found in EPUB.');
  }

  return parsePlainText(fullText, baseWpm);
}

export async function parsePdf(file: File | Blob, baseWpm: number): Promise<Token[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // @ts-ignore
    const strings = content.items.map(item => item.str);
    fullText += ' ' + strings.join(' ');
  }
  
  return parsePlainText(fullText, baseWpm);
}
