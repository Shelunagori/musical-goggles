import type { DetectorBinding, DetectionEvent } from '@mg/pose-engine';
import { PoseWorkerClient } from './worker-client';
import { captureFrame } from './capture-frame';
import type { FrameAnalysis } from './protocol';
export const SAMPLE_INTERVAL_MS = 100;
export const MAX_VIDEO_SECONDS = 300;
export function sampleTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS)
    throw new Error('Choose a playable video up to 5 minutes long.');
  return Array.from(
    { length: Math.ceil((duration * 1000) / SAMPLE_INTERVAL_MS) },
    (_, i) => i * SAMPLE_INTERVAL_MS,
  );
}
/** Wait for the seek to decode, not merely for currentTime to be assigned. */
export function seekVideo(
  video: HTMLVideoElement,
  seconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('Video could not be decoded. Try an MP4 (H.264) or WebM video.'));
    };
    const abort = () => {
      cleanup();
      reject(new Error('Analysis cancelled.'));
    };
    const timer = setTimeout(fail, 10_000);
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    if (!video.seeking && Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) {
      done();
      return;
    }
    video.currentTime = seconds;
  });
}
export interface AnalysisSummary {
  analyzedFrames: number;
  elapsedMs: number;
  inferenceMs: number;
  detectorMs: number;
  measurableFrames: number;
  noPersonFrames: number;
}
export async function analyzeVideo(
  video: HTMLVideoElement,
  bindings: DetectorBinding[],
  signal: AbortSignal,
  onFrame: (frame: FrameAnalysis, progress: number, metrics: AnalysisSummary) => void,
): Promise<{ events: DetectionEvent[]; metrics: AnalysisSummary }> {
  if (!bindings.length) throw new Error('No supported detector is available for this exercise.');
  const times = sampleTimes(video.duration);
  const client = new PoseWorkerClient();
  const abort = () => client.dispose();
  signal.addEventListener('abort', abort, { once: true });
  const metrics: AnalysisSummary = {
    analyzedFrames: 0,
    elapsedMs: 0,
    inferenceMs: 0,
    detectorMs: 0,
    measurableFrames: 0,
    noPersonFrames: 0,
  };
  try {
    if (signal.aborted) throw new Error('Analysis cancelled.');
    await client.init(bindings);
    const start = performance.now();
    video.pause();
    for (const time of times) {
      await seekVideo(video, time / 1000, signal);
      if (signal.aborted) throw new Error('Analysis cancelled.');
      const bitmap = await captureFrame(video);
      if (signal.aborted) {
        bitmap.close();
        throw new Error('Analysis cancelled.');
      }
      const frame = await client.frame(bitmap, time);
      metrics.analyzedFrames++;
      metrics.inferenceMs += frame.inferenceMs;
      metrics.detectorMs += frame.detectorMs;
      metrics.elapsedMs = performance.now() - start;
      if (frame.evaluations.some((e) => e.status === 'ok' || e.status === 'violation'))
        metrics.measurableFrames++;
      if (frame.poseStatus === 'no_person') metrics.noPersonFrames++;
      onFrame(frame, metrics.analyzedFrames / times.length, { ...metrics });
    }
    return { events: await client.finish(), metrics };
  } finally {
    signal.removeEventListener('abort', abort);
    client.dispose();
  }
}
