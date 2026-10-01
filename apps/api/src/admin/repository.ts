import type { Pool, PoolClient } from 'pg';
import type { ExerciseInput, CorrectionInput } from '@mg/shared';
import { notFound } from '../errors';

export class PgAdminRepository {
  constructor(private readonly pool: Pick<Pool, 'connect'>) {}
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  async saveExercise(input: ExerciseInput, id?: string): Promise<string> {
    return this.transaction(async (client) => {
      const values = [
        input.slug,
        input.name,
        input.frenchTerm,
        input.germanTerm,
        input.level,
        input.category,
        input.description,
      ];
      const result = id
        ? await client.query<{ id: string }>(
            `update public.exercises set slug=$1, name=$2, french_term=$3, german_term=$4, level=$5, category=$6, description=$7 where id=$8 returning id`,
            [...values, id],
          )
        : await client.query<{ id: string }>(
            `insert into public.exercises (slug,name,french_term,german_term,level,category,description) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
            values,
          );
      const saved = result.rows[0]?.id;
      if (!saved) throw notFound('Exercise');
      // Sync incrementally: resaving identical aliases must not invalidate embeddings.
      await client.query(
        `delete from public.exercise_aliases where exercise_id=$1 and not (lower(alias)=any($2::text[]))`,
        [saved, input.aliases.map((a) => a.alias.toLowerCase())],
      );
      for (const alias of input.aliases)
        await client.query(
          `insert into public.exercise_aliases (exercise_id,alias,language) values ($1,$2,$3)
          on conflict (exercise_id,lower(alias)) do update set alias=excluded.alias, language=excluded.language
          where exercise_aliases.alias is distinct from excluded.alias or exercise_aliases.language is distinct from excluded.language`,
          [saved, alias.alias, alias.language],
        );
      return saved;
    });
  }
  async saveCorrection(
    input: CorrectionInput,
    target: { exerciseId: string } | { id: string },
  ): Promise<string> {
    return this.transaction(async (client) => {
      const values = [
        input.slug,
        input.errorName,
        input.description,
        input.correction,
        input.cuePhrase,
        input.detector ? JSON.stringify(input.detector) : null,
      ];
      // Search columns and embeddings belong to the existing database triggers/backfill.
      const result =
        'id' in target
          ? await client.query<{ id: string }>(
              `update public.corrections set slug=$1,error_name=$2,description=$3,correction=$4,cue_phrase=$5,detector=$6 where id=$7 returning id`,
              [...values, target.id],
            )
          : await client.query<{ id: string }>(
              `insert into public.corrections (slug,error_name,description,correction,cue_phrase,detector,exercise_id) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
              [...values, target.exerciseId],
            );
      const saved = result.rows[0]?.id;
      if (!saved) throw notFound('Correction');
      return saved;
    });
  }
  async deleteCorrection(id: string): Promise<string> {
    return this.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        'delete from public.corrections where id=$1 returning id',
        [id],
      );
      if (!result.rows[0]) throw notFound('Correction');
      return id;
    });
  }
}
