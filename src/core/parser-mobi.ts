import { initKf8File, initMobiFile } from '@lingo-reader/mobi-parser';
import type { Mobi, Kf8 } from '@lingo-reader/mobi-parser';

function htmlToPlain(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function extractTextFromParser(parser: Mobi | Kf8): Promise<string> {
  const spine = parser.getSpine();
  const parts: string[] = [];

  for (const chapter of spine) {
    const loaded = parser.loadChapter(chapter.id);
    if (loaded?.html) {
      const plain = htmlToPlain(loaded.html);
      if (plain) parts.push(plain);
    } else if ('text' in chapter && chapter.text) {
      parts.push(chapter.text.trim());
    }
  }

  parser.destroy();
  return parts.join('\n\n').trim();
}

export async function parseMobi(file: File): Promise<{ title: string; author: string; text: string }> {
  const lower = file.name.toLowerCase();

  let parser: Mobi | Kf8;
  if (lower.endsWith('.azw3') || lower.endsWith('.kf8')) {
    parser = await initKf8File(file);
  } else {
    parser = await initMobiFile(file);
  }

  const meta = parser.getMetadata();
  const text = await extractTextFromParser(parser);
  if (!text) throw new Error('No readable text in that MOBI file.');

  return {
    title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
    author: meta.author?.[0] || 'Unknown',
    text,
  };
}
