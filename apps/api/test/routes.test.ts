import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ApiErrorBodySchema, CurriculumResponseSchema, ExerciseResponseSchema } from '@mg/shared';
import { buildApp } from '../src/app';
import { FakeRepo, connRefused, correction, plie } from './fixtures';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make(repo: FakeRepo) {
  app = await buildApp({ repo, corsOrigins: ['http://localhost:3000'] });
  return app;
}

const rows = () => ({
  exercises: [plie],
  corrections: [
    correction(1, { detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0.05 } }),
    correction(2),
  ],
});

describe('GET /health', () => {
  it('returns exactly {"status":"ok"} even when the DB is down', async () => {
    const res = await (await make(new FakeRepo(rows(), connRefused()))).inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('echoes a safe x-request-id and generates one otherwise', async () => {
    const a = await make(new FakeRepo(rows()));
    const echoed = await a.inject({ url: '/health', headers: { 'x-request-id': 'abc-123' } });
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await a.inject({
      url: '/health',
      headers: { 'x-request-id': 'bad id with spaces' },
    });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /health/ready', () => {
  it('ok when DB answers', async () => {
    const res = await (await make(new FakeRepo(rows()))).inject('/health/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });
  it('503 degraded when DB is down', async () => {
    const res = await (await make(new FakeRepo(rows(), connRefused()))).inject('/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'degraded',
      database: 'unavailable',
      database_latency_ms: null,
    });
  });
});

describe('GET /curriculum', () => {
  it('returns a contract-valid payload', async () => {
    const res = await (await make(new FakeRepo(rows()))).inject('/curriculum');
    expect(res.statusCode).toBe(200);
    const body = CurriculumResponseSchema.parse(res.json());
    expect(body.coverage).toEqual({ cameraDetectable: 1, total: 2 });
    expect(JSON.stringify(body)).not.toMatch(/embedding"/);
  });

  it('maps a DB outage to 503 DATABASE_UNAVAILABLE with request id', async () => {
    const res = await (await make(new FakeRepo(rows(), connRefused()))).inject('/curriculum');
    expect(res.statusCode).toBe(503);
    const body = ApiErrorBodySchema.parse(res.json());
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('hides internal error details as 500 INTERNAL', async () => {
    const res = await (
      await make(new FakeRepo(rows(), new Error('secret internal detail')))
    ).inject('/curriculum');
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatchObject({
      code: 'INTERNAL',
      message: 'Unexpected server error',
    });
  });
});

describe('GET /exercises/:slug', () => {
  it('returns one exercise', async () => {
    const res = await (await make(new FakeRepo(rows()))).inject('/exercises/demi_plie');
    expect(res.statusCode).toBe(200);
    expect(ExerciseResponseSchema.parse(res.json()).exercise.corrections).toHaveLength(2);
  });
  it('404 for unknown slug, 400 for malformed slug', async () => {
    const a = await make(new FakeRepo(rows()));
    expect((await a.inject('/exercises/grand_jete')).statusCode).toBe(404);
    const bad = await a.inject('/exercises/Demi-Plie');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('BAD_REQUEST');
  });
});

describe('unknown routes / CORS', () => {
  it('404 with error body', async () => {
    const res = await (await make(new FakeRepo(rows()))).inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(ApiErrorBodySchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });
  it('allows configured origin only', async () => {
    const a = await make(new FakeRepo(rows()));
    const ok = await a.inject({ url: '/health', headers: { origin: 'http://localhost:3000' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const other = await a.inject({ url: '/health', headers: { origin: 'https://evil.example' } });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
