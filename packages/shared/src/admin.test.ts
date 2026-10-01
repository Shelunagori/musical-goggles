import { expect, it } from 'vitest';
import { CorrectionInputSchema, ExerciseInputSchema } from './admin';
const correction = {
  slug: 'quiet_ankle',
  errorName: 'Ankle wobble',
  description: '',
  correction: 'Stabilise the ankle',
  cuePhrase: 'Quiet ankle',
  detector: null,
};
const exercise = {
  slug: 'test_exercise',
  name: 'Test exercise',
  frenchTerm: null,
  germanTerm: null,
  level: 'beginner',
  category: 'barre',
  description: '',
  aliases: [],
};
it('accepts trimmed text and nullable detector metadata', () => {
  expect(
    CorrectionInputSchema.parse({ ...correction, cuePhrase: '  Quiet ankle  ' }).cuePhrase,
  ).toBe('Quiet ankle');
  expect(ExerciseInputSchema.parse(exercise)).toEqual(exercise);
});
it.each([
  { threshold: 0 },
  { threshold: 2 },
  { rule: 'invented' },
  { min_duration_ms: 0.5 },
  { cue: 'Do not embed copy in metadata' },
])('rejects invalid structured detector fields %j', (override) => {
  expect(
    CorrectionInputSchema.safeParse({
      ...correction,
      detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05, ...override },
    }).success,
  ).toBe(false);
});
it('rejects writable embeddings, unknown properties, empty content and duplicate aliases', () => {
  expect(CorrectionInputSchema.safeParse({ ...correction, embedding: [1] }).success).toBe(false);
  expect(CorrectionInputSchema.safeParse({ ...correction, correction: '   ' }).success).toBe(false);
  expect(
    ExerciseInputSchema.safeParse({
      ...exercise,
      aliases: [
        { alias: 'Plié', language: 'fr' },
        { alias: 'plié', language: 'en' },
      ],
    }).success,
  ).toBe(false);
});
