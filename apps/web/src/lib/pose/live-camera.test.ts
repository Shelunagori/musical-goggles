import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LM, PosePipeline, type DetectorBinding } from '@mg/pose-engine';
import type { ExerciseDto } from '@mg/shared';
import { frontalPose } from '../../../../../packages/pose-engine/src/fixtures.test-support';
import { LiveCameraSession, cameraError, CALIBRATION_TIMEOUT_MS, MAX_LIVE_MS } from './live-camera';
import type { LiveMetrics } from './live-camera';
import { liveCorrections, liveSignal } from './live-view';
import type { WorkerRequest, WorkerResponse, FrameAnalysis } from './protocol';

const knees: DetectorBinding[] = [
  {
    correctionId: 'db-knee-id',
    detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05, min_duration_ms: 300 },
  },
];
const shoulders: DetectorBinding[] = [
  {
    correctionId: 'db-shoulder-id',
    detector: { type: 'geometric', rule: 'shoulder_elevation', threshold: 0.08 },
  },
];
class Track extends EventTarget {
  readyState = 'live';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}
class Video {
  srcObject: unknown = null;
  readyState = 4;
  videoWidth = 1280;
  videoHeight = 720;
  frozen = false;
  get currentTime() {
    return this.frozen ? 0 : performance.now() / 1000;
  }
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}
// Browser/MediaPipe boundary only: production client, adapter-independent pose engine and
// temporal rules remain real. These synthetic landmarks never constitute camera verification.
class WorkerBoundary {
  static instances: WorkerBoundary[] = [];
  static pose = frontalPose();
  static failInit = false;
  static stallFrame = false;
  onmessage?: (event: { data: WorkerResponse }) => void;
  onerror?: () => void;
  terminated = false;
  pipeline?: PosePipeline;
  frames = 0;
  constructor() {
    WorkerBoundary.instances.push(this);
  }
  postMessage(message: WorkerRequest) {
    if (message.type === 'init') {
      if (WorkerBoundary.failInit) {
        this.onmessage?.({ data: { type: 'error', message: 'Model unavailable.' } });
        return;
      }
      this.pipeline = new PosePipeline(message.bindings);
      this.onmessage?.({ data: { type: 'ready' } });
    }
    if (message.type === 'frame') {
      this.frames++;
      message.bitmap.close();
      if (WorkerBoundary.stallFrame) return;
      const result = this.pipeline!.process({
        timestampMs: message.timestampMs,
        landmarks: WorkerBoundary.pose,
      });
      this.onmessage?.({
        data: {
          type: 'frame',
          data: {
            ...result,
            timestampMs: message.timestampMs,
            landmarks: WorkerBoundary.pose,
            poseStatus: WorkerBoundary.pose.length ? 'visible' : 'no_person',
            inferenceMs: 15,
            detectorMs: 0.1,
          },
        },
      });
    }
  }
  terminate() {
    this.terminated = true;
  }
}
let tracks: Track[];
let getUserMedia: ReturnType<typeof vi.fn>;
let doc: EventTarget & { hidden: boolean };
let video: Video;
let onState = vi.fn<(state: string, message?: string) => void>();
let onFrame = vi.fn<(frame: FrameAnalysis | null, metrics: LiveMetrics) => void>();
let sessions: LiveCameraSession[];
function session() {
  const value = new LiveCameraSession(video as unknown as HTMLVideoElement, { onState, onFrame });
  sessions.push(value);
  return value;
}
const latestFrame = () => onFrame.mock.calls.at(-1)?.[0] as FrameAnalysis | null;
beforeEach(() => {
  vi.useFakeTimers();
  sessions = [];
  tracks = [];
  WorkerBoundary.instances = [];
  WorkerBoundary.pose = frontalPose();
  WorkerBoundary.failInit = false;
  WorkerBoundary.stallFrame = false;
  getUserMedia = vi.fn(async () => {
    const track = new Track();
    tracks.push(track);
    return { getTracks: () => [track], getVideoTracks: () => [track] };
  });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('Worker', WorkerBoundary);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn() })),
  );
  video = new Video();
  onState = vi.fn();
  onFrame = vi.fn();
});
afterEach(() => {
  sessions.forEach((value) => value.stop());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('starts through permission/model states at 10 Hz, skips knee calibration and stops all resources', async () => {
  const live = session();
  await live.start(knees);
  expect(onState.mock.calls.map((call) => call[0])).toEqual([
    'requesting',
    'loading_model',
    'analyzing',
    'analyzing',
  ]);
  expect(getUserMedia.mock.calls[0]![0]).toMatchObject({ audio: false });
  await vi.advanceTimersByTimeAsync(1000);
  expect(WorkerBoundary.instances[0]!.frames).toBe(11);
  expect(createImageBitmap).toHaveBeenCalledWith(video, { resizeWidth: 960, resizeHeight: 540 });
  live.stop();
  expect(tracks[0]!.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(latestFrame()).toBeNull();
  expect(WorkerBoundary.instances.every((worker) => worker.terminated)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const calls = onState.mock.calls.length;
  tracks[0]!.dispatchEvent(new Event('ended'));
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  expect(onState).toHaveBeenCalledTimes(calls);
});
it('guards double starts and releases each model before repeated new sessions', async () => {
  for (let i = 0; i < 4; i++) {
    const live = session();
    await live.start(knees);
    await live.start(knees);
    expect(WorkerBoundary.instances.filter((worker) => !worker.terminated)).toHaveLength(1);
    live.stop();
    live.stop();
    expect(vi.getTimerCount()).toBe(0);
  }
  expect(getUserMedia).toHaveBeenCalledTimes(4);
  expect(tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
});
it('stops a late permission stream without affecting a newer session', async () => {
  let grant!: (value: unknown) => void;
  getUserMedia.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const old = session();
  const pending = old.start(knees);
  old.stop();
  const fresh = session();
  await fresh.start(knees);
  const late = new Track();
  grant({ getTracks: () => [late], getVideoTracks: () => [late] });
  await pending;
  expect(late.stop).toHaveBeenCalledOnce();
  expect(tracks[0]!.stop).not.toHaveBeenCalled();
  expect(WorkerBoundary.instances).toHaveLength(1);
});
it('cancels during bitmap creation and closes the untransferred frame', async () => {
  let ready!: (value: unknown) => void;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        }),
    ),
  );
  const live = session();
  const pending = live.start(knees);
  await vi.advanceTimersByTimeAsync(0);
  live.stop();
  const close = vi.fn();
  ready({ close });
  await pending;
  expect(close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('uses the real temporal pipeline and resolves two sides to one DB correction card without duplicate alerts', async () => {
  WorkerBoundary.pose[LM.LEFT_KNEE]!.x -= 0.03;
  WorkerBoundary.pose[LM.RIGHT_KNEE]!.x += 0.03;
  const exercise = {
    corrections: [{ id: 'db-knee-id', cuePhrase: 'Database cue' }, { id: 'other' }],
  } as ExerciseDto;
  const live = session();
  await live.start(knees);
  expect(liveCorrections(exercise, latestFrame())).toEqual([]);
  await vi.advanceTimersByTimeAsync(300);
  const first = latestFrame()!;
  expect(first.events).toHaveLength(2);
  expect(liveCorrections(exercise, first)).toEqual([exercise.corrections[0]]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(latestFrame()!.events.map((event) => event.id)).toEqual(
    first.events.map((event) => event.id),
  );
  WorkerBoundary.pose = frontalPose();
  await vi.advanceTimersByTimeAsync(300);
  expect(liveCorrections(exercise, latestFrame())).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(200);
  expect(liveCorrections(exercise, latestFrame())).toEqual([]);
});
it('reuses stable shoulder calibration and resets it on restart', async () => {
  const live = session();
  await live.start(shoulders);
  expect(onState).toHaveBeenLastCalledWith('calibrating');
  await vi.advanceTimersByTimeAsync(1400);
  expect(latestFrame()!.calibrated).toBe(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(latestFrame()!.calibrated).toBe(true);
  expect(onState).toHaveBeenLastCalledWith('analyzing');
  live.stop();
  await session().start(shoulders);
  expect(latestFrame()!.calibrated).toBe(false);
});
it('reports a calibration timeout and releases the camera', async () => {
  WorkerBoundary.pose = [];
  await session().start(shoulders);
  await vi.advanceTimersByTimeAsync(CALIBRATION_TIMEOUT_MS);
  expect(onState).toHaveBeenLastCalledWith(
    'error',
    expect.stringContaining('calibration timed out'),
  );
  expect(tracks[0]!.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['ended', 'mute'])(
  'handles a camera %s event and removes device listeners',
  async (event) => {
    await session().start(knees);
    tracks[0]!.dispatchEvent(new Event(event));
    expect(onState).toHaveBeenLastCalledWith('error', expect.stringContaining('Camera stream'));
    expect(vi.getTimerCount()).toBe(0);
  },
);
it('stops on tab hiding and page exit', async () => {
  await session().start(knees);
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  expect(onState).toHaveBeenLastCalledWith('stopped', expect.stringContaining('hidden'));
  doc.hidden = false;
  await session().start(knees);
  window.dispatchEvent(new Event('pagehide'));
  expect(tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
});
it('clears stale cards before reporting a frozen camera', async () => {
  await session().start(knees);
  video.frozen = true;
  await vi.advanceTimersByTimeAsync(400);
  expect(latestFrame()).toBeNull();
  await vi.advanceTimersByTimeAsync(5000);
  expect(onState).toHaveBeenLastCalledWith('error', expect.stringContaining('frames stopped'));
  expect(vi.getTimerCount()).toBe(0);
});
it('never queues frames while inference is pending and releases a failed worker', async () => {
  const live = session();
  await live.start(knees);
  WorkerBoundary.stallFrame = true;
  await vi.advanceTimersByTimeAsync(1000);
  expect(WorkerBoundary.instances[0]!.frames).toBe(2);
  expect(latestFrame()).toBeNull();
  WorkerBoundary.instances[0]!.onerror?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(onState).toHaveBeenLastCalledWith('error', expect.stringContaining('worker failed'));
  expect(tracks[0]!.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('releases camera on model failure and refuses unavailable detectors', async () => {
  WorkerBoundary.failInit = true;
  await session().start(knees);
  expect(onState).toHaveBeenLastCalledWith('error', 'Model unavailable.');
  expect(tracks[0]!.stop).toHaveBeenCalledOnce();
  await session().start([]);
  expect(onState).toHaveBeenLastCalledWith(
    'error',
    expect.stringContaining('No supported detector'),
  );
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds permission waiting and releases a stream granted after timeout', async () => {
  let grant!: (value: unknown) => void;
  getUserMedia.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const pending = session().start(knees);
  await vi.advanceTimersByTimeAsync(60_000);
  await pending;
  expect(onState).toHaveBeenLastCalledWith(
    'error',
    expect.stringContaining('permission request timed out'),
  );
  const late = new Track();
  grant({ getTracks: () => [late] });
  await vi.advanceTimersByTimeAsync(0);
  expect(late.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds live sessions and event-history memory', async () => {
  await session().start(knees);
  await vi.advanceTimersByTimeAsync(MAX_LIVE_MS);
  expect(onState).toHaveBeenLastCalledWith('stopped', expect.stringContaining('Ten-minute'));
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  ['NotAllowedError', 'permission denied'],
  ['NotFoundError', 'No camera'],
  ['NotReadableError', 'already in use'],
  ['OverconstrainedError', 'supported video'],
])('maps %s at the browser boundary', async (name, text) => {
  getUserMedia.mockRejectedValueOnce(new DOMException('browser detail', name));
  await session().start(knees);
  expect(onState).toHaveBeenLastCalledWith('error', expect.stringContaining(text));
  expect(WorkerBoundary.instances).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('shows absent/low-confidence/unsupported poses honestly', async () => {
  WorkerBoundary.pose = [];
  await session().start(knees);
  expect(liveSignal(latestFrame())).toContain('No person');
  expect(liveSignal(null)).toContain('Waiting');
  expect(cameraError(null)).toContain('failed');
});
