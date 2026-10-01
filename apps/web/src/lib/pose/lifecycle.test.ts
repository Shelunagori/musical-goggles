import { afterEach, expect, it, vi } from 'vitest';
import { seekVideo } from './video-analysis';
import { PoseWorkerClient } from './worker-client';
import { drawOverlay } from './overlay';
import type { WorkerResponse } from './protocol';
class Video extends EventTarget {
  currentTime = 0;
  readyState = 4;
  seeking = false;
}
class WorkerBoundary {
  static latest: WorkerBoundary;
  onmessage?: (event: { data: WorkerResponse }) => void;
  onerror?: () => void;
  messages: unknown[] = [];
  terminated = false;
  constructor() {
    WorkerBoundary.latest = this;
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('waits for a decoded seek and does not mistake an in-progress seek for a ready frame', async () => {
  const video = new Video();
  video.seeking = true;
  let resolved = false;
  const done = seekVideo(
    video as unknown as HTMLVideoElement,
    0,
    new AbortController().signal,
  ).then(() => {
    resolved = true;
  });
  await Promise.resolve();
  expect(resolved).toBe(false);
  video.dispatchEvent(new Event('seeked'));
  await done;
  expect(resolved).toBe(true);
});
it('cancels seeks and rejects decode errors', async () => {
  const video = new Video();
  const controller = new AbortController();
  const pending = seekVideo(video as unknown as HTMLVideoElement, 1, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  const failed = seekVideo(video as unknown as HTMLVideoElement, 2, new AbortController().signal);
  video.dispatchEvent(new Event('error'));
  await expect(failed).rejects.toThrow('decoded');
});
it('terminates worker and rejects pending initialization on cancellation', async () => {
  vi.stubGlobal('Worker', WorkerBoundary);
  const client = new PoseWorkerClient();
  const pending = client.init([]);
  client.dispose();
  await expect(pending).rejects.toThrow('cancelled');
  expect(WorkerBoundary.latest.terminated).toBe(true);
});
it('surfaces model and worker failures', async () => {
  vi.stubGlobal('Worker', WorkerBoundary);
  const client = new PoseWorkerClient();
  const pending = client.init([]);
  WorkerBoundary.latest.onmessage?.({ data: { type: 'error', message: 'model unavailable' } });
  await expect(pending).rejects.toThrow('model unavailable');
  client.dispose();
  const other = new PoseWorkerClient();
  const otherPending = other.init([]);
  WorkerBoundary.latest.onerror?.();
  await expect(otherPending).rejects.toThrow('worker failed');
});
it('bounds model loading time and releases the worker', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', WorkerBoundary);
  const client = new PoseWorkerClient();
  const pending = client.init([]);
  const rejected = expect(pending).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(90_000);
  await rejected;
  expect(WorkerBoundary.latest.terminated).toBe(true);
});
it('scales overlay coordinates to the actual video raster and excludes hidden landmarks', () => {
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.25, y: 0.5, z: 0, visibility: 0 }));
  landmarks[11]!.visibility = 1;
  drawOverlay(canvas as unknown as HTMLCanvasElement, landmarks, 1920, 1080);
  expect(canvas.width).toBe(1920);
  expect(canvas.height).toBe(1080);
  expect(ctx.arc).toHaveBeenCalledExactlyOnceWith(480, 540, expect.any(Number), 0, Math.PI * 2);
  expect(ctx.lineTo).not.toHaveBeenCalled();
});
