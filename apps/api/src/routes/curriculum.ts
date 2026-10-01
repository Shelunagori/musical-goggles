import type { FastifyInstance } from 'fastify';
import { SlugSchema } from '@mg/taxonomy';
import type { CurriculumResponse, ExerciseResponse } from '@mg/shared';
import { AppError, notFound } from '../errors';
import { buildCurriculum, toCurriculumResponse } from '../curriculum/mapping';
import type { CurriculumRepository } from '../curriculum/repository';

export function curriculumRoutes(app: FastifyInstance, deps: { repo: CurriculumRepository }): void {
  app.get('/curriculum', async (request): Promise<CurriculumResponse> => {
    const rows = await deps.repo.listCurriculum();
    const { exercises, warnings } = buildCurriculum(rows);
    for (const w of warnings) request.log.warn(w, 'curriculum: invalid detector config');
    return toCurriculumResponse(exercises);
  });

  app.get<{ Params: { slug: string } }>(
    '/exercises/:slug',
    async (request): Promise<ExerciseResponse> => {
      const slug = SlugSchema.safeParse(request.params.slug);
      if (!slug.success) throw new AppError('BAD_REQUEST', 'Exercise slug must be snake_case', 400);
      const rows = await deps.repo.getExerciseBySlug(slug.data);
      if (!rows) throw notFound(`Exercise "${slug.data}"`);
      const { exercises, warnings } = buildCurriculum(rows);
      for (const w of warnings) request.log.warn(w, 'curriculum: invalid detector config');
      const exercise = exercises[0];
      if (!exercise) throw notFound(`Exercise "${slug.data}"`);
      return { exercise };
    },
  );
}
