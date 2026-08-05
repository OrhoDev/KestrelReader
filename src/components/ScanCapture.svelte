<script lang="ts">
  import { recognizeTextFromCanvas, loadImageToCanvas } from '../core/ocr';
  import { reportRuntimeError } from '../core/diagnostics';

  let {
    onComplete,
    onCancel,
    initialStream = null,
  } = $props<{
    onComplete: (text: string) => void;
    onCancel: () => void;
    initialStream?: MediaStream | null;
  }>();

  type Phase = 'camera' | 'processing';

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  let phase = $state<Phase>('camera');
  let progress = $state(0);
  let progressStatus = $state('Reading text…');
  let errorMessage = $state<string | null>(null);
  let useCamera = $state(true);
  let cameraReady = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let stageEl = $state<HTMLDivElement | null>(null);
  let frameEl = $state<HTMLDivElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let ownsStreamTracks = false;
  let cameraSession = 0;
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let dragOrigin: { x: number; y: number; panX: number; panY: number } | null = null;

  function detachVideo() {
    if (videoEl) videoEl.srcObject = null;
    cameraReady = false;
  }

  function releaseStream() {
    if (stream && ownsStreamTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }
    stream = null;
    ownsStreamTracks = false;
    detachVideo();
  }

  function clampPan() {
    if (!stageEl || zoom <= 1) {
      panX = 0;
      panY = 0;
      return;
    }
    const maxPanX = (stageEl.clientWidth * (zoom - 1)) / 2;
    const maxPanY = (stageEl.clientHeight * (zoom - 1)) / 2;
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  function zoomIn() {
    zoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
    clampPan();
  }

  function zoomOut() {
    zoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
    clampPan();
  }

  function onStagePointerDown(e: PointerEvent) {
    if (zoom <= 1 || e.button !== 0) return;
    dragOrigin = { x: e.clientX, y: e.clientY, panX, panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onStagePointerMove(e: PointerEvent) {
    if (!dragOrigin) return;
    panX = dragOrigin.panX + (e.clientX - dragOrigin.x);
    panY = dragOrigin.panY + (e.clientY - dragOrigin.y);
    clampPan();
  }

  function onStagePointerUp(e: PointerEvent) {
    if (!dragOrigin) return;
    dragOrigin = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (video.videoWidth > 0 && video.videoHeight > 0) return;
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
  }

  async function playVideo(video: HTMLVideoElement): Promise<void> {
    try {
      await video.play();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const message = err instanceof Error ? err.message : '';
      if (name === 'AbortError' || message.includes('interrupted')) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        await video.play();
        return;
      }
      throw err;
    }
  }

  async function bindCamera(video: HTMLVideoElement) {
    const session = ++cameraSession;
    errorMessage = null;
    cameraReady = false;

    let mediaStream = stream ?? initialStream;

    if (!mediaStream) {
      if (!navigator.mediaDevices?.getUserMedia) {
        useCamera = false;
        return;
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        ownsStreamTracks = true;
      } catch (err) {
        if (session !== cameraSession) return;
        await reportRuntimeError(err, 'ScanCapture.startCamera');
        useCamera = false;
        return;
      }
    } else {
      ownsStreamTracks = false;
    }

    if (session !== cameraSession) return;

    stream = mediaStream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;

    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
    }

    try {
      await playVideo(video);
      await waitForVideoFrame(video);
    } catch (err) {
      if (session !== cameraSession) return;
      await reportRuntimeError(err, 'ScanCapture.startCamera');
      useCamera = false;
      releaseStream();
      return;
    }

    if (session !== cameraSession) return;
    cameraReady = true;
    useCamera = true;
  }

  function videoRef(video: HTMLVideoElement) {
    videoEl = video;
    if (phase === 'camera') void bindCamera(video);

    return {
      destroy() {
        cameraSession++;
        detachVideo();
        videoEl = null;
      },
    };
  }

  $effect(() => {
    return () => releaseStream();
  });

  /** Map a point in stage coordinates to video source pixels (cover fit + pan/zoom). */
  function mapStagePointToVideo(
    x: number,
    y: number,
    video: HTMLVideoElement,
    container: HTMLElement,
  ): { x: number; y: number } {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const coverScale = Math.max(cw / vw, ch / vh);
    const dispW = vw * coverScale;
    const dispH = vh * coverScale;
    const baseOffsetX = (cw - dispW) / 2;
    const baseOffsetY = (ch - dispH) / 2;

    const cx = cw / 2;
    const cy = ch / 2;
    const localX = (x - cx - panX) / zoom + cx;
    const localY = (y - cy - panY) / zoom + cy;

    return {
      x: (localX - baseOffsetX) / coverScale,
      y: (localY - baseOffsetY) / coverScale,
    };
  }

  function captureFrame(): HTMLCanvasElement | null {
    if (!videoEl || !stageEl || !frameEl || !cameraReady || videoEl.videoWidth === 0) return null;

    const stageRect = stageEl.getBoundingClientRect();
    const frameRect = frameEl.getBoundingClientRect();
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    const x1 = frameRect.left - stageRect.left;
    const y1 = frameRect.top - stageRect.top;
    const x2 = x1 + frameRect.width;
    const y2 = y1 + frameRect.height;

    const corners = [
      mapStagePointToVideo(x1, y1, videoEl, stageEl),
      mapStagePointToVideo(x2, y1, videoEl, stageEl),
      mapStagePointToVideo(x2, y2, videoEl, stageEl),
      mapStagePointToVideo(x1, y2, videoEl, stageEl),
    ];

    let minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
    let minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
    let maxX = Math.min(vw, Math.ceil(Math.max(...corners.map((c) => c.x))));
    let maxY = Math.min(vh, Math.ceil(Math.max(...corners.map((c) => c.y))));

    const cropW = maxX - minX;
    const cropH = maxY - minY;
    if (cropW < 48 || cropH < 48) return null;

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return canvas;
  }

  async function processCanvas(canvas: HTMLCanvasElement) {
    phase = 'processing';
    progress = 0;
    progressStatus = 'Reading text…';
    errorMessage = null;
    detachVideo();

    try {
      const text = await recognizeTextFromCanvas(canvas, {
        onProgress: (p) => {
          progress = p.progress;
          progressStatus = p.status;
        },
      });

      if (!text.replace(/\s+/g, ' ').trim()) {
        errorMessage = 'No text found.';
        phase = 'camera';
        return;
      }

      releaseStream();
      onComplete(text);
    } catch (err) {
      await reportRuntimeError(err, 'ScanCapture.processCanvas');
      errorMessage = 'Could not read text.';
      phase = 'camera';
    }
  }

  async function handleCapture() {
    const canvas = captureFrame();
    if (!canvas) {
      errorMessage = 'Could not capture frame. Try again.';
      return;
    }
    await processCanvas(canvas);
  }

  async function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;

    try {
      releaseStream();
      const canvas = await loadImageToCanvas(file);
      await processCanvas(canvas);
    } catch (err) {
      await reportRuntimeError(err, 'ScanCapture.handleFileInput');
      errorMessage = 'Could not load image.';
      phase = 'camera';
    }
  }

  function handleClose() {
    releaseStream();
    onCancel();
  }
</script>

<div class="scan-overlay" role="dialog" aria-modal="true" aria-label="Scan text">
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
    </div>
  {:else}
    <button type="button" class="scan-close" onclick={handleClose} aria-label="Close">×</button>

    <div
      class="scan-stage"
      bind:this={stageEl}
      class:scan-stage-pannable={zoom > 1}
      role="group"
      aria-label="Camera preview"
      onpointerdown={onStagePointerDown}
      onpointermove={onStagePointerMove}
      onpointerup={onStagePointerUp}
      onpointercancel={onStagePointerUp}
    >
      {#if useCamera}
        <div class="scan-video-wrap">
          <video
            use:videoRef
            class="scan-video"
            style="transform: translate({panX}px, {panY}px) scale({zoom})"
            playsinline
            muted
          ></video>
        </div>
        <div class="scan-frame" bind:this={frameEl} aria-hidden="true"></div>
      {:else}
        <div class="scan-fallback">
          <p>{errorMessage ?? 'Camera unavailable.'}</p>
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

    {#if useCamera}
      <footer class="scan-footer">
        <label class="scan-side-btn" aria-label="Choose from gallery">
          <input type="file" accept="image/*" onchange={handleFileInput} hidden />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
          </svg>
        </label>

        <div class="scan-zoom-controls">
          <button
            type="button"
            class="scan-side-btn"
            onclick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >−</button>
          <button
            type="button"
            class="scan-side-btn"
            onclick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >+</button>
        </div>

        <button
          type="button"
          class="scan-capture-btn"
          onclick={handleCapture}
          aria-label="Capture"
          disabled={!cameraReady}
        >
          <span class="scan-capture-inner"></span>
        </button>
      </footer>
    {/if}
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

  .scan-close {
    position: absolute;
    top: max(0.65rem, env(safe-area-inset-top));
    left: 0.75rem;
    z-index: 4;
    width: 2.25rem;
    height: 2.25rem;
    border: none;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
  }

  .scan-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    background: #111;
    touch-action: none;
  }

  .scan-stage-pannable {
    cursor: grab;
  }

  .scan-stage-pannable:active {
    cursor: grabbing;
  }

  .scan-video-wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .scan-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #111;
    transform-origin: center center;
    will-change: transform;
  }

  .scan-frame {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, calc(100% - 1.25rem));
    height: min(74vh, calc(100% - 5rem));
    border: 2px solid var(--highlight-orp);
    border-radius: 6px;
    pointer-events: none;
    z-index: 2;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.42);
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
    font-size: 0.88rem;
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
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: rgba(180, 40, 40, 0.85);
    color: #fff;
    font-size: 0.8rem;
    text-align: center;
    z-index: 3;
  }

  .scan-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem 1rem max(1.25rem, env(safe-area-inset-bottom));
    background: rgba(0, 0, 0, 0.4);
    z-index: 3;
  }

  .scan-side-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
  }

  .scan-side-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .scan-zoom-controls {
    display: flex;
    gap: 0.35rem;
  }

  .scan-capture-btn {
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    border: 3px solid #fff;
    background: transparent;
    padding: 0.2rem;
    cursor: pointer;
    transition: transform 0.12s ease, opacity 0.12s ease;
  }

  .scan-capture-btn:disabled {
    opacity: 0.4;
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

  .scan-processing {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.85rem;
    padding: 2rem;
    text-align: center;
  }

  .scan-spinner {
    width: 2rem;
    height: 2rem;
    color: var(--highlight-orp);
    animation: scan-spin 1s linear infinite;
  }

  .scan-processing-label {
    margin: 0;
    font-size: 0.88rem;
    color: #f5f5f5;
  }

  .scan-progress-track {
    width: min(240px, 70vw);
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
  }

  .scan-progress-fill {
    height: 100%;
    background: var(--highlight-orp);
    transition: width 0.2s ease;
  }

  @keyframes scan-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
