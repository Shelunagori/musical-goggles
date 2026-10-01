import { LM, type Landmark } from './landmarks';
/** Synthetic frontal pose; never used as production detections. */
export function frontalPose(): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.4, z: 0, visibility: 0.95 }));
  const set = (id: number, x: number, y: number) => {
    points[id] = { x, y, z: 0, visibility: 0.95 };
  };
  set(LM.LEFT_EAR, 0.64, 0.2);
  set(LM.RIGHT_EAR, 0.36, 0.2);
  set(LM.LEFT_SHOULDER, 0.65, 0.3);
  set(LM.RIGHT_SHOULDER, 0.35, 0.3);
  set(LM.LEFT_HIP, 0.6, 0.5);
  set(LM.RIGHT_HIP, 0.4, 0.5);
  set(LM.LEFT_KNEE, 0.6, 0.7);
  set(LM.RIGHT_KNEE, 0.4, 0.7);
  set(LM.LEFT_ANKLE, 0.6, 0.9);
  set(LM.RIGHT_ANKLE, 0.4, 0.9);
  return points;
}
