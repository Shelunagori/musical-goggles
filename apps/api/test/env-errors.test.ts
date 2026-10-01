import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../src/env';
import { classifyDatabaseError } from '../src/errors';

describe('parseEnv', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('applies defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_SSL).toBe('auto');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.DEEPGRAM_API_KEY).toBeUndefined();
  });

  it('requires DATABASE_URL and explains where to find it', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects non-postgres URLs and treats empty strings as unset', () => {
    expect(() => parseEnv({ DATABASE_URL: 'https://example.com' })).toThrow(/postgres/);
    expect(() => parseEnv({ DATABASE_URL: '' })).toThrow(/required/);
  });

  it('parses comma-separated CORS origins and coerces PORT', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: 'https://a.vercel.app, http://localhost:3000 ,',
      PORT: '10000',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.vercel.app', 'http://localhost:3000']);
    expect(env.PORT).toBe(10000);
  });
});

describe('classifyDatabaseError', () => {
  const withCode = (code: string, msg = 'x') => Object.assign(new Error(msg), { code });

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '08006', '57P01', '28P01', '3D000'])(
    '%s → 503 DATABASE_UNAVAILABLE',
    (code) => {
      const e = classifyDatabaseError(withCode(code));
      expect(e?.code).toBe('DATABASE_UNAVAILABLE');
      expect(e?.statusCode).toBe(503);
    },
  );

  it('missing relation → tells you to migrate', () => {
    expect(classifyDatabaseError(withCode('42P01'))?.message).toMatch(/db:migrate/);
  });

  it('pool connect timeout → unavailable', () => {
    expect(classifyDatabaseError(new Error('timeout exceeded when trying to connect'))?.code).toBe(
      'DATABASE_UNAVAILABLE',
    );
  });

  it('ignores unrelated errors (e.g. syntax error 42601)', () => {
    expect(classifyDatabaseError(withCode('42601'))).toBeNull();
    expect(classifyDatabaseError('nope')).toBeNull();
  });
});
