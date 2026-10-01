import { expect, it } from 'vitest';
import { sampleTimes } from './video-analysis';
import { detectorBindings } from './taxonomy';
import type { ExerciseDto } from '@mg/shared';
it('samples controlled media time and bounds duration', () => {
  expect(sampleTimes(0.25)).toEqual([0, 100, 200]);
  expect(sampleTimes(300)).toHaveLength(3000);
  for (const duration of [NaN, Infinity, 0, -1, 301]) expect(() => sampleTimes(duration)).toThrow();
});
it('binds only supported valid taxonomy rows without copying correction text', () => {
  const exercise = {
    corrections: [
      {
        id: 'a',
        detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 },
        detectorIssue: null,
      },
      {
        id: 'b',
        detector: { type: 'geometric', rule: 'heel_lift', threshold: 0.03 },
        detectorIssue: null,
      },
      { id: 'c', detector: null, detectorIssue: null },
      {
        id: 'd',
        detector: { type: 'geometric', rule: 'shoulder_elevation', threshold: 0.08 },
        detectorIssue: 'invalid',
      },
    ],
  } as ExerciseDto;
  expect(detectorBindings(exercise)).toEqual([
    { correctionId: 'a', detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 } },
  ]);
});
