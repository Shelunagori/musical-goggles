import type { DetectorBinding } from '@mg/pose-engine';
import { captureFrame } from './capture-frame';
import { PoseWorkerClient } from './worker-client';
import type { FrameAnalysis } from './protocol';

export type CameraState =
  'idle' | 'requesting' | 'loading_model' | 'calibrating' | 'analyzing' | 'stopped' | 'error';
export interface LiveMetrics {
  frames: number;
  elapsedMs: number;
  inferenceMs: number;
  detectorMs: number;
  skipped: number;
}
export const emptyLiveMetrics = (): LiveMetrics => ({
  frames: 0,
  elapsedMs: 0,
  inferenceMs: 0,
  detectorMs: 0,
  skipped: 0,
});
export const LIVE_INTERVAL_MS = 100;
export const CALIBRATION_TIMEOUT_MS = 30_000;
// Bound the existing engine's event history without changing detector semantics.
export const MAX_LIVE_MS = 10 * 60_000;

export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied. Allow camera access in your browser and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera available. Connect a camera and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is unavailable or already in use. Close other camera apps and try again.';
    case 'OverconstrainedError':
      return 'This camera cannot provide a supported video stream. Try another camera.';
    default:
      return error instanceof Error ? error.message : 'Camera analysis failed. Please retry.';
  }
}
interface Callbacks {
  onState(state: CameraState, message?: string): void;
  onFrame(frame: FrameAnalysis | null, metrics: LiveMetrics): void;
}
/** One session owns one stream, worker, cadence timer and bounded latest-frame state. */
export class LiveCameraSession {
  private controller = new AbortController();
  private stream?: MediaStream;
  private client?: PoseWorkerClient;
  private timer?: ReturnType<typeof setTimeout>;
  private staleTimer?: ReturnType<typeof setTimeout>;
  private cleanups: (() => void)[] = [];
  private started = false;
  private metrics = emptyLiveMetrics();
  constructor(
    private video: HTMLVideoElement,
    private callbacks: Callbacks,
  ) {}

  stop(message = 'Analysis stopped. Camera released.', state: CameraState = 'stopped') {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    clearTimeout(this.timer);
    clearTimeout(this.staleTimer);
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.client?.dispose();
    this.client = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.video.pause();
    this.video.srcObject = null;
    this.callbacks.onFrame(null, { ...this.metrics });
    this.callbacks.onState(state, message);
  }

  /** Release listeners and timers even when browser promises never settle. */
  private wait<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    const signal = this.controller.signal;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(new Error('Analysis stopped.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(message));
      }, timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      promise.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
      if (signal.aborted) abort();
    });
  }

  async start(bindings: DetectorBinding[]) {
    if (this.started || this.controller.signal.aborted) return;
    this.started = true;
    const signal = this.controller.signal;
    try {
      if (!bindings.length)
        throw new Error('No supported detector is available for this exercise.');
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Camera access requires HTTPS or localhost and a browser with camera support.',
        );
      if (document.hidden) throw new Error('Return to this tab before starting the camera.');
      this.callbacks.onState('requesting', 'Allow camera access to begin.');
      const hidden = () => {
        if (document.hidden)
          this.stop('Analysis stopped when the tab was hidden. Start again to recalibrate.');
      };
      const pagehide = () => this.stop();
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('pagehide', pagehide);
      this.cleanups.push(
        () => document.removeEventListener('visibilitychange', hidden),
        () => window.removeEventListener('pagehide', pagehide),
      );
      const media = navigator.mediaDevices
        .getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        })
        .then((stream) => {
          // Permission can resolve after Stop, timeout, navigation or a subsequent session.
          if (signal.aborted) stream.getTracks().forEach((track) => track.stop());
          else this.stream = stream;
          return stream;
        });
      await this.wait(media, 60_000, 'Camera permission request timed out. Please try again.');
      if (signal.aborted) return;
      const stream = this.stream;
      if (!stream?.getVideoTracks().length)
        throw new Error('No camera available. Connect a camera and try again.');
      for (const track of stream.getVideoTracks()) {
        const ended = () =>
          this.stop('Camera stream ended. Reconnect the camera and start again.', 'error');
        const muted = () =>
          this.stop('Camera stream was interrupted. Check the device and start again.', 'error');
        track.addEventListener('ended', ended);
        track.addEventListener('mute', muted);
        this.cleanups.push(
          () => track.removeEventListener('ended', ended),
          () => track.removeEventListener('mute', muted),
        );
        if (track.readyState === 'ended')
          throw new Error('Camera stream ended. Reconnect the camera and start again.');
      }
      this.video.srcObject = stream;
      await this.wait(this.video.play(), 10_000, 'Camera preview did not start. Please try again.');
      if (signal.aborted) return;
      this.callbacks.onState(
        'loading_model',
        'Loading MediaPipe; first use needs a model download.',
      );
      this.client = new PoseWorkerClient();
      await this.client.init(bindings);
      if (signal.aborted) return;
      const needsCalibration = bindings.some(
        (binding) => binding.detector.rule === 'shoulder_elevation',
      );
      this.callbacks.onState(needsCalibration ? 'calibrating' : 'analyzing');
      const start = performance.now();
      let next = start;
      let lastVideoTime = -1;
      let lastFrameAt = start;
      const tick = async () => {
        if (signal.aborted) return;
        try {
          const now = performance.now();
          if (now - start >= MAX_LIVE_MS) {
            this.stop('Ten-minute session complete. Start again for a fresh session.');
            return;
          }
          if (
            this.video.readyState < 2 ||
            !this.video.videoWidth ||
            this.video.currentTime === lastVideoTime
          ) {
            this.metrics.skipped++;
            if (now - lastFrameAt > 5_000)
              throw new Error('Camera frames stopped arriving. Check the camera and start again.');
          } else {
            lastVideoTime = this.video.currentTime;
            const bitmap = await captureFrame(this.video);
            if (signal.aborted) {
              bitmap.close();
              return;
            }
            const client = this.client;
            if (!client) {
              bitmap.close();
              return;
            }
            const frame = await client.frame(bitmap, now - start);
            if (signal.aborted) return;
            lastFrameAt = performance.now();
            this.metrics.frames++;
            this.metrics.elapsedMs = lastFrameAt - start;
            this.metrics.inferenceMs += frame.inferenceMs;
            this.metrics.detectorMs += frame.detectorMs;
            if (needsCalibration && !frame.calibrated && now - start >= CALIBRATION_TIMEOUT_MS)
              throw new Error(
                'Shoulder calibration timed out. Face the camera with ears and shoulders visible, relax and hold still for 1.5 seconds, then restart.',
              );
            this.callbacks.onState(
              needsCalibration && !frame.calibrated ? 'calibrating' : 'analyzing',
            );
            this.callbacks.onFrame(frame, { ...this.metrics });
            clearTimeout(this.staleTimer);
            this.staleTimer = setTimeout(
              () => this.callbacks.onFrame(null, { ...this.metrics }),
              350,
            );
          }
          next += LIVE_INTERVAL_MS;
          const late = Math.max(0, Math.floor((performance.now() - next) / LIVE_INTERVAL_MS) + 1);
          next += late * LIVE_INTERVAL_MS;
          this.metrics.skipped += late;
          this.timer = setTimeout(() => void tick(), Math.max(0, next - performance.now()));
        } catch (error) {
          if (!signal.aborted) this.stop(cameraError(error), 'error');
        }
      };
      await tick();
    } catch (error) {
      if (!signal.aborted) this.stop(cameraError(error), 'error');
    }
  }
}
