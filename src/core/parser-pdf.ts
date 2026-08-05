import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { parsePlainText } from './parser';
import type { Token } from './pacer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function parsePdf(file: File | Blob, baseWpm: number): Promise<Token[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // @ts-ignore
    const strings = content.items.map((item) => item.str);
    fullText += ' ' + strings.join(' ');
  }

  return parsePlainText(fullText, baseWpm);
}
