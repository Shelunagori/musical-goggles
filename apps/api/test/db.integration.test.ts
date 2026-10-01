/**
 * Runs against a REAL Postgres with migrations + seed applied (see README).
 * Set TEST_DATABASE_URL to enable. Without it the suite is skipped and says so.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { CurriculumResponseSchema } from '@mg/shared';
import { buildApp } from '../src/app';
import { PgCurriculumRepository } from '../src/curriculum/repository';

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn('[db.integration] TEST_DATABASE_URL not set — skipping real-database tests.');

describe.skipIf(!url)('real database', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('GET /curriculum serves seeded DEMO DATA from Postgres', async () => {
    const app = await buildApp({ repo: new PgCurriculumRepository(pool), corsOrigins: [] });
    try {
      const res = await app.inject('/curriculum');
      expect(res.statusCode).toBe(200);
      const body = CurriculumResponseSchema.parse(res.json());
      expect(body.exercises.length).toBeGreaterThanOrEqual(9);
      expect(body.coverage.total).toBeGreaterThanOrEqual(25);
      expect(body.coverage.cameraDetectable).toBe(3);
      expect(body.exercises[0]!.slug).toBe('demi_plie');
      const plie = body.exercises[0]!;
      expect(plie.corrections.find((c) => c.slug === 'knees_inward')).toMatchObject({
        cuePhrase: 'Knees over toes',
        camera: 'supported',
        detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 },
      });
      // Camera-detectable corrections are listed first.
      expect(plie.corrections.slice(0, 2).every((c) => c.camera === 'supported')).toBe(true);
      // Every detector in the DB must pass the strict taxonomy schema.
      expect(body.exercises.flatMap((e) => e.corrections).filter((c) => c.detectorIssue)).toEqual(
        [],
      );
    } finally {
      await app.close();
    }
  });

  it('a newly inserted correction is immediately full-text searchable (trigger-built search doc)', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`
        insert into public.corrections (exercise_id, slug, error_name, correction, cue_phrase)
        select id, 'test_wobble', 'Wobbling ankle', 'Stabilise the supporting ankle', 'Quiet ankle'
          from public.exercises where slug = 'battement_tendu'`);
      const { rows } = await client.query<{ slug: string }>(`
        select slug from public.corrections
         where search_tsv @@ websearch_to_tsquery('simple',
               extensions.unaccent('extensions.unaccent'::regdictionary, 'tendu wobbling'))`);
      expect(rows.map((r) => r.slug)).toContain('test_wobble');
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('changing retrieval text invalidates a stale embedding; alias changes propagate', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`update public.corrections
          set embedding = array_fill(0.1::real, array[384])::extensions.vector, embedding_model = 'test'
        where slug = 'knees_inward'`);
      await client.query(
        `update public.corrections set description = 'only description' where slug = 'knees_inward'`,
      );
      let r = await client.query<{ has: boolean }>(
        `select embedding is not null as has from public.corrections where slug='knees_inward'`,
      );
      expect(r.rows[0]!.has).toBe(true); // description is not part of the retrieval unit

      await client.query(
        `update public.corrections set cue_phrase = 'Knees over the toes' where slug = 'knees_inward'`,
      );
      r = await client.query<{ has: boolean }>(
        `select embedding is not null as has from public.corrections where slug='knees_inward'`,
      );
      expect(r.rows[0]!.has).toBe(false);

      await client.query(`insert into public.exercise_aliases (exercise_id, alias, language)
        select id, 'Pliéchen', 'de' from public.exercises where slug = 'demi_plie'`);
      const t = await client.query<{ searchable_text: string }>(
        `select searchable_text from public.corrections where slug='heels_lift'`,
      );
      expect(t.rows[0]!.searchable_text).toContain('Pliéchen');
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('rejects a detector that violates the DB contract', async () => {
    await expect(
      pool.query(
        `update public.corrections set detector = '{"type":"learned"}' where slug = 'turnout_lost'`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
