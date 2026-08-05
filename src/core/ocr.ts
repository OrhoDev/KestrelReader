import workerURL from 'tesseract.js/dist/worker.min.js?url';
import coreURL from 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url';

type OcrProgress = { progress: number; status: string };

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;
let progressCallback: ((p: OcrProgress) => void) | undefined;

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
            progressCallback({ progress: message.progress, status: 'Loading OCR…' });
          } else if (message.status === 'initializing tesseract') {
            progressCallback({ progress: message.progress, status: 'Starting…' });
          } else if (message.status === 'loading language traineddata') {
            progressCallback({ progress: message.progress, status: 'Loading language…' });
          }
        },
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      return worker;
    })();
  }
  return workerPromise;
}

function otsuThreshold(histogram: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    weightB += histogram[i];
    if (weightB === 0) continue;

    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += i * histogram[i];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

function preprocessCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const targetMax = 2200;
  const minScale = 1.35;
  let width = source.width;
  let height = source.height;

  const upscale = Math.max(minScale, targetMax / Math.max(width, height));
  if (upscale > 1) {
    width = Math.round(width * upscale);
    height = Math.round(height * upscale);
  } else if (width > targetMax || height > targetMax) {
    const downscale = targetMax / Math.max(width, height);
    width = Math.round(width * downscale);
    height = Math.round(height * downscale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const histogram = new Uint32Array(256);
  const gray = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = value;
    histogram[value]++;
  }

  const threshold = otsuThreshold(histogram, gray.length);
  const invert = histogram.slice(0, 128).reduce((a, b) => a + b, 0) >
    histogram.slice(128).reduce((a, b) => a + b, 0);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = invert
      ? (gray[p] > threshold ? 0 : 255)
      : (gray[p] >= threshold ? 255 : 0);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
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
    .replace(/[|¦]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function recognizeTextFromCanvas(
  source: HTMLCanvasElement,
  options?: { onProgress?: (p: OcrProgress) => void },
): Promise<string> {
  const canvas = preprocessCanvas(source);

  progressCallback = options?.onProgress;
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, { rotateAuto: true });
  progressCallback = undefined;

  return cleanupOcrText(data.text);
}
