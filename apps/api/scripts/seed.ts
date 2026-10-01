import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findSupabaseDir, redactUrl, runCli, withDb } from './db-cli';

// Loads supabase/seed.sql (DEMO DATA). Idempotent: upserts by slug.
await runCli(async () => {
  await withDb(async (pool, url) => {
    const sql = await readFile(join(findSupabaseDir(), 'seed.sql'), 'utf8');
    console.log(`Seeding ${redactUrl(url)} with DEMO DATA…`);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Seed failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
    const { rows } = await pool.query<{
      exercises: number;
      corrections: number;
      detectable: number;
    }>(`
      select (select count(*)::int from public.exercises) as exercises,
             (select count(*)::int from public.corrections) as corrections,
             (select count(*)::int from public.corrections where detector is not null) as detectable`);
    const r = rows[0];
    console.log(
      `Seed complete: ${r?.exercises} exercises, ${r?.corrections} corrections, ${r?.detectable} camera-detectable.`,
    );
  });
});
