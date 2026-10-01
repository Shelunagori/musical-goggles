import type { ApiErrorCode } from '@mg/shared';

export class AppError extends Error {
  override name = 'AppError';
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`, 404);

// Network-level failures and Postgres SQLSTATE classes meaning "the database is not usable right now".
const UNAVAILABLE_ERRNO = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
]);
const UNAVAILABLE_SQLSTATE = new Set([
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '28P01', // invalid_password
  '28000', // invalid_authorization_specification
  '3D000', // invalid_catalog_name (database does not exist)
]);

/** Translate low-level DB errors into user-meaningful API errors. Returns null if not a DB-availability problem. */
export function classifyDatabaseError(err: unknown): AppError | null {
  if (!(err instanceof Error)) return null;
  const code = (err as { code?: unknown }).code;
  const message = err.message ?? '';

  if (typeof code === 'string') {
    if (UNAVAILABLE_ERRNO.has(code) || UNAVAILABLE_SQLSTATE.has(code) || code.startsWith('08')) {
      return new AppError(
        'DATABASE_UNAVAILABLE',
        'The curriculum database is unavailable. Check DATABASE_URL and that Supabase is reachable.',
        503,
        { cause: err },
      );
    }
    if (code === '42P01') {
      return new AppError(
        'DATABASE_UNAVAILABLE',
        'The database schema is missing. Run `pnpm db:migrate` and `pnpm db:seed`.',
        503,
        { cause: err },
      );
    }
  }
  if (/timeout exceeded when trying to connect|Connection terminated/i.test(message)) {
    return new AppError(
      'DATABASE_UNAVAILABLE',
      'Timed out connecting to the curriculum database.',
      503,
      { cause: err },
    );
  }
  return null;
}
