import workerURL from 'tesseract.js/dist/worker.min.js?url';
import coreURL from 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url';

type OcrProgress = { progress: number; status: string };
type OcrMode = 'page' | 'line';

export interface OcrScoredResult {
  text: string;
  score: number;
}

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;
let progressCallback: ((p: OcrProgress) => void) | undefined;
let lastOcrMode: OcrMode | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        workerPath: workerURL,
        corePath: coreURL,
        langPath: `${import.meta.env.BASE_URL}ocr`,
        workerBlobURL: false,
        logger: (message) => {
          if (!progressCallback) return;
          if (message.status === 'recognizing text') {
            progressCallback({ progress: message.progress, status: 'Reading text…' });
          } else if (message.status === 'loading tesseract core') {
            progressCallback({ progress: message.progress, status: 'Loading OCR engine…' });
          } else if (message.status === 'initializing tesseract') {
            progressCallback({ progress: message.progress, status: 'Initializing…' });
          } else if (message.status === 'loading language traineddata') {
            progressCallback({ progress: message.progress, status: 'Loading language data…' });
          }
        },
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: PSM.AUTO,
      });
      return worker;
    })();
  }
  return workerPromise;
}

function computeOtsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const value of gray) hist[value]++;

  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) ** 2;

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

function upscaleCanvas(source: HTMLCanvasElement, minWidth: number, minHeight: number): HTMLCanvasElement {
  const scale = Math.max(minWidth / source.width, minHeight / source.height, 1);
  if (scale <= 1.05) return source;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function preprocessCanvas(source: HTMLCanvasElement, mode: OcrMode): HTMLCanvasElement {
  const maxDim = mode === 'line' ? 2400 : 2000;
  let width = source.width;
  let height = source.height;

  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const gray = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  const threshold = computeOtsuThreshold(gray);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const boosted = Math.max(0, Math.min(255, ((gray[p] - 128) * 1.25) + 128));
    const value = boosted > threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);

  if (mode === 'line') {
    return upscaleCanvas(canvas, 1600, 160);
  }
  return upscaleCanvas(canvas, 1800, 1200);
}

export function cropToLineBand(source: HTMLCanvasElement, bandRatio = 0.18): HTMLCanvasElement {
  const bandHeight = Math.max(1, Math.round(source.height * bandRatio));
  const y = Math.round((source.height - bandHeight) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = bandHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.drawImage(source, 0, y, source.width, bandHeight, 0, 0, source.width, bandHeight);
  return canvas;
}

export async function loadImageToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cleanupOcrText(text: string): string {
  return text
    .replace(/\u00AD/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToPlain(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function scoreOcrText(text: string, confidence: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return words * (confidence / 100);
}

async function recognizeScoredFromCanvas(
  source: HTMLCanvasElement,
  options?: { lineMode?: boolean; onProgress?: (p: OcrProgress) => void },
): Promise<OcrScoredResult> {
  const mode: OcrMode = options?.lineMode ? 'line' : 'page';
  let canvas = source;
  if (options?.lineMode) {
    canvas = cropToLineBand(canvas);
  }
  canvas = preprocessCanvas(canvas, mode);

  progressCallback = options?.onProgress;
  const { PSM } = await import('tesseract.js');
  const worker = await getWorker();

  if (lastOcrMode !== mode) {
    await worker.setParameters({
      tessedit_pageseg_mode: mode === 'line' ? PSM.SINGLE_LINE : PSM.AUTO,
    });
    lastOcrMode = mode;
  }

  const { data } = await worker.recognize(canvas, {
    rotateAuto: mode === 'page',
  });
  progressCallback = undefined;

  const wordList = (data as { words?: Array<{ confidence: number }> }).words ?? [];
  const avgConf =
    wordList.length > 0
      ? wordList.reduce((sum, word) => sum + word.confidence, 0) / wordList.length
      : (data.confidence ?? 50);

  const text = cleanupOcrText(data.text);
  return { text, score: scoreOcrText(text, avgConf) };
}

export async function recognizeTextFromCanvas(
  source: HTMLCanvasElement,
  options?: { lineMode?: boolean; onProgress?: (p: OcrProgress) => void },
): Promise<string> {
  const result = await recognizeScoredFromCanvas(source, options);
  return result.text;
}

export async function recognizeBestFromCanvases(
  canvases: HTMLCanvasElement[],
  options?: { lineMode?: boolean; onProgress?: (p: OcrProgress) => void },
): Promise<string> {
  if (canvases.length === 0) return '';
  if (canvases.length === 1) {
    return recognizeTextFromCanvas(canvases[0], options);
  }

  let best: OcrScoredResult = { text: '', score: 0 };
  const total = canvases.length;

  for (let i = 0; i < total; i++) {
    options?.onProgress?.({
      progress: i / total,
      status: `Frame ${i + 1} of ${total}…`,
    });

    const result = await recognizeScoredFromCanvas(canvases[i], {
      lineMode: options?.lineMode,
    });

    if (result.score > best.score) {
      best = result;
    }
  }

  options?.onProgress?.({ progress: 1, status: 'Reading text…' });
  return best.text;
}
