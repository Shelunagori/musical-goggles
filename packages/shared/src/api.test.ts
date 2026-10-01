import { describe, expect, it } from 'vitest';
import { CurriculumResponseSchema, DATASET_NOTICE } from './api';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('CurriculumResponseSchema', () => {
  const valid = {
    dataset: { label: 'DEMO DATA', notice: DATASET_NOTICE },
    coverage: { cameraDetectable: 1, total: 2 },
    exercises: [
      {
        id: uuid(1),
        slug: 'demi_plie',
        name: 'Demi-plié',
        frenchTerm: 'demi-plié',
        germanTerm: 'halbe Kniebeuge',
        level: 'beginner',
        category: 'barre',
        description: '',
        aliases: [{ alias: 'plie', language: 'en' }],
        corrections: [
          {
            id: uuid(2),
            slug: 'knees_inward',
            exerciseId: uuid(1),
            errorName: 'Knees collapsing inward',
            description: '',
            correction: 'Track your knees over your toes',
            cuePhrase: 'Knees over toes',
            detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 },
            camera: 'supported',
            detectorIssue: null,
            hasEmbedding: false,
            updatedAt: new Date(0).toISOString(),
          },
        ],
      },
    ],
  };

  it('accepts a well-formed payload', () => {
    expect(CurriculumResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a payload whose detector carries correction text', () => {
    const bad = JSON.parse(JSON.stringify(valid)) as typeof valid;
    (bad.exercises[0]!.corrections[0]!.detector as Record<string, unknown>).cue = 'Knees over toes';
    expect(CurriculumResponseSchema.safeParse(bad).success).toBe(false);
  });
});
