import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { adaptLandmarks, PosePipeline } from '@mg/pose-engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(data: WorkerResponse): void;
};
let landmarker: PoseLandmarker | undefined;
let pipeline: PosePipeline | undefined;
const respond = (data: WorkerResponse) => scope.postMessage(data);
scope.onmessage = (event) => {
  void handle(event.data);
};
async function handle(message: WorkerRequest) {
  try {
    if (message.type === 'init') {
      pipeline = new PosePipeline(message.bindings);
      const files = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
      );
      landmarker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      respond({ type: 'ready' });
    } else if (message.type === 'frame') {
      try {
        if (!landmarker || !pipeline) throw new Error('Pose model is not ready.');
        const start = performance.now();
        const result = landmarker.detectForVideo(message.bitmap, message.timestampMs);
        const inferenceMs = performance.now() - start;
        const landmarks = result.landmarks.length === 1 ? (result.landmarks[0] ?? []) : [];
        const poseStatus =
          result.landmarks.length > 1
            ? 'multiple_people'
            : landmarks.length
              ? 'visible'
              : 'no_person';
        const detectorStart = performance.now();
        const analysis = pipeline.process({
          timestampMs: message.timestampMs,
          landmarks: adaptLandmarks(landmarks, message.bitmap.width, message.bitmap.height),
        });
        result.close();
        respond({
          type: 'frame',
          data: {
            ...analysis,
            timestampMs: message.timestampMs,
            landmarks,
            inferenceMs,
            detectorMs: performance.now() - detectorStart,
            poseStatus,
          },
        });
      } finally {
        message.bitmap.close();
      }
    } else {
      const events = pipeline?.finish(message.cancelled ? 'cancelled' : 'ended') ?? [];
      landmarker?.close();
      landmarker = undefined;
      respond({ type: 'finished', events });
    }
  } catch {
    landmarker?.close();
    landmarker = undefined;
    respond({
      type: 'error',
      message:
        message.type === 'init'
          ? 'MediaPipe or its pose model could not load. Check model-download access and WebAssembly support, then retry.'
          : 'Pose analysis failed on this frame. Try another video or browser.',
    });
  }
}
