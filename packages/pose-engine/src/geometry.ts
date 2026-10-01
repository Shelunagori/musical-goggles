import { LM, type Landmark } from './landmarks';

export interface Point2 {
  x: number;
  y: number;
}

export function distance2d(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point2, b: Point2): Point2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Interior angle ABC in degrees, in [0, 180]. Returns null for degenerate input. */
export function angleDeg(a: Point2, b: Point2, c: Point2): number | null {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return null;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export const DEFAULT_MIN_VISIBILITY = 0.5;

export function isVisible(
  lm: Landmark | undefined,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): lm is Landmark {
  return (
    lm !== undefined &&
    [lm.x, lm.y, lm.z].every(Number.isFinite) &&
    Number.isFinite(lm.visibility) &&
    (lm.visibility ?? 0) >= minVisibility &&
    (lm.visibility ?? 0) <= 1
  );
}

export interface NormalizedPose {
  /** Landmarks translated to the hip midpoint and scaled so torso length (shoulder-mid to hip-mid) = 1. */
  points: Point2[];
  torsoLength: number;
}

/**
 * Make detector thresholds independent of distance-to-camera and position in frame.
 * Returns null when the torso anchors are not visible enough — callers must then
 * report "insufficient confidence" instead of guessing.
 */
export function normalizePose(
  landmarks: readonly Landmark[],
  minVisibility = DEFAULT_MIN_VISIBILITY,
): NormalizedPose | null {
  const ls = landmarks[LM.LEFT_SHOULDER];
  const rs = landmarks[LM.RIGHT_SHOULDER];
  const lh = landmarks[LM.LEFT_HIP];
  const rh = landmarks[LM.RIGHT_HIP];
  if (![ls, rs, lh, rh].every((l) => isVisible(l, minVisibility))) return null;

  const hipMid = midpoint(lh as Landmark, rh as Landmark);
  const shoulderMid = midpoint(ls as Landmark, rs as Landmark);
  const torsoLength = distance2d(hipMid, shoulderMid);
  if (torsoLength < 1e-6) return null;

  return {
    torsoLength,
    points: landmarks.map((l) => ({
      x: (l.x - hipMid.x) / torsoLength,
      y: (l.y - hipMid.y) / torsoLength,
    })),
  };
}
