import { db, listBooks, loadBook, saveBookRecord, slimTokens, type BookRecord } from './db';
import { reportRuntimeError } from './diagnostics';

const BACKUP_VERSION = 1;

export interface LibraryBackup {
  version: number;
  exportedAt: number;
  books: BookRecord[];
  settings: { key: string; value: unknown }[];
}

export async function exportLibraryBackup(): Promise<void> {
  const metas = await listBooks();
  const books: BookRecord[] = [];

  for (const meta of metas) {
    const book = await loadBook(meta.id);
    if (!book) continue;
    books.push({
      ...book,
      rawContent: null,
      localPath: undefined,
    });
  }

  const settings = await db.settings.toArray();

  const payload: LibraryBackup = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    books,
    settings,
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kestrel-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importLibraryBackup(file: File): Promise<number> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as LibraryBackup;

    if (!data.books || !Array.isArray(data.books)) {
      throw new Error('Invalid backup file.');
    }

    let imported = 0;
    for (const book of data.books) {
      if (!book.id || !book.tokens?.length) continue;
      const record: BookRecord = {
        ...book,
        tokens: slimTokens(book.tokens),
        rawContent: null,
        localPath: undefined,
        lastReadAt: book.lastReadAt ?? Date.now(),
      };
      await saveBookRecord(record);
      imported += 1;
    }

    if (data.settings?.length) {
      for (const setting of data.settings) {
        if (setting.key) await db.settings.put(setting);
      }
    }

    return imported;
  } catch (error) {
    await reportRuntimeError(error, 'importLibraryBackup');
    throw error;
  }
}
