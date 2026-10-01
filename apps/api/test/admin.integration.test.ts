import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  CurriculumResponseSchema,
  MutationResponseSchema,
  SearchResponseSchema,
  type ExerciseInput,
} from '@mg/shared';
import { buildApp } from '../src/app';
import { PgAdminRepository } from '../src/admin/repository';
import { PgCurriculumRepository } from '../src/curriculum/repository';
import { SearchService } from '../src/search/service';

const url = process.env.TEST_DATABASE_URL;
const token = 'phase5-integration-token-not-a-secret';

const suffix = randomUUID().replaceAll('-', '');
const exercise: ExerciseInput = {
  slug: `admin_${suffix}`,
  name: `Admin ${suffix}`,
  frenchTerm: null,
  germanTerm: null,
  level: 'beginner',
  category: 'barre',
  description: 'Test fixture',
  aliases: [{ alias: `alias${suffix}`, language: 'en' }],
};
const correction = {
  slug: 'quiet_ankle',
  errorName: `Wobble${suffix}`,
  description: '',
  correction: 'Stabilise the supporting ankle',
  cuePhrase: 'Quiet ankle',
  detector: null,
};
describe.skipIf(!url).each(['manual', 'demo'] as const)(
  'admin CRUD against real PostgreSQL (%s)',
  (mode) => {
    const ids: string[] = [];
    let headers: Record<string, string> = { authorization: `Bearer ${token}` };
    let pool: pg.Pool;
    let app: FastifyInstance;
    let repo: PgAdminRepository;
    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: url, max: 2 });
      repo = new PgAdminRepository(pool);
      app = await buildApp({
        repo: new PgCurriculumRepository(pool),
        adminRepo: repo,
        adminToken: token,
        demoAdminEnabled: mode === 'demo',
        search: new SearchService(pool),
        corsOrigins: ['http://localhost:3100'],
      });
      if (mode === 'demo') {
        const session = await app.inject({
          method: 'POST',
          url: '/admin/demo-session',
          headers: { origin: 'http://localhost:3100', 'x-demo-admin': '1' },
        });
        expect(session.statusCode).toBe(200);
        headers = {
          origin: 'http://localhost:3100',
          'x-demo-admin': '1',
          cookie: String(session.headers['set-cookie']).split(';')[0] ?? '',
        };
      }
    });
    afterAll(async () => {
      for (const id of ids) await pool.query('delete from public.exercises where id=$1', [id]);
      await app.close();
      await pool.end();
    });
    it('requires admin authorization for every write and status request', async () => {
      for (const [method, path] of [
        ['GET', '/admin/status'],
        ['POST', '/admin/exercises'],
        ['PUT', `/admin/exercises/${randomUUID()}`],
        ['POST', `/admin/exercises/${randomUUID()}/corrections`],
        ['PUT', `/admin/corrections/${randomUUID()}`],
        ['DELETE', `/admin/corrections/${randomUUID()}`],
      ] as const) {
        expect((await app.inject({ method, url: path })).statusCode).toBe(401);
        expect(
          (await app.inject({ method, url: path, headers: { authorization: 'Bearer wrong' } }))
            .statusCode,
        ).toBe(401);
      }
      const status = await app.inject({ url: '/admin/status', headers });
      expect(status.statusCode).toBe(200);
      expect(status.headers['cache-control']).toBe('no-store');
    });
    it('creates, edits, searches and deletes shared correction records with trigger-managed vectors', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/admin/exercises',
        headers,
        payload: exercise,
      });
      expect(created.statusCode).toBe(201);
      const exId = MutationResponseSchema.parse(created.json()).id;
      ids.push(exId);
      const make = await app.inject({
        method: 'POST',
        url: `/admin/exercises/${exId}/corrections`,
        headers,
        payload: correction,
      });
      expect(make.statusCode).toBe(201);
      const coId = MutationResponseSchema.parse(make.json()).id;
      const search = async (query: string) =>
        SearchResponseSchema.parse(
          (await app.inject({ method: 'POST', url: '/search', payload: { query } })).json(),
        );
      expect((await search(`Wobble${suffix}`)).results[0]?.correction.id).toBe(coId);
      const stored = await pool.query(
        'select embedding,embedding_model,searchable_text,search_tsv from public.corrections where id=$1',
        [coId],
      );
      expect(stored.rows[0]).toMatchObject({ embedding: null, embedding_model: null });
      expect(stored.rows[0].search_tsv).not.toBe('');
      await pool.query(
        `update public.corrections set embedding=array_fill(0.1::real,array[384])::extensions.vector,embedding_model='test' where id=$1`,
        [coId],
      );
      // Identical exercise terms/aliases must preserve an existing vector.
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/exercises/${exId}`,
            headers,
            payload: exercise,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await pool.query(
            'select embedding is not null as present from public.corrections where id=$1',
            [coId],
          )
        ).rows[0].present,
      ).toBe(true);
      const detector = {
        type: 'geometric',
        rule: 'knee_alignment',
        threshold: 0.06,
        min_duration_ms: 300,
      };
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/corrections/${coId}`,
            headers,
            payload: { ...correction, detector },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await pool.query(
            'select embedding is not null as present from public.corrections where id=$1',
            [coId],
          )
        ).rows[0].present,
      ).toBe(true);
      const edited = { ...correction, cuePhrase: `Newcue${suffix}`, detector };
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/corrections/${coId}`,
            headers,
            payload: edited,
          })
        ).statusCode,
      ).toBe(200);
      const found = (await search(`Newcue${suffix}`)).results[0]?.correction;
      expect(found).toMatchObject({
        id: coId,
        cuePhrase: edited.cuePhrase,
        hasEmbedding: false,
        detector,
      });
      const curriculum = CurriculumResponseSchema.parse((await app.inject('/curriculum')).json());
      expect(curriculum.exercises.find((e) => e.id === exId)?.corrections[0]).toEqual(found);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/exercises/${exId}`,
            headers,
            payload: {
              ...exercise,
              name: `Renamed ${suffix}`,
              aliases: [{ alias: `changed${suffix}`, language: 'de' }],
            },
          })
        ).statusCode,
      ).toBe(200);
      expect((await search(`changed${suffix}`)).query.detectedExercise?.id).toBe(exId);
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/corrections/${coId}`, headers }))
          .statusCode,
      ).toBe(200);
      expect((await search(`Newcue${suffix}`)).results).toEqual([]);
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/corrections/${coId}`, headers }))
          .statusCode,
      ).toBe(404);
    });
    it('reports conflicts/invalid input/not-found and rejects raw vectors or invalid detectors', async () => {
      const made = await app.inject({
        method: 'POST',
        url: '/admin/exercises',
        headers,
        payload: { ...exercise, slug: `conflict_${suffix}` },
      });
      const exId = MutationResponseSchema.parse(made.json()).id;
      ids.push(exId);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/exercises',
            headers,
            payload: { ...exercise, slug: `conflict_${suffix}` },
          })
        ).statusCode,
      ).toBe(409);
      for (const bad of [
        { ...correction, embedding: [1] },
        { ...correction, detector: { type: 'geometric', rule: 'knee_alignment', threshold: 0 } },
        { ...correction, cuePhrase: '' },
      ])
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/admin/exercises/${exId}/corrections`,
              headers,
              payload: bad,
            })
          ).statusCode,
        ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/exercises',
            headers: { ...headers, 'content-type': 'application/json' },
            payload: '{bad',
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/exercises/not-a-uuid',
            headers,
            payload: exercise,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/exercises/${randomUUID()}`,
            headers,
            payload: exercise,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/admin/exercises/${randomUUID()}/corrections`,
            headers,
            payload: correction,
          })
        ).statusCode,
      ).toBe(404);
    });
    it('rolls back the entire exercise write when an alias insert fails', async () => {
      const slug = `rollback_${suffix}`;
      await expect(
        repo.saveExercise({
          ...exercise,
          slug,
          aliases: [{ alias: 'invalid language', language: 'invalid' as 'en' }],
        }),
      ).rejects.toThrow();
      expect(
        (await pool.query('select id from public.exercises where slug=$1', [slug])).rowCount,
      ).toBe(0);
    });
    it('disables admin if no token is configured', async () => {
      const disabled = await buildApp({
        repo: new PgCurriculumRepository(pool),
        adminRepo: repo,
        corsOrigins: [],
      });
      try {
        expect(
          (
            await disabled.inject({
              method: 'POST',
              url: '/admin/exercises',
              headers,
              payload: exercise,
            })
          ).statusCode,
        ).toBe(503);
      } finally {
        await disabled.close();
      }
    });
  },
);
