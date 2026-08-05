import Dexie, { type Table } from 'dexie';
import type { Token } from './pacer';
import { reportRuntimeError } from './diagnostics';

export interface BookChapter {
  title: string;
  startOffset: number;
}

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  format: 'epub' | 'pdf' | 'text' | 'scan' | 'paste' | 'url';
  rawContent: string | Blob | null;
  localPath?: string;
  tokens: Token[];
  chapters?: BookChapter[];
  currentOffset: number;
  totalWords: number;
  lastReadAt: number;
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

export class KestrelDB extends Dexie {
  books!: Table<BookRecord, string>;
  settings!: Table<SettingRecord, string>;
  statistics!: Table<StatRecord, string>;

  constructor() {
    super('KestrelReaderDB');
    this.version(1).stores({
      books: 'id, title, author, format, lastReadAt',
      settings: 'key',
      statistics: 'id, date',
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

export async function loadBookBinary(record: BookRecord): Promise<Blob | null> {
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
  const recordToSave: BookRecord = { ...book };

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

export async function deleteBookBinary(record: BookRecord): Promise<void> {
  if (!record.localPath || !isTauri()) return;

  try {
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await remove(record.localPath, { baseDir: BaseDirectory.AppData });
  } catch (error) {
    await reportRuntimeError(error, 'deleteBookBinary');
  }
}
