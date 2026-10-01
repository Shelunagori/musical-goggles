import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { loadDotEnv, parseEnv } from '../src/env';
import { createPool } from '../src/db/pool';

/** Find `supabase/` by walking up from this file (works from scripts/ and from dist/). */
export function findSupabaseDir(): string {
  if (process.env.SUPABASE_DIR) return resolve(process.env.SUPABASE_DIR);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'supabase', 'migrations');
    if (existsSync(candidate)) return join(dir, 'supabase');
    dir = dirname(dir);
  }
  throw new Error('Could not locate supabase/migrations. Set SUPABASE_DIR.');
}

export async function withDb<T>(
  fn: (pool: pg.Pool, databaseUrl: string) => Promise<T>,
): Promise<T> {
  loadDotEnv();
  const env = parseEnv(process.env);
  const pool = createPool(env, (err) => console.error('postgres idle client error', err));
  try {
    return await fn(pool, env.DATABASE_URL);
  } finally {
    await pool.end();
  }
}

export function redactUrl(url: string): string {
  const u = new URL(url);
  if (u.password) u.password = '****';
  return u.toString();
}

export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
