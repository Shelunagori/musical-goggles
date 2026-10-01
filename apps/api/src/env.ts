import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

  DATABASE_URL: z
    .string({
      error:
        'DATABASE_URL is required (Supabase → Project Settings → Database → Connection string)',
    })
    .refine(
      (v) => /^postgres(ql)?:\/\//.test(v),
      'DATABASE_URL must start with postgres:// or postgresql://',
    ),
  /** auto = TLS for any non-local host. */
  DATABASE_SSL: z.enum(['auto', 'require', 'disable']).default('auto'),
  /** Optional PEM CA (Supabase → Database → SSL). When set, the server certificate is verified. */
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  ADMIN_API_TOKEN: z.string().min(32).max(256).optional(),

  // --- Phase 2 (optional until then) ---
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  EMBEDDING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SEARCH_DEBUG: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  // Treat empty strings as unset so `FOO=` in .env behaves like a missing var.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

/** Load apps/api/.env for local development. Production (Render) injects real env vars. */
export function loadDotEnv(path = '.env'): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
