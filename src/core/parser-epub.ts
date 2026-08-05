import ePub from 'epubjs';
import { parsePlainText } from './parser';
import type { BookChapter } from './db';
import type { Token } from './pacer';

export interface EpubParseResult {
  tokens: Token[];
  chapters: BookChapter[];
  title?: string;
  author?: string;
}

function extractSectionText(root: Element | Document | null | undefined): string {
  if (!root) return '';

  if ('body' in root && root.body) {
    return root.body.textContent ?? '';
  }

  const body = root.getElementsByTagName?.('body')?.[0];
  return (body?.textContent ?? root.textContent ?? '').trim();
}

async function resolveChapterTitle(book: ReturnType<typeof ePub>, index: number, href: string): Promise<string> {
  try {
    const navigation = await book.loaded.navigation;
    const toc = navigation?.toc ?? [];
    const match = toc.find((entry) => entry.href && href.includes(entry.href.split('#')[0]));
    if (match?.label?.trim()) return match.label.trim();
  } catch {}

  return `Chapter ${index + 1}`;
}

export async function parseEpub(file: File | Blob): Promise<Token[]> {
  const result = await parseEpubWithMeta(file);
  return result.tokens;
}

export async function parseEpubWithMeta(file: File | Blob): Promise<EpubParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);

  await book.ready;

  const metadata = await book.loaded.metadata;
  const title = metadata?.title?.trim();
  const author = metadata?.creator?.trim();

  const chapters: BookChapter[] = [];
  const allTokens: Token[] = [];
  const loadSection = book.load.bind(book);

  // @ts-ignore
  const spineItems = book.spine.spineItems as { href: string; load: Function; unload: Function }[];

  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    try {
      const root = await item.load(loadSection);
      const sectionText = extractSectionText(root);
      if (!sectionText) continue;

      const chapterTitle = await resolveChapterTitle(book, i, item.href);
      chapters.push({ title: chapterTitle, startOffset: allTokens.length });

      const sectionTokens = parsePlainText(sectionText);
      allTokens.push(...sectionTokens);
    } finally {
      item.unload();
    }
  }

  if (allTokens.length === 0) {
    throw new Error('No readable text found in EPUB.');
  }

  return {
    tokens: allTokens,
    chapters,
    title,
    author,
  };
}
