import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../src/env';
import { classifyDatabaseError } from '../src/errors';

describe('parseEnv', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('applies defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.DEMO_ADMIN_ENABLED).toBe(false);
    expect(env.DATABASE_SSL).toBe('auto');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.DEEPGRAM_API_KEY).toBeUndefined();
  });

  it('enables demo admin explicitly and requires HTTPS origins in production', () => {
    expect(parseEnv({ ...base, DEMO_ADMIN_ENABLED: 'true' }).DEMO_ADMIN_ENABLED).toBe(true);
    expect(() => parseEnv({ ...base, DEMO_ADMIN_ENABLED: 'yes' })).toThrow('DEMO_ADMIN_ENABLED');
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        DEMO_ADMIN_ENABLED: 'true',
        CORS_ORIGINS: 'http://localhost:3000',
      }),
    ).toThrow('HTTPS');
    expect(
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        DEMO_ADMIN_ENABLED: 'true',
        CORS_ORIGINS: 'https://classroom.vercel.app',
      }).DEMO_ADMIN_ENABLED,
    ).toBe(true);
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
  it('requires production origins and rejects wildcard/path/credential configuration', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow('CORS_ORIGINS');
    for (const CORS_ORIGINS of ['*', 'https://site.example/path', 'https://u:p@site.example'])
      expect(() => parseEnv({ ...base, CORS_ORIGINS })).toThrow('exact HTTP(S) origins');
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://site.example' })
        .CORS_ORIGINS,
    ).toEqual(['https://site.example']);
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
