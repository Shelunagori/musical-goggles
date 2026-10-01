import type { FastifyInstance } from 'fastify';
import type { HealthResponse, ReadinessResponse } from '@mg/shared';
import type { CurriculumRepository } from '../curriculum/repository';

export function healthRoutes(app: FastifyInstance, deps: { repo: CurriculumRepository }): void {
  // Liveness: process is up. Must stay cheap and DB-independent (Render health check).
  app.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

  // Readiness: can we actually serve curriculum?
  app.get('/health/ready', async (request, reply): Promise<ReadinessResponse> => {
    const started = performance.now();
    try {
      await deps.repo.ping();
      return {
        status: 'ok',
        database: 'ok',
        database_latency_ms: Math.round(performance.now() - started),
      };
    } catch (err) {
      request.log.warn({ err }, 'readiness: database unavailable');
      reply.code(503);
      return { status: 'degraded', database: 'unavailable', database_latency_ms: null };
    }
  });
}
