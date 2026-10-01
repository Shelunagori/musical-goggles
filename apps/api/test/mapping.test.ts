import { describe, expect, it } from 'vitest';
import { buildCurriculum, toCurriculumResponse } from '../src/curriculum/mapping';
import { AppError } from '../src/errors';
import { correction, plie } from './fixtures';

describe('buildCurriculum', () => {
  it('nests corrections under their exercise and computes camera coverage', () => {
    const { exercises, warnings } = buildCurriculum({
      exercises: [plie],
      corrections: [
        correction(1, { detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 } }),
        correction(2),
      ],
    });
    expect(warnings).toEqual([]);
    expect(exercises).toHaveLength(1);
    expect(exercises[0]!.corrections.map((c) => c.camera)).toEqual(['supported', 'not_supported']);
    expect(toCurriculumResponse(exercises).coverage).toEqual({ cameraDetectable: 1, total: 2 });
  });

  it('degrades an invalid detector to not-supported and reports it (never silently enables detection)', () => {
    const { exercises, warnings } = buildCurriculum({
      exercises: [plie],
      corrections: [
        correction(1, { detector: { type: 'geometric', rule: 'turnout', threshold: 0.1 } }),
      ],
    });
    const c = exercises[0]!.corrections[0]!;
    expect(c.detector).toBeNull();
    expect(c.camera).toBe('not_supported');
    expect(c.detectorIssue).toMatch(/Invalid detector config/);
    expect(warnings).toHaveLength(1);
  });

  it('keeps exercises with no corrections', () => {
    const { exercises } = buildCurriculum({ exercises: [plie], corrections: [] });
    expect(exercises[0]!.corrections).toEqual([]);
  });

  it('throws DATA_INTEGRITY for values outside the domain enums', () => {
    expect(() =>
      buildCurriculum({ exercises: [{ ...plie, level: 'expert' }], corrections: [] }),
    ).toThrow(AppError);
  });

  it('labels the dataset as DEMO DATA', () => {
    expect(toCurriculumResponse([]).dataset.label).toBe('DEMO DATA');
  });
});
