import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ocrDir = resolve(root, 'public/ocr');
const outFile = resolve(ocrDir, 'eng.traineddata.gz');

const OCR_DATA_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';

if (existsSync(outFile)) {
  console.log('OCR language data already present.');
  process.exit(0);
}

mkdirSync(ocrDir, { recursive: true });
console.log('Downloading eng.traineddata.gz for on-device OCR…');

const response = await fetch(OCR_DATA_URL);
if (!response.ok) {
  console.error(`Failed to download OCR data: ${response.status}`);
  process.exit(1);
}

const buffer = Buffer.from(await response.arrayBuffer());
const { writeFileSync } = await import('fs');
writeFileSync(outFile, buffer);
console.log(`Saved ${outFile} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
