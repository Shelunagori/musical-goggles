import { adminRoutes } from './routes/admin';
import type { PgAdminRepository } from './admin/repository';
import { randomUUID } from 'node:crypto';
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import { voiceRoutes } from './routes/voice';
import { deepgramFactory, type SpeechFactory } from './voice/deepgram';
import type { SearchService } from './search/service';
import type { ApiErrorBody } from '@mg/shared';
import { AppError, classifyDatabaseError } from './errors';
import type { CurriculumRepository } from './curriculum/repository';
import { healthRoutes } from './routes/health';
import { curriculumRoutes } from './routes/curriculum';

export interface AppDeps {
  repo: CurriculumRepository;
  adminRepo?: PgAdminRepository;
  adminToken?: string;
  demoAdminEnabled?: boolean;
  production?: boolean;
  search?: SearchService;
  speechFactory?: SpeechFactory;
  corsOrigins: string[];
  logger?: FastifyServerOptions['logger'] | FastifyBaseLogger;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function buildLoggerOptions(level: string, pretty: boolean): FastifyServerOptions['logger'] {
  return {
    level,
    // Never log bodies (Phase 2 audio) or credentials.
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
    // Database errors can include row values, credentials or connection strings.
    serializers: {
      err: (error: unknown) => ({
        type: 'Error',
        message: 'Error details omitted; correlate the safe code with the request ID.',
        stack: '',
        code:
          typeof (error as { code?: unknown })?.code === 'string' &&
          /^[A-Z0-9_]{2,40}$/.test((error as { code: string }).code)
            ? (error as { code: string }).code
            : 'UNCLASSIFIED',
      }),
    },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } } }
      : {}),
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const loggerOpt =
    deps.logger && typeof deps.logger === 'object' && 'child' in deps.logger
      ? { loggerInstance: deps.logger as FastifyBaseLogger }
      : { logger: (deps.logger as FastifyServerOptions['logger']) ?? false };

  const app = Fastify({
    ...loggerOpt,
    // Default per-request logs replaced by one structured line per request (onResponse below).
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'request_id',
    }),
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  });

  await app.register(cors, {
    origin: deps.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id'],
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        route: request.routeOptions.url ?? 'unmatched',
        method: request.method,
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime * 10) / 10,
      },
      'request completed',
    );
  });

  app.setErrorHandler((err, request, reply) => {
    const appError =
      err instanceof AppError
        ? err
        : (classifyDatabaseError(err) ??
          ((err as { statusCode?: number }).statusCode === 400
            ? new AppError('BAD_REQUEST', 'Request body is malformed or invalid.', 400)
            : (err as { validation?: unknown }).validation
              ? new AppError('BAD_REQUEST', (err as Error).message, 400)
              : new AppError('INTERNAL', 'Unexpected server error', 500)));

    const route = request.routeOptions.url;
    if (appError.statusCode >= 500) {
      request.log.error({ err, error_code: appError.code, route }, 'request failed');
    } else {
      request.log.info(
        { error: appError.message, error_code: appError.code, route },
        'request rejected',
      );
    }

    const body: ApiErrorBody = {
      error: { code: appError.code, message: appError.message, requestId: request.id },
    };
    void reply.code(appError.statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = {
      error: {
        code: 'NOT_FOUND',
        message: `No route for ${request.method} ${request.url}`,
        requestId: request.id,
      },
    };
    void reply.code(404).send(body);
  });

  if (deps.search)
    await voiceRoutes(app, deps.search, deps.speechFactory ?? deepgramFactory(), deps.corsOrigins);

  healthRoutes(app, deps);
  curriculumRoutes(app, deps);
  await adminRoutes(app, deps);

  return app;
}
