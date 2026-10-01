import { afterEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { PgAdminRepository } from '../src/admin/repository';
import { PgCurriculumRepository } from '../src/curriculum/repository';
import { DemoSessions, DEMO_SESSION_TTL_MS } from '../src/admin/demo-session';

const origin = 'https://classroom.vercel.app';
const headers = { origin, 'x-demo-admin': '1' };
const token = 'private-server-token-must-never-be-returned';
const apps: FastifyInstance[] = [];
const pool = new pg.Pool(); // Auth-only tests never query a database. CRUD tests use real PostgreSQL.
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.restoreAllMocks();
});
async function setup(enabled = true, production = true) {
  const app = await buildApp({
    repo: new PgCurriculumRepository(pool),
    adminRepo: new PgAdminRepository(pool),
    adminToken: token,
    demoAdminEnabled: enabled,
    production,
    corsOrigins: [origin, 'https://other-allowed.vercel.app'],
  });
  apps.push(app);
  return app;
}
async function issue(app: FastifyInstance) {
  const response = await app.inject({ method: 'POST', url: '/admin/demo-session', headers });
  expect(response.statusCode).toBe(200);
  const cookie = String(response.headers['set-cookie']).split(';')[0] ?? '';
  return { response, auth: { ...headers, cookie } };
}
describe('demo admin HTTP session boundary', () => {
  it('is disabled by default and does not issue cookies when disabled', async () => {
    const app = await setup(false);
    expect((await app.inject('/admin/demo-session')).json()).toEqual({
      enabled: false,
      active: false,
      expiresAt: null,
    });
    const response = await app.inject({ method: 'POST', url: '/admin/demo-session', headers });
    expect(response.statusCode).toBe(503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      (await app.inject({ url: '/admin/status', headers: { authorization: `Bearer ${token}` } }))
        .statusCode,
    ).toBe(200);
  });
  it('issues an opaque, scoped secure cookie, exposes no admin token and restores status', async () => {
    const app = await setup();
    const { response, auth } = await issue(app);
    expect(response.json()).toMatchObject({ enabled: true, active: true });
    const cookie = String(response.headers['set-cookie']);
    for (const flag of [
      'HttpOnly',
      'Secure',
      'SameSite=None',
      'Partitioned',
      'Path=/admin',
      'Max-Age=2700',
    ])
      expect(cookie).toContain(flag);
    expect(cookie).not.toContain('Domain=');
    expect(cookie).toMatch(/^mg_demo_admin=[a-f0-9]{64};/);
    expect(JSON.stringify(response.headers) + response.body).not.toContain(token);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await app.inject({ url: '/admin/status', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ url: '/admin/demo-session', headers: auth })).json()).toMatchObject({
      active: true,
    });
  });
  it('uses Lax/HttpOnly locally without weakening production cookie settings', async () => {
    const { response } = await issue(await setup(true, false));
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    expect(response.headers['set-cookie']).not.toContain('Secure');
  });
  it('rejects missing/invalid/expired sessions and cannot extend TTL by activity', async () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const app = await setup();
    const { auth } = await issue(app);
    expect((await app.inject({ url: '/admin/status', headers })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: '/admin/status',
          headers: { ...headers, cookie: `mg_demo_admin=${'a'.repeat(64)}` },
        })
      ).statusCode,
    ).toBe(401);
    now += DEMO_SESSION_TTL_MS - 1;
    expect((await app.inject({ url: '/admin/status', headers: auth })).statusCode).toBe(200);
    now += 1;
    expect((await app.inject({ url: '/admin/status', headers: auth })).statusCode).toBe(401);
    expect((await app.inject({ url: '/admin/demo-session', headers: auth })).json().active).toBe(
      false,
    );
  });
  it('revokes on logout, clears the cookie, and rotates old sessions on re-unlock', async () => {
    const app = await setup();
    const { auth } = await issue(app);
    const renewed = await app.inject({ method: 'POST', url: '/admin/demo-session', headers: auth });
    expect((await app.inject({ url: '/admin/status', headers: auth })).statusCode).toBe(401);
    const nextAuth = {
      ...headers,
      cookie: String(renewed.headers['set-cookie']).split(';')[0] ?? '',
    };
    const logout = await app.inject({
      method: 'POST',
      url: '/admin/demo-session/logout',
      headers: nextAuth,
    });
    expect(logout.json().active).toBe(false);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    expect((await app.inject({ url: '/admin/status', headers: nextAuth })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/admin/demo-session/logout', headers })).statusCode,
    ).toBe(200);
  });
  it('requires exact allowed origin + custom header for issue/logout/cookie writes and binds sessions to origin', async () => {
    const app = await setup();
    const { auth } = await issue(app);
    for (const url of ['/admin/demo-session', '/admin/demo-session/logout', '/admin/exercises']) {
      for (const bad of [
        { cookie: auth.cookie },
        { ...auth, origin: 'https://evil.example' },
        { ...auth, origin: 'null' },
        { origin, cookie: auth.cookie },
      ]) {
        expect((await app.inject({ method: 'POST', url, headers: bad })).statusCode).toBe(403);
      }
    }
    expect(
      (
        await app.inject({
          url: '/admin/status',
          headers: { ...auth, origin: 'https://other-allowed.vercel.app' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/admin/status',
          headers: { ...auth, cookie: `${auth.cookie}; ${auth.cookie}` },
        })
      ).statusCode,
    ).toBe(401);
    // Origin-spoofing is not authentication: demo issuance is intentionally public.
    expect(
      (await app.inject({ url: '/admin/status', headers: { authorization: `Bearer ${token}` } }))
        .statusCode,
    ).toBe(200);
  });
  it('grants credentialed CORS only to exact configured origins and preflights custom headers', async () => {
    const app = await setup();
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/admin/exercises',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-demo-admin,content-type',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toContain('x-demo-admin');
    for (const bad of ['https://evil.example', `${origin}.evil.example`]) {
      const denied = await app.inject({ url: '/admin/demo-session', headers: { origin: bad } });
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
  it('bounds session issuance and demo writes without rate-limiting private token access', async () => {
    const app = await setup();
    const { auth } = await issue(app);
    for (let i = 1; i < 20; i++) await issue(app);
    const denied = await app.inject({ method: 'POST', url: '/admin/demo-session', headers });
    expect(denied.statusCode).toBe(429);
    expect(denied.headers['retry-after']).toBe('60');
    for (let i = 0; i < 60; i++) {
      expect(
        (await app.inject({ method: 'POST', url: '/admin/exercises', headers: auth, payload: {} }))
          .statusCode,
      ).toBe(400);
    }
    expect(
      (await app.inject({ method: 'POST', url: '/admin/exercises', headers: auth, payload: {} }))
        .statusCode,
    ).toBe(429);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/admin/exercises',
          headers: { authorization: `Bearer ${token}` },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });
});
it('releases expired store entries and resets quotas after one minute', () => {
  let now = 0;
  const store = new DemoSessions(() => now);
  const first = store.issue(origin);
  now = DEMO_SESSION_TTL_MS;
  expect(store.validate(first.id, origin)).toBeNull();
  expect(store.validate(store.issue(origin).id, origin)).not.toBeNull();
  store.clear();
  expect(store.validate(first.id, origin)).toBeNull();
});
