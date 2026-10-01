import type {
  CorrectionRow,
  CurriculumRepository,
  CurriculumRows,
  ExerciseRow,
} from '../src/curriculum/repository';

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const plie: ExerciseRow = {
  id: uuid(1),
  slug: 'demi_plie',
  name: 'Demi-plié',
  french_term: 'demi-plié',
  german_term: 'halbe Kniebeuge',
  level: 'beginner',
  category: 'barre',
  description: '',
  aliases: [{ alias: 'plie', language: 'en' }],
};

export const correction = (n: number, over: Partial<CorrectionRow> = {}): CorrectionRow => ({
  id: uuid(100 + n),
  exercise_id: plie.id,
  slug: `c_${n}`,
  error_name: `Error ${n}`,
  description: '',
  correction: `Correction ${n}`,
  cue_phrase: `Cue ${n}`,
  detector: null,
  has_embedding: false,
  updated_at: new Date('2026-10-01T00:00:00Z'),
  ...over,
});

export class FakeRepo implements CurriculumRepository {
  constructor(
    public rows: CurriculumRows,
    public failWith: Error | null = null,
  ) {}
  async listCurriculum() {
    if (this.failWith) throw this.failWith;
    return this.rows;
  }
  async getExerciseBySlug(slug: string) {
    if (this.failWith) throw this.failWith;
    const ex = this.rows.exercises.find((e) => e.slug === slug);
    return ex
      ? {
          exercises: [ex],
          corrections: this.rows.corrections.filter((c) => c.exercise_id === ex.id),
        }
      : null;
  }
  async ping() {
    if (this.failWith) throw this.failWith;
  }
}

export function connRefused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
}
