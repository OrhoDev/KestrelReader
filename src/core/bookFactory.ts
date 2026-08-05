import { saveBookRecord, type BookChapter, type BookMeta, type BookRecord } from './db';
import { parsePlainText } from './parser';
import type { Token } from './pacer';

export type BookFormat = BookMeta['format'];

export async function createBookFromText(
  text: string,
  options: {
    title: string;
    author: string;
    format: BookFormat;
    rawContent?: string | Blob | null;
    chapters?: BookChapter[];
  },
): Promise<BookRecord> {
  const tokens = parsePlainText(text);
  if (tokens.length === 0) {
    throw new Error('No readable text found.');
  }

  const book: BookRecord = {
    id: crypto.randomUUID(),
    title: options.title,
    author: options.author,
    format: options.format,
    rawContent: options.rawContent ?? null,
    tokens,
    chapters: options.chapters,
    currentOffset: 0,
    totalWords: tokens.length,
    lastReadAt: Date.now(),
  };

  await saveBookRecord(book);
  return book;
}

export async function createBookFromTokens(
  tokens: Token[],
  options: {
    title: string;
    author: string;
    format: BookFormat;
    rawContent?: string | Blob | null;
    chapters?: BookChapter[];
  },
): Promise<BookRecord> {
  if (tokens.length === 0) throw new Error('No readable text found.');

  const book: BookRecord = {
    id: crypto.randomUUID(),
    title: options.title,
    author: options.author,
    format: options.format,
    rawContent: options.rawContent ?? null,
    tokens,
    chapters: options.chapters,
    currentOffset: 0,
    totalWords: tokens.length,
    lastReadAt: Date.now(),
  };

  await saveBookRecord(book);
  return book;
}

export function findContinueBook(books: BookMeta[]): BookMeta | null {
  const candidates = books.filter(
    (b) => b.totalWords > 0 && b.currentOffset > 0 && b.currentOffset < b.totalWords - 1,
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.lastReadAt - a.lastReadAt)[0];
}
