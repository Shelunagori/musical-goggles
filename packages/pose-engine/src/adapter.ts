import { POSE_LANDMARK_COUNT, type Landmark } from './landmarks';

/** MediaPipe image coordinates have unequal x/y units. Convert to image-height units.
 * Visibility is mandatory for this prototype; absent confidence never means certainty.
 */
export function adaptLandmarks(
  raw: readonly Landmark[],
  width: number,
  height: number,
): Landmark[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Invalid frame dimensions');
  if (raw.length === 0) return [];
  if (
    raw.length !== POSE_LANDMARK_COUNT ||
    raw.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))
  )
    throw new Error('Invalid pose landmarks');
  return raw.map((p) => ({
    x: (p.x * width) / height,
    y: p.y,
    z: (p.z * width) / height,
    visibility:
      typeof p.visibility === 'number' && Number.isFinite(p.visibility)
        ? Math.max(0, Math.min(1, p.visibility))
        : 0,
  }));
}
