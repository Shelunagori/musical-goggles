import { describe, expect, it } from 'vitest';
import { angleDeg, distance2d, isVisible, midpoint, normalizePose } from './geometry';
import { LM, POSE_LANDMARK_COUNT, type Landmark } from './landmarks';

function pose(overrides: Partial<Record<number, Landmark>> = {}): Landmark[] {
  const base: Landmark[] = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  base[LM.LEFT_SHOULDER] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 };
  base[LM.RIGHT_SHOULDER] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
  base[LM.LEFT_HIP] = { x: 0.6, y: 0.5, z: 0, visibility: 0.9 };
  base[LM.RIGHT_HIP] = { x: 0.4, y: 0.5, z: 0, visibility: 0.9 };
  for (const [k, v] of Object.entries(overrides)) base[Number(k)] = v as Landmark;
  return base;
}

describe('basic geometry', () => {
  it('distance and midpoint', () => {
    expect(distance2d({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 2 }, { x: 2, y: 4 })).toEqual({ x: 1, y: 3 });
  });

  it('angleDeg returns interior angles', () => {
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180);
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0);
  });

  it('angleDeg is null for degenerate vectors', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('isVisible honours threshold and missing visibility', () => {
    expect(isVisible({ x: 0, y: 0, z: 0, visibility: 0.4 })).toBe(false);
    expect(isVisible({ x: 0, y: 0, z: 0, visibility: 0.6 })).toBe(true);
    expect(isVisible({ x: 0, y: 0, z: 0 })).toBe(false);
    expect(isVisible(undefined)).toBe(false);
  });
});

describe('normalizePose', () => {
  it('centres on hip midpoint and scales torso length to 1', () => {
    const n = normalizePose(pose());
    expect(n).not.toBeNull();
    expect(n!.torsoLength).toBeCloseTo(0.2);
    // hip midpoint -> origin
    const lh = n!.points[LM.LEFT_HIP]!;
    const rh = n!.points[LM.RIGHT_HIP]!;
    expect((lh.x + rh.x) / 2).toBeCloseTo(0);
    expect((lh.y + rh.y) / 2).toBeCloseTo(0);
    // shoulders one torso length above (y grows downward)
    expect(n!.points[LM.LEFT_SHOULDER]!.y).toBeCloseTo(-1);
  });

  it('is invariant to distance from camera (scale)', () => {
    const near = normalizePose(pose());
    const scaled = pose();
    const far = normalizePose(
      scaled.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) / 2, y: 0.5 + (l.y - 0.5) / 2 })),
    );
    expect(far!.points[LM.LEFT_SHOULDER]!.x).toBeCloseTo(near!.points[LM.LEFT_SHOULDER]!.x);
    expect(far!.points[LM.LEFT_SHOULDER]!.y).toBeCloseTo(near!.points[LM.LEFT_SHOULDER]!.y);
  });

  it('refuses to normalize when torso anchors are not visible', () => {
    expect(
      normalizePose(pose({ [LM.LEFT_HIP]: { x: 0.6, y: 0.5, z: 0, visibility: 0.1 } })),
    ).toBeNull();
    expect(normalizePose([])).toBeNull();
  });

  it('refuses a degenerate (zero-length) torso', () => {
    const p = pose({
      [LM.LEFT_SHOULDER]: { x: 0.6, y: 0.5, z: 0, visibility: 0.9 },
      [LM.RIGHT_SHOULDER]: { x: 0.4, y: 0.5, z: 0, visibility: 0.9 },
    });
    expect(normalizePose(p)).toBeNull();
  });
});
