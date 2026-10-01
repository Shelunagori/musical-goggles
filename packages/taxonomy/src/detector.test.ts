import { describe, expect, it } from 'vitest';
import { cameraSupport, detectorCoverage, parseDetector } from './detector';
import { SLUG_PATTERN } from './model';

describe('parseDetector', () => {
  it('treats null as a valid "not camera-detectable" record', () => {
    expect(parseDetector(null)).toEqual({ ok: true, detector: null });
    expect(parseDetector(undefined)).toEqual({ ok: true, detector: null });
  });

  it('accepts the documented geometric detector shape', () => {
    const raw = { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 };
    expect(parseDetector(raw)).toEqual({ ok: true, detector: raw });
  });

  it('accepts an optional min_duration_ms', () => {
    const raw = { type: 'geometric', rule: 'heel_lift', threshold: 0.03, min_duration_ms: 400 };
    expect(parseDetector(raw)).toEqual({ ok: true, detector: raw });
  });

  it.each([
    ['unknown rule', { type: 'geometric', rule: 'turnout', threshold: 0.1 }],
    ['unknown type', { type: 'learned', rule: 'knee_alignment', threshold: 0.1 }],
    ['missing threshold', { type: 'geometric', rule: 'knee_alignment' }],
    ['zero threshold', { type: 'geometric', rule: 'knee_alignment', threshold: 0 }],
    ['threshold above 1', { type: 'geometric', rule: 'knee_alignment', threshold: 1.5 }],
    [
      'extra keys (no hidden correction text in detector)',
      { type: 'geometric', rule: 'knee_alignment', threshold: 0.05, cue: 'Knees over toes' },
    ],
    ['non-object', 'knee_alignment'],
  ])('rejects %s', (_label, raw) => {
    const result = parseDetector(raw);
    expect(result.ok).toBe(false);
  });
});

describe('camera coverage', () => {
  const knee = parseDetector({ type: 'geometric', rule: 'knee_alignment', threshold: 0.05 });
  if (!knee.ok) throw new Error('fixture invalid');

  it('labels support from detector presence', () => {
    expect(cameraSupport(knee.detector)).toBe('supported');
    expect(cameraSupport(null)).toBe('not_supported');
  });

  it('counts detectable corrections out of total', () => {
    expect(
      detectorCoverage([{ detector: knee.detector }, { detector: null }, { detector: null }]),
    ).toEqual({
      cameraDetectable: 1,
      total: 3,
    });
    expect(detectorCoverage([])).toEqual({ cameraDetectable: 0, total: 0 });
  });
});

describe('SLUG_PATTERN', () => {
  it.each(['demi_plie', 'knees_inward', 'tendu', 'a1_b2'])('accepts %s', (s) => {
    expect(SLUG_PATTERN.test(s)).toBe(true);
  });
  it.each(['Demi_plie', 'demi-plie', '_x', 'x_', 'demi__plie', 'plié', ''])('rejects %s', (s) => {
    expect(SLUG_PATTERN.test(s)).toBe(false);
  });
});
