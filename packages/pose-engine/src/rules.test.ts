import { describe, expect, it } from 'vitest';
import { adaptLandmarks } from './adapter';
import { evaluateDetector, shoulderClearance } from './rules';
import { frontalPose } from './fixtures.test-support';
import { LM } from './landmarks';
import { PosePipeline } from './pipeline';
import type { Detector } from '@mg/taxonomy';
const knees: Detector = {
  type: 'geometric',
  rule: 'knee_alignment',
  threshold: 0.05,
  min_duration_ms: 300,
};
const shoulders: Detector = {
  type: 'geometric',
  rule: 'shoulder_elevation',
  threshold: 0.08,
  min_duration_ms: 400,
};
describe('landmark adapter', () => {
  it('corrects aspect ratio and conservatively handles missing visibility', () => {
    const raw = frontalPose();
    delete raw[0]!.visibility;
    const adapted = adaptLandmarks(raw, 1920, 1080);
    expect(adapted[1]!.x).toBeCloseTo((raw[1]!.x * 1920) / 1080);
    expect(adapted[1]!.y).toBe(raw[1]!.y);
    expect(adapted[0]!.visibility).toBe(0);
    expect(raw[1]!.x).toBe(0.5);
  });
  it('preserves no-person and rejects malformed coordinates/dimensions', () => {
    expect(adaptLandmarks([], 640, 480)).toEqual([]);
    expect(() => adaptLandmarks(frontalPose(), 0, 100)).toThrow();
    expect(() => adaptLandmarks(frontalPose().slice(1), 100, 100)).toThrow();
    const p = frontalPose();
    p[2]!.x = NaN;
    expect(() => adaptLandmarks(p, 100, 100)).toThrow();
  });
});
describe('knee alignment', () => {
  it.each([
    ['left', LM.LEFT_KNEE, -0.025],
    ['right', LM.RIGHT_KNEE, 0.025],
  ] as const)('detects %s independently', (side, id, offset) => {
    const p = frontalPose();
    p[id]!.x += offset;
    const result = evaluateDetector(p, knees);
    expect(result.find((r) => r.side === side)).toMatchObject({
      status: 'violation',
      value: expect.closeTo(0.125),
      quality: 0.95,
    });
    expect(result.find((r) => r.side !== side)?.status).toBe('ok');
  });
  it('is scale, translation, mirror and frame-aspect invariant', () => {
    const p = frontalPose();
    p[LM.LEFT_KNEE]!.x -= 0.03;
    const value = evaluateDetector(p, knees)[0]!.value;
    expect(
      evaluateDetector(
        p.map((l) => ({ ...l, x: l.x * 0.5 + 0.2, y: l.y * 0.5 + 0.1 })),
        knees,
      )[0]!.value,
    ).toBeCloseTo(value!);
    expect(
      evaluateDetector(
        p.map((l) => ({ ...l, x: 1 - l.x })),
        knees,
      )[0]!.value,
    ).toBeCloseTo(value!);
    expect(
      evaluateDetector(
        adaptLandmarks(
          p.map((l) => ({ ...l, x: l.x / 2 })),
          200,
          100,
        ),
        knees,
      )[0]!.value,
    ).toBeCloseTo(value!);
  });
  it('gates visibility per side, non-frontal, degenerate and absent poses', () => {
    const p = frontalPose();
    p[LM.LEFT_KNEE]!.visibility = 0.3;
    expect(evaluateDetector(p, knees).map((r) => r.status)).toEqual([
      'insufficient_confidence',
      'ok',
    ]);
    expect(evaluateDetector([], knees).every((r) => r.status === 'insufficient_confidence')).toBe(
      true,
    );
    const side = frontalPose().map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.1 }));
    expect(evaluateDetector(side, knees).every((r) => r.value === null)).toBe(true);
    p[LM.LEFT_ANKLE]!.y = p[LM.LEFT_HIP]!.y;
    expect(evaluateDetector(p, knees)[0]!.value).toBeNull();
  });
});
describe('shoulder elevation', () => {
  it('requires calibration and detects rise relative to a relaxed baseline', () => {
    const p = frontalPose();
    const baseline = shoulderClearance(p)!;
    expect(evaluateDetector(p, shoulders).every((r) => r.status === 'calibrating')).toBe(true);
    expect(evaluateDetector(p, shoulders, baseline).every((r) => r.status === 'ok')).toBe(true);
    p[LM.LEFT_SHOULDER]!.y -= 0.03;
    p[LM.RIGHT_SHOULDER]!.y -= 0.03;
    expect(evaluateDetector(p, shoulders, baseline).every((r) => r.status === 'violation')).toBe(
      true,
    );
  });
  it('rejects hidden ears and large head tilt', () => {
    const p = frontalPose();
    p[LM.LEFT_EAR]!.visibility = 0;
    expect(shoulderClearance(p)).toBeNull();
    p[LM.LEFT_EAR]!.visibility = 1;
    p[LM.LEFT_EAR]!.y -= 0.1;
    expect(shoulderClearance(p)).toBeNull();
  });
  it('calibrates after stable observations, not a single frame', () => {
    const pipeline = new PosePipeline([{ correctionId: 'shoulder-row', detector: shoulders }]);
    const p = frontalPose();
    expect(pipeline.process({ timestampMs: 0, landmarks: p }).calibrated).toBe(false);
    for (let t = 100; t < 1500; t += 100)
      expect(pipeline.process({ timestampMs: t, landmarks: p }).calibrated).toBe(false);
    expect(pipeline.process({ timestampMs: 1500, landmarks: p }).calibrated).toBe(true);
    p[LM.LEFT_SHOULDER]!.y -= 0.03;
    p[LM.RIGHT_SHOULDER]!.y -= 0.03;
    for (let t = 1600; t <= 2500; t += 100) pipeline.process({ timestampMs: t, landmarks: p });
    expect(pipeline.events()).toHaveLength(2);
    expect(pipeline.events()[0]).toMatchObject({
      correctionId: 'shoulder-row',
      startMs: 1600,
      confirmedMs: 2000,
      endMs: null,
    });
    expect(pipeline.finish()[0]!.endMs).toBe(2500);
  });
  it('does not calibrate across loss of tracking or unstable shoulders', () => {
    const pipeline = new PosePipeline([{ correctionId: 'row', detector: shoulders }]);
    for (let t = 0; t <= 2000; t += 100) {
      const p = frontalPose();
      if (t % 200 === 0) {
        p[LM.LEFT_SHOULDER]!.y -= 0.06;
        p[LM.RIGHT_SHOULDER]!.y -= 0.06;
      }
      expect(pipeline.process({ timestampMs: t, landmarks: p }).calibrated).toBe(false);
    }
    expect(pipeline.process({ timestampMs: 2100, landmarks: [] }).calibrated).toBe(false);
  });
});
it('keeps heel-lift unsupported and validates configuration at the boundary', () => {
  expect(
    evaluateDetector(frontalPose(), { ...knees, rule: 'heel_lift' }).every(
      (r) => r.status === 'unsupported',
    ),
  ).toBe(true);
  expect(
    () => new PosePipeline([{ correctionId: 'x', detector: { ...knees, threshold: NaN } }]),
  ).toThrow();
  expect(() => evaluateDetector(frontalPose(), { ...knees, threshold: -1 })).toThrow();
  const pipeline = new PosePipeline([{ correctionId: 'x', detector: knees }]);
  pipeline.process({ timestampMs: 0, landmarks: [] });
  expect(() => pipeline.process({ timestampMs: 0, landmarks: [] })).toThrow();
});
