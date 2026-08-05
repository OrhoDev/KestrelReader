<script lang="ts">
  import { recognizeTextFromCanvas, loadImageToCanvas } from '../core/ocr';
  import { reportRuntimeError } from '../core/diagnostics';

  let { onComplete, onCancel } = $props<{
    onComplete: (text: string) => void;
    onCancel: () => void;
  }>();

  type ScanMode = 'page' | 'line';
  type Phase = 'camera' | 'processing';

  let mode = $state<ScanMode>('page');
  let phase = $state<Phase>('camera');
  let progress = $state(0);
  let progressStatus = $state('Preparing…');
  let errorMessage = $state<string | null>(null);
  let useCamera = $state(true);
  let cameraReady = $state(false);
  let cameraStarting = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let sweeping = $state(false);
  let sweepText = $state('');
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
    cameraReady = false;
  }

  async function requestCameraStream(): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];

    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // try simpler constraints
      }
    }

    throw new Error('Could not access camera');
  }

  async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (video.videoWidth > 0 && video.videoHeight > 0) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Camera preview timed out')), 12000);
      const onReady = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onReady);
        resolve();
      };
      video.addEventListener('loadedmetadata', onReady);
    });
  }

  async function startCamera(video: HTMLVideoElement) {
    if (!navigator.mediaDevices?.getUserMedia) {
      useCamera = false;
      errorMessage = 'Camera not supported in this browser.';
      return;
    }

    cameraStarting = true;
    cameraReady = false;
    errorMessage = null;

    try {
      stopStream();
      const mediaStream = await requestCameraStream();
      stream = mediaStream;

      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.autoplay = true;
      video.srcObject = mediaStream;

      await video.play();
      await waitForVideoFrame(video);

      useCamera = true;
      cameraReady = true;
    } catch (err) {
      useCamera = false;
      cameraReady = false;
      stopStream();

      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission denied. Allow access in browser settings or pick a photo.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else {
        errorMessage = 'Could not start camera. Choose a photo instead.';
      }
    } finally {
      cameraStarting = false;
    }
  }

  $effect(() => {
    if (phase !== 'camera' || !videoEl) return;

    let cancelled = false;
    startCamera(videoEl).then(() => {
      if (cancelled) stopStream();
    });

    return () => {
      cancelled = true;
      stopStream();
    };
  });

  function captureFrameFromVideo(): HTMLCanvasElement | null {
    if (!videoEl || !cameraReady || videoEl.videoWidth === 0) return null;

    const canvas = document.createElement('canvas');
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    if (mode === 'line') {
      const bandHeight = Math.max(1, Math.round(vh * 0.18));
      const y = Math.round((vh - bandHeight) / 2);
      canvas.width = vw;
      canvas.height = bandHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoEl, 0, y, vw, bandHeight, 0, 0, vw, bandHeight);
    } else {
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoEl, 0, 0);
    }

    return canvas;
  }

  async function processCanvas(canvas: HTMLCanvasElement, alreadyLineCropped = false) {
    phase = 'processing';
    progress = 0;
    progressStatus = 'Preparing…';
    errorMessage = null;
    stopStream();

    try {
      const text = await recognizeTextFromCanvas(canvas, {
        lineMode: mode === 'line' && !alreadyLineCropped,
        onProgress: (p) => {
          progress = p.progress;
          progressStatus = p.status;
        },
      });

      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (!cleaned) {
        errorMessage = 'No text found. Try more light or hold steadier.';
        phase = 'camera';
        return;
      }

      onComplete(text);
    } catch (err) {
      await reportRuntimeError(err, 'ScanCapture.processCanvas');
      errorMessage = 'Could not read text. Try again.';
      phase = 'camera';
    }
  }

  function stitchTexts(existing: string, fragment: string): string {
    const a = existing.trim();
    const b = fragment.trim().replace(/\s+/g, ' ');
    if (!a) return b;
    if (!b) return a;
    for (let len = Math.min(30, a.length, b.length); len > 3; len--) {
      const slice = b.slice(0, len);
      if (a.endsWith(slice)) return a + b.slice(len);
    }
    return `${a} ${b}`;
  }

  async function sweepOcrFrame() {
    const canvas = captureFrameFromVideo();
    if (!canvas) return;
    try {
      const fragment = await recognizeTextFromCanvas(canvas, { lineMode: true });
      sweepText = stitchTexts(sweepText, fragment);
    } catch {
      // ignore intermittent OCR failures during sweep
    }
  }

  function startSweep() {
    if (mode !== 'line' || !cameraReady) return;
    sweeping = true;
    sweepText = '';
    sweepTimer = setInterval(() => void sweepOcrFrame(), 550);
  }

  async function endSweep() {
    if (!sweeping) return;
    sweeping = false;
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
    if (!sweepText.trim()) return;
    phase = 'processing';
    progressStatus = 'Finishing sweep…';
    stopStream();
    try {
      const cleaned = sweepText.replace(/\s+/g, ' ').trim();
      if (cleaned) onComplete(cleaned);
      else {
        errorMessage = 'No text captured during sweep.';
        phase = 'camera';
      }
    } catch (err) {
      await reportRuntimeError(err, 'ScanCapture.endSweep');
      errorMessage = 'Could not read swept text.';
      phase = 'camera';
    }
  }

  async function handleCapture() {
    const canvas = captureFrameFromVideo();
    if (!canvas) {
      errorMessage = cameraStarting
        ? 'Camera is still starting. Wait a moment.'
        : 'Camera not ready. Wait a moment or pick a photo.';
      return;
    }
    await processCanvas(canvas, mode === 'line');
  }

  async function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;

    try {
      stopStream();
      const canvas = await loadImageToCanvas(file);
      await processCanvas(canvas);
    } catch (err) {
      await reportRuntimeError(err, 'ScanCapture.handleFileInput');
      errorMessage = 'Could not load that image.';
      phase = 'camera';
    }
  }

  function setMode(next: ScanMode) {
    mode = next;
    errorMessage = null;
  }
</script>

<div class="scan-overlay" role="dialog" aria-modal="true" aria-label="Scan text">
  <header class="scan-header">
    <button class="btn-flat scan-close" onclick={onCancel} aria-label="Close scanner">Close</button>
    <div class="scan-mode-toggle">
      <button
        class="btn-option"
        class:is-active={mode === 'page'}
        onclick={() => setMode('page')}
      >
        Page
      </button>
      <button
        class="btn-option"
        class:is-active={mode === 'line'}
        onclick={() => setMode('line')}
      >
        Line
      </button>
    </div>
  </header>

  {#if phase === 'processing'}
    <div class="scan-processing">
      <svg class="scan-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="scan-processing-label">{progressStatus}</p>
      <div class="scan-progress-track">
        <div class="scan-progress-fill" style="width: {Math.round(progress * 100)}%"></div>
      </div>
      <p class="scan-processing-hint">OCR runs on your device. Nothing is uploaded.</p>
    </div>
  {:else}
  <div class="scan-stage">
    {#if useCamera}
      <video
        bind:this={videoEl}
        class="scan-video"
        playsinline
        muted
        autoplay
      ></video>

      {#if cameraStarting || !cameraReady}
        <div class="scan-camera-loading" aria-live="polite">
          <p>{cameraStarting ? 'Starting camera…' : 'Waiting for camera…'}</p>
        </div>
      {/if}

      {#if mode === 'line'}
        <div class="scan-line-guide" aria-hidden="true">
          <div class="scan-line-mask scan-line-mask-top"></div>
          <div class="scan-line-band">
            <span>Align one line here</span>
          </div>
          <div class="scan-line-mask scan-line-mask-bottom"></div>
        </div>
      {:else}
        <div class="scan-page-hint" aria-hidden="true">
          <span>Frame the page, then capture</span>
        </div>
      {/if}
    {:else}
      <div class="scan-fallback">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <p>{errorMessage ?? 'Camera unavailable. Choose a photo instead.'}</p>
        <label class="btn-primary scan-pick-btn">
          Choose photo
          <input type="file" accept="image/*" capture="environment" onchange={handleFileInput} hidden />
        </label>
      </div>
    {/if}

    {#if errorMessage && useCamera}
      <p class="scan-error">{errorMessage}</p>
    {/if}
  </div>

  <footer class="scan-footer">
    {#if useCamera}
      {#if mode === 'line'}
        <button
          type="button"
          class="btn-primary scan-sweep-btn"
          onpointerdown={(e) => { e.preventDefault(); startSweep(); }}
          onpointerup={() => void endSweep()}
          onpointerleave={() => void endSweep()}
          disabled={sweeping || !cameraReady}
        >
          {sweeping ? 'Sweeping…' : 'Hold & sweep along line'}
        </button>
      {/if}
      <button
        class="scan-capture-btn"
        onclick={handleCapture}
        aria-label="Capture and read text"
        disabled={!cameraReady || cameraStarting}
      >
        <span class="scan-capture-inner"></span>
      </button>
      <label class="btn-flat scan-gallery-btn">
        Gallery
        <input type="file" accept="image/*" onchange={handleFileInput} hidden />
      </label>
    {:else}
      <label class="btn-flat scan-gallery-btn">
        Gallery
        <input type="file" accept="image/*" onchange={handleFileInput} hidden />
      </label>
    {/if}
  </footer>
  {/if}
</div>

<style>
  .scan-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    color: #f5f5f5;
  }

  .scan-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: max(0.75rem, env(safe-area-inset-top)) 1rem 0.75rem;
    background: rgba(0, 0, 0, 0.55);
    z-index: 2;
  }

  .scan-close {
    color: #f5f5f5;
    border-color: rgba(255, 255, 255, 0.25);
  }

  .scan-mode-toggle {
    display: flex;
    gap: 0.35rem;
  }

  .scan-mode-toggle .btn-option {
    color: #f5f5f5;
    border-color: rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.06);
    padding: 0.35rem 0.85rem;
    font-size: 0.8rem;
  }

  .scan-mode-toggle .btn-option.is-active {
    border-color: var(--highlight-orp);
    color: var(--highlight-orp);
    background: rgba(217, 119, 36, 0.15);
  }

  .scan-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    background: #111;
  }

  .scan-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #111;
  }

  .scan-camera-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    z-index: 1;
    pointer-events: none;
  }

  .scan-camera-loading p {
    margin: 0;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.65);
    font-size: 0.82rem;
    color: #fff;
  }

  .scan-line-guide {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    pointer-events: none;
    z-index: 2;
  }

  .scan-line-mask {
    flex: 1;
    background: rgba(0, 0, 0, 0.45);
  }

  .scan-line-band {
    height: 18%;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--highlight-orp);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    background: transparent;
  }

  .scan-line-band span {
    font-size: 0.75rem;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .scan-page-hint {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.4rem 0.85rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 0.78rem;
    color: #fff;
    pointer-events: none;
    z-index: 2;
  }

  .scan-fallback {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    color: #ccc;
  }

  .scan-fallback p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .scan-pick-btn {
    cursor: pointer;
  }

  .scan-error {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    margin: 0;
    padding: 0.65rem 0.85rem;
    border-radius: 8px;
    background: rgba(180, 40, 40, 0.85);
    color: #fff;
    font-size: 0.82rem;
    text-align: center;
    z-index: 3;
  }

  .scan-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1rem max(1.25rem, env(safe-area-inset-bottom));
    background: rgba(0, 0, 0, 0.55);
    z-index: 2;
  }

  .scan-capture-btn {
    width: 4.25rem;
    height: 4.25rem;
    border-radius: 50%;
    border: 3px solid #fff;
    background: transparent;
    padding: 0.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.12s ease, opacity 0.12s ease;
  }

  .scan-capture-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .scan-capture-btn:active:not(:disabled) {
    transform: scale(0.94);
  }

  .scan-capture-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #fff;
    display: block;
  }

  .scan-gallery-btn {
    color: #f5f5f5;
    border-color: rgba(255, 255, 255, 0.25);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .scan-sweep-btn {
    width: min(320px, 90vw);
    padding: 0.65rem 1rem;
    font-size: 0.85rem;
    touch-action: none;
  }

  .scan-processing {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }

  .scan-spinner {
    width: 2.25rem;
    height: 2.25rem;
    color: var(--highlight-orp);
    animation: scan-spin 1s linear infinite;
  }

  .scan-processing-label {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #f5f5f5;
  }

  .scan-progress-track {
    width: min(280px, 80vw);
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
  }

  .scan-progress-fill {
    height: 100%;
    background: var(--highlight-orp);
    transition: width 0.2s ease;
  }

  .scan-processing-hint {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  @keyframes scan-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
