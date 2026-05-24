import { isTauri } from './db';

export type RuntimeErrorDetail = {
  context: string;
  message: string;
  timestamp: string;
};

let lastError: RuntimeErrorDetail | null = null;

export function getLastRuntimeError(): RuntimeErrorDetail | null {
  return lastError;
}

export function clearRuntimeError(): void {
  lastError = null;
}

export async function reportRuntimeError(error: unknown, context: string): Promise<RuntimeErrorDetail> {
  const message = error instanceof Error ? error.message : String(error);
  const detail: RuntimeErrorDetail = {
    context,
    message,
    timestamp: new Date().toISOString(),
  };

  lastError = detail;
  console.error(`[KestrelReader:${context}]`, error);

  if (isTauri()) {
    try {
      const { writeTextFile, readTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await mkdir('logs', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => undefined);

      const logPath = 'logs/diagnostics.log';
      const line = `${detail.timestamp} [${context}] ${message}\n`;
      let existing = '';
      try {
        existing = await readTextFile(logPath, { baseDir: BaseDirectory.AppData });
      } catch {
        existing = '';
      }
      await writeTextFile(logPath, existing + line, { baseDir: BaseDirectory.AppData });
    } catch (logError) {
      console.error('[KestrelReader] Failed to write diagnostics log:', logError);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kestrel-runtime-error', { detail }));
  }

  return detail;
}
