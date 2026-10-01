import type { DetectorBinding } from '@mg/pose-engine';
import type { WorkerRequest, WorkerResponse } from './protocol';
/** Exactly one in-flight frame. Terminating this worker releases model and bitmap memory. */
export class PoseWorkerClient {
  private worker: Worker;
  private pending?: {
    resolve(value: WorkerResponse): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor() {
    this.worker = new Worker(new URL('./pose.worker.ts', import.meta.url));
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending;
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending = undefined;
      if (event.data.type === 'error') pending.reject(new Error(event.data.message));
      else pending.resolve(event.data);
    };
    this.worker.onerror = () =>
      this.dispose(
        new Error(
          'MediaPipe worker failed. Try a browser with WebAssembly and OffscreenCanvas support.',
        ),
      );
  }
  private request(
    message: WorkerRequest,
    transfer: Transferable[] = [],
    timeout = 20_000,
  ): Promise<WorkerResponse> {
    if (this.pending) throw new Error('A frame is already being analyzed.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.dispose(new Error('Pose model or frame processing timed out. Please retry.')),
        timeout,
      );
      this.pending = { resolve, reject, timer };
      this.worker.postMessage(message, transfer);
    });
  }
  async init(bindings: DetectorBinding[]) {
    await this.request({ type: 'init', bindings }, [], 90_000);
  }
  async frame(bitmap: ImageBitmap, timestampMs: number) {
    const response = await this.request({ type: 'frame', bitmap, timestampMs }, [bitmap]);
    if (response.type !== 'frame') throw new Error('Invalid pose worker response.');
    return response.data;
  }
  async finish(cancelled = false) {
    const response = await this.request({ type: 'finish', cancelled });
    return response.type === 'finished' ? response.events : [];
  }
  dispose(error = new Error('Analysis cancelled.')) {
    this.worker.terminate();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = undefined;
    }
  }
}
