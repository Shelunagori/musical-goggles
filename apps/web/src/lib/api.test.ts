import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@mg/shared';
import { fetchJson } from './api';

const json = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

describe('fetchJson', () => {
  it('returns validated data', async () => {
    const r = await fetchJson('http://x', '/health', HealthResponseSchema, {
      fetchImpl: json(200, { status: 'ok' }),
    });
    expect(r).toEqual({ ok: true, data: { status: 'ok' } });
  });

  it('surfaces structured API errors with code and request id', async () => {
    const r = await fetchJson('http://x', '/curriculum', HealthResponseSchema, {
      fetchImpl: json(503, {
        error: { code: 'DATABASE_UNAVAILABLE', message: 'db down', requestId: 'r1' },
      }),
    });
    expect(r).toMatchObject({
      ok: false,
      kind: 'api_error',
      code: 'DATABASE_UNAVAILABLE',
      requestId: 'r1',
      status: 503,
    });
  });

  it('flags contract mismatches instead of rendering garbage', async () => {
    const r = await fetchJson('http://x', '/health', HealthResponseSchema, {
      fetchImpl: json(200, { status: 'nope' }),
    });
    expect(r).toMatchObject({ ok: false, kind: 'bad_response' });
  });

  it('reports an unreachable backend', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const r = await fetchJson('http://x', '/health', HealthResponseSchema, { fetchImpl: failing });
    expect(r).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('reports a timeout distinctly (Render free tier cold start)', async () => {
    const hanging = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )) as typeof fetch;
    const r = await fetchJson('http://x', '/health', HealthResponseSchema, {
      fetchImpl: hanging,
      timeoutMs: 20,
    });
    expect(r).toMatchObject({ ok: false, kind: 'timeout' });
  });

  it('handles non-JSON bodies', async () => {
    const html = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
    const r = await fetchJson('http://x', '/health', HealthResponseSchema, { fetchImpl: html });
    expect(r).toMatchObject({ ok: false, kind: 'bad_response', status: 502 });
  });
});
