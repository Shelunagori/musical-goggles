import type { DetectorBinding, Landmark } from '@mg/pose-engine';
import type { PosePipeline } from '@mg/pose-engine';
export type FrameAnalysis = ReturnType<PosePipeline['process']> & {
  timestampMs: number;
  landmarks: Landmark[];
  inferenceMs: number;
  detectorMs: number;
  poseStatus: 'visible' | 'no_person' | 'multiple_people';
};
export type WorkerRequest =
  | { type: 'init'; bindings: DetectorBinding[] }
  | { type: 'frame'; bitmap: ImageBitmap; timestampMs: number }
  | { type: 'finish'; cancelled: boolean };
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'frame'; data: FrameAnalysis }
  | { type: 'finished'; events: ReturnType<PosePipeline['events']> }
  | { type: 'error'; message: string };
