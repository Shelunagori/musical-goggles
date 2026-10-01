import pg from 'pg';
import type { Env } from '../env';

export type Db = pg.Pool;

function sslConfig(env: Env): pg.PoolConfig['ssl'] {
  if (env.DATABASE_SSL === 'disable') return false;
  const host = new URL(env.DATABASE_URL).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (env.DATABASE_SSL === 'auto' && isLocal) return false;
  // Supabase requires TLS. Without the project CA we encrypt but cannot verify the chain.
  return env.DATABASE_SSL_CA
    ? { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

export function createPool(env: Env, onIdleError: (err: Error) => void): Db {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: sslConfig(env),
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Client-side timeout: works through Supabase's poolers, unlike startup `options`.
    // SQL never relies on search_path — extension objects are schema-qualified (`extensions.`).
    query_timeout: 5_000,
    application_name: 'musical-goggles-api',
  });
  // An idle client losing its connection must not crash the process.
  pool.on('error', onIdleError);
  return pool;
}
