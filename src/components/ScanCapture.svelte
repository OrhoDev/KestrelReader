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
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.25;

  let phase = $state<Phase>('camera');
  let progress = $state(0);
  let progressStatus = $state('Reading text…');
  let errorMessage = $state<string | null>(null);
  let useCamera = $state(true);
  let cameraReady = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let viewportEl = $state<HTMLDivElement | null>(null);
  let frameEl = $state<HTMLDivElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let ownsStreamTracks = false;
  let cameraSession = 0;
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  function clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function clampPan() {
    if (zoom <= 1) {
      panX = 0;
      panY = 0;
      return;
    }
    const maxPan = (zoom - 1) * 120;
    panX = Math.min(maxPan, Math.max(-maxPan, panX));
    panY = Math.min(maxPan, Math.max(-maxPan, panY));
  }

  function zoomIn() {
    zoom = clampZoom(zoom + ZOOM_STEP);
    clampPan();
  }

  function zoomOut() {
    zoom = clampZoom(zoom - ZOOM_STEP);
    clampPan();
  }

  function touchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function onViewportTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      pinchStartDistance = touchDistance(e.touches);
      pinchStartZoom = zoom;
    }
  }

  function onViewportTouchMove(e: TouchEvent) {
    if (e.touches.length !== 2 || pinchStartDistance === 0) return;
    e.preventDefault();
    const scale = touchDistance(e.touches) / pinchStartDistance;
    zoom = clampZoom(pinchStartZoom * scale);
    clampPan();
  }

  function onViewportTouchEnd() {
    pinchStartDistance = 0;
  }

  function onViewportPointerDown(e: PointerEvent) {
    if (zoom <= 1 || e.pointerType === 'touch') return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = panX;
    panOriginY = panY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onViewportPointerMove(e: PointerEvent) {
    if (!isPanning) return;
    panX = panOriginX + (e.clientX - panStartX);
    panY = panOriginY + (e.clientY - panStartY);
    clampPan();
  }

  function onViewportPointerUp(e: PointerEvent) {
    if (!isPanning) return;
    isPanning = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

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

  function mapPointToVideo(sx: number, sy: number): { x: number; y: number } {
    if (!videoEl || !viewportEl) return { x: 0, y: 0 };

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const vp = viewportEl.getBoundingClientRect();
    const W = vp.width;
    const H = vp.height;
    const coverScale = Math.max(W / vw, H / vh);
    const baseOffsetX = (W - vw * coverScale) / 2;
    const baseOffsetY = (H - vh * coverScale) / 2;
    const cx = W / 2;
    const cy = H / 2;
    const lx = sx - vp.left;
    const ly = sy - vp.top;
    const localX = cx + (lx - cx - panX) / zoom;
    const localY = cy + (ly - cy - panY) / zoom;

    return {
      x: (localX - baseOffsetX) / coverScale,
      y: (localY - baseOffsetY) / coverScale,
    };
  }

  function captureFrame(): HTMLCanvasElement | null {
    if (!videoEl || !frameEl || !viewportEl || !cameraReady || videoEl.videoWidth === 0) return null;

    const fr = frameEl.getBoundingClientRect();
    const corners = [
      mapPointToVideo(fr.left, fr.top),
      mapPointToVideo(fr.right, fr.top),
      mapPointToVideo(fr.left, fr.bottom),
      mapPointToVideo(fr.right, fr.bottom),
    ];

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const x1 = Math.max(0, Math.min(...corners.map((p) => p.x)));
    const y1 = Math.max(0, Math.min(...corners.map((p) => p.y)));
    const x2 = Math.min(vw, Math.max(...corners.map((p) => p.x)));
    const y2 = Math.min(vh, Math.max(...corners.map((p) => p.y)));
    const sw = Math.floor(x2 - x1);
    const sh = Math.floor(y2 - y1);

    if (sw < 12 || sh < 12) return null;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, Math.floor(x1), Math.floor(y1), sw, sh, 0, 0, sw, sh);
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
        errorMessage = 'No text found in frame.';
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
      errorMessage = 'Could not capture frame.';
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

    <div class="scan-stage">
      {#if useCamera}
        <div
          class="scan-viewport"
          class:is-pannable={zoom > 1}
          bind:this={viewportEl}
          role="application"
          aria-label="Camera preview. Pinch to zoom."
          ontouchstart={onViewportTouchStart}
          ontouchmove={onViewportTouchMove}
          ontouchend={onViewportTouchEnd}
          ontouchcancel={onViewportTouchEnd}
          onpointerdown={onViewportPointerDown}
          onpointermove={onViewportPointerMove}
          onpointerup={onViewportPointerUp}
          onpointercancel={onViewportPointerUp}
        >
          <div
            class="scan-video-wrap"
            style="transform: translate({panX}px, {panY}px) scale({zoom})"
          >
            <video use:videoRef class="scan-video" playsinline muted></video>
          </div>

          <div class="scan-frame-overlay" aria-hidden="true">
            <div class="scan-frame-mask scan-frame-mask-top"></div>
            <div class="scan-frame-row">
              <div class="scan-frame-mask scan-frame-mask-side"></div>
              <div class="scan-frame-window" bind:this={frameEl}>
                <span class="scan-frame-corner scan-frame-corner-tl"></span>
                <span class="scan-frame-corner scan-frame-corner-tr"></span>
                <span class="scan-frame-corner scan-frame-corner-bl"></span>
                <span class="scan-frame-corner scan-frame-corner-br"></span>
              </div>
              <div class="scan-frame-mask scan-frame-mask-side"></div>
            </div>
            <div class="scan-frame-mask scan-frame-mask-bottom"></div>
          </div>
        </div>

        <div class="scan-zoom-controls">
          <button type="button" class="scan-zoom-btn" onclick={zoomIn} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM}>+</button>
          <button type="button" class="scan-zoom-btn" onclick={zoomOut} aria-label="Zoom out" disabled={zoom <= MIN_ZOOM}>−</button>
        </div>
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
        <label class="scan-gallery-btn" aria-label="Choose from gallery">
          <input type="file" accept="image/*" onchange={handleFileInput} hidden />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
          </svg>
        </label>
        <button
          type="button"
          class="scan-capture-btn"
          onclick={handleCapture}
          aria-label="Capture framed text"
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
  }

  .scan-viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
  }

  .scan-viewport.is-pannable {
    cursor: grab;
  }

  .scan-viewport.is-pannable:active {
    cursor: grabbing;
  }

  .scan-video-wrap {
    width: 100%;
    height: 100%;
    transform-origin: center center;
    will-change: transform;
  }

  .scan-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #111;
  }

  .scan-frame-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    pointer-events: none;
    z-index: 2;
  }

  .scan-frame-mask {
    background: rgba(0, 0, 0, 0.42);
  }

  .scan-frame-mask-top {
    flex: 0.9;
  }

  .scan-frame-mask-bottom {
    flex: 1.1;
  }

  .scan-frame-row {
    display: flex;
    height: 46%;
    min-height: 8rem;
    max-height: 70%;
  }

  .scan-frame-mask-side {
    flex: 0.06;
  }

  .scan-frame-window {
    flex: 1;
    position: relative;
    border: 2px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  }

  .scan-frame-corner {
    position: absolute;
    width: 1.1rem;
    height: 1.1rem;
    border-color: var(--highlight-orp);
    border-style: solid;
  }

  .scan-frame-corner-tl {
    top: -2px;
    left: -2px;
    border-width: 3px 0 0 3px;
  }

  .scan-frame-corner-tr {
    top: -2px;
    right: -2px;
    border-width: 3px 3px 0 0;
  }

  .scan-frame-corner-bl {
    bottom: -2px;
    left: -2px;
    border-width: 0 0 3px 3px;
  }

  .scan-frame-corner-br {
    bottom: -2px;
    right: -2px;
    border-width: 0 3px 3px 0;
  }

  .scan-zoom-controls {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .scan-zoom-btn {
    width: 2.35rem;
    height: 2.35rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
  }

  .scan-zoom-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
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
    z-index: 4;
  }

  .scan-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 1rem 1rem max(1.25rem, env(safe-area-inset-bottom));
    background: rgba(0, 0, 0, 0.4);
    z-index: 2;
  }

  .scan-gallery-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;
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
