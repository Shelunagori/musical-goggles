import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ExerciseInputSchema, CorrectionInputSchema } from '@mg/shared';
import type { PgAdminRepository } from '../admin/repository';
import { AppError } from '../errors';
import { DemoSessions, demoCookie, demoCookieId, requireDemoOrigin } from '../admin/demo-session';

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'BAD_REQUEST',
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; '),
      400,
    );
  return result.data;
}
export async function adminRoutes(
  app: FastifyInstance,
  deps: {
    adminRepo?: PgAdminRepository;
    adminToken?: string;
    demoAdminEnabled?: boolean;
    production?: boolean;
    corsOrigins: string[];
  },
) {
  const sessions = new DemoSessions();
  const enabled = Boolean(deps.demoAdminEnabled && deps.adminRepo);
  const production = deps.production ?? true;
  app.addHook('onClose', async () => sessions.clear());
  app.get('/admin/demo-session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session =
      enabled &&
      request.headers['x-demo-admin'] === '1' &&
      deps.corsOrigins.includes(request.headers.origin ?? '')
        ? sessions.validate(demoCookieId(request), request.headers.origin ?? '')
        : null;
    return { enabled, active: Boolean(session), expiresAt: session ? session.expiresAt : null };
  });
  app.post('/admin/demo-session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!enabled) throw new AppError('ADMIN_DISABLED', 'Demo admin is disabled.', 503);
    const origin = requireDemoOrigin(request, deps.corsOrigins);
    reply.header('Retry-After', '60');
    const session = sessions.issue(origin);
    reply.removeHeader('Retry-After');
    sessions.revoke(demoCookieId(request));
    reply.header('Set-Cookie', demoCookie(session.id, production));
    return { enabled, active: true, expiresAt: session.expiresAt };
  });
  app.post('/admin/demo-session/logout', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    requireDemoOrigin(request, deps.corsOrigins);
    sessions.revoke(demoCookieId(request));
    reply.header('Set-Cookie', demoCookie('', production));
    return { enabled, active: false, expiresAt: null };
  });
  await app.register(
    async (admin) => {
      admin.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!deps.adminRepo || (!deps.adminToken && !enabled))
          throw new AppError('ADMIN_DISABLED', 'Admin writes are disabled on this API.', 503);
        const supplied = request.headers.authorization ?? '';
        const hash = (text: string) => createHash('sha256').update(text).digest();
        if (deps.adminToken && timingSafeEqual(hash(supplied), hash(`Bearer ${deps.adminToken}`)))
          return;
        if (enabled && demoCookieId(request)) {
          const origin = requireDemoOrigin(request, deps.corsOrigins);
          if (sessions.validate(demoCookieId(request), origin)) {
            if (request.method !== 'GET') {
              reply.header('Retry-After', '60');
              sessions.limit('write');
              reply.removeHeader('Retry-After');
            }
            return;
          }
        }
        throw new AppError(
          'UNAUTHORIZED',
          'Admin access is missing or expired. Unlock admin again.',
          401,
        );
      });
      admin.get('/status', async () => ({ status: 'ok' }));
      const id = (params: unknown) => parse(z.object({ id: z.uuid() }), params).id;
      admin.post('/exercises', async (request, reply) => {
        const saved = await deps.adminRepo?.saveExercise(parse(ExerciseInputSchema, request.body));
        return reply.code(201).send({ id: saved });
      });
      admin.put('/exercises/:id', async (request) => ({
        id: await deps.adminRepo?.saveExercise(
          parse(ExerciseInputSchema, request.body),
          id(request.params),
        ),
      }));
      admin.post('/exercises/:id/corrections', async (request, reply) => {
        const saved = await deps.adminRepo?.saveCorrection(
          parse(CorrectionInputSchema, request.body),
          { exerciseId: id(request.params) },
        );
        return reply.code(201).send({ id: saved });
      });
      admin.put('/corrections/:id', async (request) => ({
        id: await deps.adminRepo?.saveCorrection(parse(CorrectionInputSchema, request.body), {
          id: id(request.params),
        }),
      }));
      admin.delete('/corrections/:id', async (request) => ({
        id: await deps.adminRepo?.deleteCorrection(id(request.params)),
      }));
    },
    { prefix: '/admin' },
  );
}
