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
        tessedit_pageseg_mode: PSM.AUTO,
      });
      return worker;
    })();
  }
  return workerPromise;
}

function preprocessCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const maxDim = 1600;
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
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = Math.max(0, Math.min(255, ((gray - 128) * 1.35) + 128));
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
