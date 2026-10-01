import { redactUrl, runCli, withDb } from './db-cli';

// Drops everything this project created. Refuses to run against a non-local
// database unless ALLOW_DB_RESET=true, so it can't wipe Supabase by accident.
await runCli(async () => {
  await withDb(async (pool, url) => {
    const host = new URL(url).hostname;
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (!local && process.env.ALLOW_DB_RESET !== 'true') {
      throw new Error(
        `Refusing to reset non-local database ${redactUrl(url)}. Set ALLOW_DB_RESET=true to override.`,
      );
    }
    await pool.query(`
      drop table if exists public.corrections, public.exercise_aliases, public.exercises, public.schema_migrations cascade;
      drop function if exists public.corrections_refresh_search() cascade;
      drop function if exists public.touch_exercise_corrections() cascade;
      drop function if exists public.correction_search_document(uuid, text, text, text, text) cascade;
      drop function if exists public.set_updated_at() cascade;
    `);
    console.log(`Reset ${redactUrl(url)}. Run db:migrate and db:seed next.`);
  });
});
