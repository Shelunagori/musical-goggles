import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SearchResponseSchema } from '@mg/shared';
import { SearchService } from '../src/search/service';
import { backfill } from '../src/search/backfill';
import { E5Provider } from '../src/search/embedding';
import { buildApp } from '../src/app';
import { PgCurriculumRepository } from '../src/curriculum/repository';
import type { SpeechEvents } from '../src/voice/deepgram';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('real Phase 2 retrieval', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });
  it.each([
    ['common mistakes in demi plie', 'demi_plie', null],
    ['knees in during plie', 'demi_plie', 'knees_inward'],
    ['shoulders in port de bras', 'port_de_bras', 'shoulders_raised'],
    ['Schultern beim port de bras', 'port_de_bras', 'shoulders_raised'],
    ['heels coming up in plie', 'demi_plie', 'heels_lift'],
  ])('POST /search retrieves %s from PostgreSQL', async (query, slug, correction) => {
    const app = await buildApp({
      repo: new PgCurriculumRepository(pool),
      corsOrigins: [],
      search: new SearchService(pool),
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/search', payload: { query } });
      expect(response.statusCode).toBe(200);
      const data = SearchResponseSchema.parse(response.json());
      expect(data.mode).toBe('fts');
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.query.detectedExercise?.slug).toBe(slug);
      if (correction) expect(data.results[0]?.correction.slug).toBe(correction);
      expect(data.results.every((r) => !r.debug)).toBe(true);
    } finally {
      await app.close();
    }
  });
  it('falls back to FTS when the real local model cannot load', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'mg-empty-model-'));
    try {
      const result = await new SearchService(pool, new E5Provider(false, cache)).search(
        'knees in during plie',
      );
      expect(result.mode).toBe('fts');
      expect(result.results[0]?.correction.slug).toBe('knees_inward');
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  }, 30_000);
  it.skipIf(process.env.TEST_E5 !== 'true')(
    'merges real E5 and FTS ranks',
    async () => {
      const result = await new SearchService(pool, new E5Provider(), true).search(
        'knees in during plie',
      );
      expect(result.mode).toBe('hybrid');
      expect(
        result.results.some((r) => r.debug?.vectorRank !== null && r.debug?.textRank !== null),
      ).toBe(true);
      expect(result.results[0]?.correction.slug).toBe('knees_inward');
    },
    60_000,
  );
  it.skipIf(process.env.TEST_E5 !== 'true')(
    'backfill skips text edited while inference is running',
    async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          "update public.corrections set embedding = null, embedding_model = null where slug = 'knees_inward'",
        );
        const real = new E5Provider();
        const counts = await backfill(client, {
          model: real.model,
          async embed(text, kind) {
            const vector = await real.embed(text, kind);
            await client.query(
              "update public.corrections set cue_phrase = 'Changed during inference' where slug = 'knees_inward'",
            );
            return vector;
          },
        });
        expect(counts.examined).toBeGreaterThan(0);
        const row = await client.query<{ embedding: unknown; cue_phrase: string }>(
          "select embedding, cue_phrase from public.corrections where slug = 'knees_inward'",
        );
        expect(row.rows[0]).toEqual({ embedding: null, cue_phrase: 'Changed during inference' });
      } finally {
        await client.query('rollback');
        client.release();
      }
    },
    60_000,
  );
  it('validates requests and handles missing Deepgram on the real WebSocket route', async () => {
    const app = await buildApp({
      repo: new PgCurriculumRepository(pool),
      corsOrigins: [],
      search: new SearchService(pool),
    });
    await app.ready();
    try {
      expect(
        (await app.inject({ method: 'POST', url: '/search', payload: { query: '' } })).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/voice',
            headers: { origin: 'https://untrusted.example' },
          })
        ).statusCode,
      ).toBe(403);
      const malformed = await app.injectWS('/voice');
      const rejected = new Promise<string>((resolve) =>
        malformed.once('message', (raw) => resolve(raw.toString())),
      );
      malformed.send('{bad');
      expect(JSON.parse(await rejected)).toMatchObject({ type: 'error', code: 'BAD_MESSAGE' });
      malformed.close();
      const socket = await app.injectWS('/voice');
      const response = new Promise<string>((resolve) =>
        socket.once('message', (raw) => resolve(raw.toString())),
      );
      socket.send(JSON.stringify({ type: 'start', mimeType: 'audio/webm' }));
      expect(JSON.parse(await response)).toMatchObject({ type: 'error', code: 'STT_UNAVAILABLE' });
      socket.close();
    } finally {
      await app.close();
    }
  });
  it('connects final speech to real retrieval; interim speech never searches', async () => {
    let events: SpeechEvents | undefined;
    const app = await buildApp({
      repo: new PgCurriculumRepository(pool),
      corsOrigins: [],
      search: new SearchService(pool),
      speechFactory: (callbacks) => {
        events = callbacks;
        queueMicrotask(callbacks.ready);
        return {
          audio() {},
          stop() {
            callbacks.closed();
          },
          close() {},
        };
      },
    });
    await app.ready();
    try {
      const socket = await app.injectWS('/voice');
      const messages: { type: string; data?: unknown }[] = [];
      socket.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as { type: string }));
      const ready = new Promise((resolve) => socket.once('message', resolve));
      socket.send(JSON.stringify({ type: 'start', mimeType: 'audio/webm' }));
      await ready;
      events?.transcript('knees', false);
      expect(messages.some((m) => m.type === 'searching')).toBe(false);
      const result = new Promise<unknown>((resolve) =>
        socket.on('message', (raw) => {
          const m = JSON.parse(raw.toString()) as { type: string; data: unknown };
          if (m.type === 'results') resolve(m.data);
        }),
      );
      events?.utterance('knees in during plie');
      expect(SearchResponseSchema.parse(await result).results[0]?.correction.slug).toBe(
        'knees_inward',
      );
      socket.close();
    } finally {
      await app.close();
    }
  });
});
