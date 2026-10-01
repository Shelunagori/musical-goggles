import assert from 'node:assert/strict';
import { DetectorSchema } from '@mg/taxonomy';
import { runCli, withDb } from './db-cli';

// Read-only audit: safe to run after migrations/seed and against the final demo.
await runCli(async () => {
  await withDb(async (pool) => {
    const extensions = (
      await pool.query(`select e.extname, n.nspname from pg_extension e
      join pg_namespace n on n.oid=e.extnamespace where e.extname in ('vector','unaccent')`)
    ).rows;
    for (const name of ['vector', 'unaccent'])
      assert(
        extensions.some((e) => e.extname === name && e.nspname === 'extensions'),
        `${name} must be installed in extensions`,
      );
    const tables = (
      await pool.query(`select relname, relrowsecurity from pg_class
      where oid in ('public.exercises'::regclass,'public.exercise_aliases'::regclass,'public.corrections'::regclass)`)
    ).rows;
    assert(
      tables.length === 3 && tables.every((t) => t.relrowsecurity),
      'Taxonomy RLS must be enabled',
    );
    const policies = (
      await pool.query(`select policyname from pg_policies where schemaname='public'
      and tablename in ('exercises','exercise_aliases','corrections')`)
    ).rows;
    assert.equal(policies.length, 0, 'Review unexpected taxonomy RLS policies before publishing');
    const indexes = (
      await pool.query(`select indexname, indexdef from pg_indexes
      where schemaname='public' and tablename='corrections'`)
    ).rows;
    assert(
      indexes.some((i) => i.indexdef.includes('USING gin (search_tsv)')),
      'FTS GIN index missing',
    );
    assert(
      indexes.some(
        (i) => i.indexdef.includes('USING hnsw') && i.indexdef.includes('vector_cosine_ops'),
      ),
      'Cosine HNSW index missing',
    );
    const dimensions = (
      await pool.query(`select format_type(atttypid,atttypmod) as type from pg_attribute
      where attrelid='public.corrections'::regclass and attname='embedding'`)
    ).rows;
    assert.match(dimensions[0]?.type ?? '', /vector\(384\)$/);
    const triggers = (
      await pool.query(`select tgname from pg_trigger where not tgisinternal and tgenabled <> 'D'
      and tgrelid in ('public.exercises'::regclass,'public.exercise_aliases'::regclass,'public.corrections'::regclass)`)
    ).rows;
    for (const name of [
      'exercises_set_updated_at',
      'corrections_set_updated_at',
      'corrections_refresh_search',
      'exercises_touch_corrections',
      'exercise_aliases_touch_corrections',
    ])
      assert(
        triggers.some((t) => t.tgname === name),
        `Missing trigger: ${name}`,
      );
    const corrections = (
      await pool.query('select detector,searchable_text,search_tsv from public.corrections')
    ).rows;
    corrections.forEach((c) => {
      if (c.detector !== null) DetectorSchema.parse(c.detector);
      assert(c.searchable_text && c.search_tsv, 'Empty correction search document');
    });
    const counts = (
      await pool.query(`select (select count(*)::int from public.exercises) as exercises,
      (select count(*)::int from public.exercise_aliases) as aliases,
      (select count(*)::int from public.corrections) as corrections,
      (select count(*)::int from public.corrections where detector is not null) as detectors,
      to_regclass('public.term_aliases') as term_aliases`)
    ).rows[0];
    if (process.argv.includes('--baseline')) {
      assert.equal(counts.exercises, 9);
      assert.equal(counts.corrections, 29);
      assert.equal(counts.detectors, 3);
    }
    console.log(
      JSON.stringify({ status: 'ok', ...counts, extensions, indexes, triggers }, null, 2),
    );
  });
});
