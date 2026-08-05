import Dexie, { type Table } from 'dexie';
import type { Token } from './pacer';
import { reportRuntimeError } from './diagnostics';

export interface BookPin {
  id: string;
  label: string;
  offset: number;
  createdAt: number;
}

export interface BookChapter {
  title: string;
  startOffset: number;
}

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: 'epub' | 'pdf' | 'text' | 'scan' | 'paste' | 'url' | 'docx' | 'mobi';
  rawContent: string | Blob | null;
  localPath?: string;
  chapters?: BookChapter[];
  pins?: BookPin[];
  currentOffset: number;
  totalWords: number;
  lastReadAt: number;
}

export interface BookRecord extends BookMeta {
  tokens: Token[];
}

export interface BookTokensRecord {
  bookId: string;
  tokens: Token[];
}

export interface SettingRecord {
  key: string;
  value: any;
}

export interface StatRecord {
  id: string;
  date: string;
  wordsRead: number;
  secondsRead: number;
}

const BOOKS_DIR = 'books';

type LegacyBookRow = BookMeta & { tokens?: Token[] };

export function slimToken(raw: { text: string; paragraphIndex?: number }): Token {
  const token: Token = { text: raw.text };
  if (raw.paragraphIndex !== undefined) token.paragraphIndex = raw.paragraphIndex;
  return token;
}

export function slimTokens(tokens: Array<{ text: string; paragraphIndex?: number }>): Token[] {
  return tokens.map(slimToken);
}

export class KestrelDB extends Dexie {
  books!: Table<BookMeta, string>;
  bookTokens!: Table<BookTokensRecord, string>;
  settings!: Table<SettingRecord, string>;
  statistics!: Table<StatRecord, string>;

  constructor() {
    super('KestrelReaderDB');
    this.version(1).stores({
      books: 'id, title, author, format, lastReadAt',
      settings: 'key',
      statistics: 'id, date',
    });
    this.version(2)
      .stores({
        books: 'id, title, author, format, lastReadAt',
        bookTokens: 'bookId',
        settings: 'key',
        statistics: 'id, date',
      })
      .upgrade(async (tx) => {
        const books = await tx.table<LegacyBookRow>('books').toArray();
        const tokenTable = tx.table<BookTokensRecord>('bookTokens');
        const bookTable = tx.table<BookMeta>('books');

        for (const book of books) {
          if (!book.tokens?.length) continue;

          await tokenTable.put({
            bookId: book.id,
            tokens: slimTokens(book.tokens),
          });

          const { tokens: _removed, ...meta } = book;
          await bookTable.put(meta);
        }
      });
  }
}

export const db = new KestrelDB();

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

async function ensureBooksDirectory(): Promise<void> {
  const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  await mkdir(BOOKS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

async function writeBookBinary(bookId: string, data: Blob | ArrayBuffer): Promise<string> {
  const { writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  await ensureBooksDirectory();
  const relativePath = `${BOOKS_DIR}/${bookId}.bin`;
  const bytes =
    data instanceof Blob
      ? new Uint8Array(await data.arrayBuffer())
      : new Uint8Array(data);
  await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData });
  return relativePath;
}

export async function listBooks(): Promise<BookMeta[]> {
  return db.books.orderBy('lastReadAt').reverse().toArray();
}

export async function loadBook(bookId: string): Promise<BookRecord | null> {
  const meta = await db.books.get(bookId);
  if (!meta) return null;

  const tokenRecord = await db.bookTokens.get(bookId);
  const legacyTokens = (meta as LegacyBookRow).tokens;
  const tokens = tokenRecord?.tokens ?? (legacyTokens ? slimTokens(legacyTokens) : []);

  return { ...meta, tokens };
}

export async function loadBookBinary(record: BookMeta): Promise<Blob | null> {
  if (record.rawContent instanceof Blob) {
    return record.rawContent;
  }

  if (!record.localPath || !isTauri()) {
    return null;
  }

  try {
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const bytes = await readFile(record.localPath, { baseDir: BaseDirectory.AppData });
    return new Blob([bytes]);
  } catch (error) {
    await reportRuntimeError(error, 'loadBookBinary');
    return null;
  }
}

export async function saveBookRecord(book: BookRecord): Promise<void> {
  const { tokens, ...meta } = book;
  const slimmed = slimTokens(tokens);

  await db.bookTokens.put({ bookId: book.id, tokens: slimmed });

  const recordToSave: BookMeta = { ...meta };

  if (isTauri() && recordToSave.rawContent instanceof Blob) {
    try {
      recordToSave.localPath = await writeBookBinary(recordToSave.id, recordToSave.rawContent);
      recordToSave.rawContent = null;
      await db.books.put(recordToSave);
      return;
    } catch (error) {
      await reportRuntimeError(error, 'saveBookRecord.tauri');
    }
  }

  await db.books.put(recordToSave);
}

export async function deleteBookRecord(bookId: string, meta?: BookMeta | null): Promise<void> {
  const record = meta ?? (await db.books.get(bookId));
  if (record) await deleteBookBinary(record);
  await db.bookTokens.delete(bookId);
  await db.books.delete(bookId);
}

export async function deleteBookBinary(record: BookMeta): Promise<void> {
  if (!record.localPath || !isTauri()) return;

  try {
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await remove(record.localPath, { baseDir: BaseDirectory.AppData });
  } catch (error) {
    await reportRuntimeError(error, 'deleteBookBinary');
  }
}
