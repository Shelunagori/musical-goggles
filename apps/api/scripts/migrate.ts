import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findSupabaseDir, redactUrl, runCli, withDb } from './db-cli';

// Minimal forward-only runner: applies supabase/migrations/*.sql in filename order,
// each in its own transaction, recorded in public.schema_migrations.
// The same files work with the Supabase CLI (`supabase db push`) if you prefer that.
await runCli(async () => {
  await withDb(async (pool, url) => {
    const dir = join(findSupabaseDir(), 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    console.log(`Migrating ${redactUrl(url)} (${files.length} file(s) in ${dir})`);

    const client = await pool.connect();
    try {
      await client.query('select pg_advisory_lock(727274)');
      await client.query(`create table if not exists public.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )`);
      await client.query('alter table public.schema_migrations enable row level security');
      const applied = new Set(
        (
          await client.query<{ version: string }>('select version from public.schema_migrations')
        ).rows.map((r) => r.version),
      );

      for (const file of files) {
        if (applied.has(file)) {
          console.log(`  ✓ ${file} (already applied)`);
          continue;
        }
        const sql = await readFile(join(dir, file), 'utf8');
        await client.query('begin');
        try {
          await client.query(sql);
          await client.query('insert into public.schema_migrations (version) values ($1)', [file]);
          await client.query('commit');
          console.log(`  + ${file}`);
        } catch (err) {
          await client.query('rollback');
          throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock(727274)').catch(() => undefined);
      client.release();
    }
    console.log('Migrations complete.');
  });
});
