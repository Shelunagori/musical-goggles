import { expect, it } from 'vitest';
import { TemporalDetector } from './temporal';
import type { RuleEvaluation } from './detector-contract';
const result = (status: RuleEvaluation['status']): RuleEvaluation => ({
  rule: 'knee_alignment',
  status,
  value: 0.1,
  quality: 0.9,
  side: 'left',
  landmarkIndices: [25],
});
it('requires duration AND frames, emits once, and clears only after stable recovery', () => {
  const f = new TemporalDetector('taxonomy-row', { persistenceMs: 300, clearMs: 300 });
  for (const t of [0, 100, 200]) f.update(t, result('violation'));
  expect(f.snapshot()).toEqual([]);
  for (const t of [300, 400, 500]) f.update(t, result('violation'));
  expect(f.snapshot()).toHaveLength(1);
  expect(f.snapshot()[0]).toMatchObject({ startMs: 0, confirmedMs: 300, endMs: null });
  f.update(600, result('ok'));
  f.update(700, result('violation'));
  expect(f.snapshot()[0]!.endMs).toBeNull();
  for (const t of [800, 900, 1000, 1100]) f.update(t, result('ok'));
  expect(f.snapshot()[0]).toMatchObject({ endMs: 800, endReason: 'cleared' });
  for (const t of [1200, 1300, 1400, 1500]) f.update(t, result('violation'));
  expect(f.snapshot()).toHaveLength(2);
  expect(f.finish('cancelled')).toBeUndefined();
  expect(f.snapshot()[1]).toMatchObject({ endMs: 1500, endReason: 'cancelled' });
});
it('noisy candidates, missing landmarks and frame gaps do not accumulate persistence', () => {
  const f = new TemporalDetector('row');
  f.update(0, result('violation'));
  f.update(100, result('ok'));
  f.update(200, result('violation'));
  f.update(300, result('insufficient_confidence'));
  f.update(1000, result('violation'));
  expect(f.snapshot()).toEqual([]);
  for (const t of [1100, 1200, 1300, 1400]) f.update(t, result('violation'));
  f.update(1500, result('insufficient_confidence'));
  expect(f.snapshot()[0]).toMatchObject({ startMs: 1000, endMs: 1400, endReason: 'tracking_lost' });
});
it('terminates active events across a gap and disallows backwards time', () => {
  const f = new TemporalDetector('row', { persistenceMs: 100, minFrames: 2 });
  f.update(0, result('violation'));
  f.update(100, result('violation'));
  f.update(1000, result('violation'));
  expect(f.snapshot()[0]).toMatchObject({ endMs: 100, endReason: 'tracking_lost' });
  expect(() => f.update(999, result('ok'))).toThrow();
  expect(() => new TemporalDetector('row', { minFrames: 0 })).toThrow();
});
it('snapshot mutations cannot modify engine events', () => {
  const f = new TemporalDetector('row', { persistenceMs: 0, minFrames: 1 });
  f.update(0, result('violation'));
  f.snapshot()[0]!.startMs = 999;
  expect(f.snapshot()[0]!.startMs).toBe(0);
});
