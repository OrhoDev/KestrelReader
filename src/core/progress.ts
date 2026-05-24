import { db } from './db';

function storageKey(bookId: string): string {
  return `kestrel_progress_${bookId}`;
}

export async function saveLocalProgress(bookId: string, offset: number): Promise<void> {
  const safeOffset = Math.max(0, Math.floor(offset));

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [storageKey(bookId)]: safeOffset });
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`kestrel_offset_${bookId}`, safeOffset.toString());
  }

  await db.books.update(bookId, { currentOffset: safeOffset });
}

export async function loadLocalProgress(bookId: string, dbOffset = 0): Promise<number> {
  let localOffset: number | null = null;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    localOffset = await new Promise<number | null>((resolve) => {
      chrome.storage.local.get(storageKey(bookId), (result) => {
        const value = result[storageKey(bookId)];
        resolve(typeof value === 'number' ? value : null);
      });
    });
  } else if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(`kestrel_offset_${bookId}`);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) localOffset = parsed;
    }
  }

  const candidates = [dbOffset, localOffset ?? 0];
  return Math.max(...candidates);
}
