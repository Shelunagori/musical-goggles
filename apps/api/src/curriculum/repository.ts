import type { Db } from '../db/pool';

/** Raw rows as returned by Postgres — no domain parsing yet. */
export interface ExerciseRow {
  id: string;
  slug: string;
  name: string;
  french_term: string | null;
  german_term: string | null;
  level: string;
  category: string;
  description: string;
  aliases: Array<{ alias: string; language: string }>;
}

export interface CorrectionRow {
  id: string;
  exercise_id: string;
  slug: string;
  error_name: string;
  description: string;
  correction: string;
  cue_phrase: string;
  detector: unknown;
  has_embedding: boolean;
  updated_at: Date;
}

export interface CurriculumRows {
  exercises: ExerciseRow[];
  corrections: CorrectionRow[];
}

/** Read side of the curriculum. Admin writes (Phase 5) extend this interface. */
export interface CurriculumRepository {
  listCurriculum(): Promise<CurriculumRows>;
  getExerciseBySlug(slug: string): Promise<CurriculumRows | null>;
  ping(): Promise<void>;
}

const EXERCISE_SELECT = `
  select e.id, e.slug, e.name, e.french_term, e.german_term, e.level, e.category, e.description,
         coalesce(
           (select json_agg(json_build_object('alias', a.alias, 'language', a.language)
                            order by a.language, a.alias)
              from public.exercise_aliases a
             where a.exercise_id = e.id),
           '[]'::json) as aliases
    from public.exercises e`;

// Never select the embedding vector itself — only whether one exists.
const CORRECTION_SELECT = `
  select c.id, c.exercise_id, c.slug, c.error_name, c.description, c.correction, c.cue_phrase,
         c.detector, (c.embedding is not null) as has_embedding, c.updated_at
    from public.corrections c`;

const CORRECTION_ORDER = `order by (c.detector is null), c.error_name`;

export class PgCurriculumRepository implements CurriculumRepository {
  constructor(private readonly db: Db) {}

  async listCurriculum(): Promise<CurriculumRows> {
    const [ex, co] = await Promise.all([
      this.db.query<ExerciseRow>(`${EXERCISE_SELECT} order by e.position, e.name`),
      this.db.query<CorrectionRow>(`${CORRECTION_SELECT} ${CORRECTION_ORDER}`),
    ]);
    return { exercises: ex.rows, corrections: co.rows };
  }

  async getExerciseBySlug(slug: string): Promise<CurriculumRows | null> {
    const ex = await this.db.query<ExerciseRow>(`${EXERCISE_SELECT} where e.slug = $1`, [slug]);
    const exercise = ex.rows[0];
    if (!exercise) return null;
    const co = await this.db.query<CorrectionRow>(
      `${CORRECTION_SELECT} where c.exercise_id = $1 ${CORRECTION_ORDER}`,
      [exercise.id],
    );
    return { exercises: [exercise], corrections: co.rows };
  }

  async ping(): Promise<void> {
    // Resolve required tables/columns and permissions even when the catalog is empty.
    await this.db.query(`select e.id, a.alias, c.search_tsv, c.embedding, c.detector
      from public.exercises e
      left join public.exercise_aliases a on a.exercise_id=e.id
      left join public.corrections c on c.exercise_id=e.id limit 0`);
  }
}
