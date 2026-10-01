import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ExerciseInputSchema, CorrectionInputSchema } from '@mg/shared';
import type { PgAdminRepository } from '../admin/repository';
import { AppError } from '../errors';

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
  deps: { adminRepo?: PgAdminRepository; adminToken?: string },
) {
  await app.register(
    async (admin) => {
      admin.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!deps.adminRepo || !deps.adminToken)
          throw new AppError(
            'ADMIN_DISABLED',
            'Admin writes are disabled. Configure ADMIN_API_TOKEN on the API server.',
            503,
          );
        const supplied = request.headers.authorization ?? '';
        const hash = (text: string) => createHash('sha256').update(text).digest();
        if (!timingSafeEqual(hash(supplied), hash(`Bearer ${deps.adminToken}`)))
          throw new AppError('UNAUTHORIZED', 'Admin token is missing or invalid.', 401);
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
