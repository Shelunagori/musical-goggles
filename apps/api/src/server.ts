import { PgAdminRepository } from './admin/repository';
import { SearchService } from './search/service';
import { E5Provider } from './search/embedding';
import { deepgramFactory } from './voice/deepgram';
import pino from 'pino';
import { buildApp, buildLoggerOptions } from './app';
import { createPool } from './db/pool';
import { EnvError, loadDotEnv, parseEnv } from './env';
import { PgCurriculumRepository } from './curriculum/repository';

async function main(): Promise<void> {
  loadDotEnv();
  let env;
  try {
    env = parseEnv(process.env);
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY;
  const logger = pino(buildLoggerOptions(env.LOG_LEVEL, pretty) as pino.LoggerOptions);

  const pool = createPool(env, (err) => logger.error({ err }, 'postgres idle client error'));
  const app = await buildApp({
    repo: new PgCurriculumRepository(pool),
    adminRepo: new PgAdminRepository(pool),
    adminToken: env.ADMIN_API_TOKEN,
    corsOrigins: env.CORS_ORIGINS,
    search: new SearchService(
      pool,
      env.EMBEDDING_ENABLED ? new E5Provider() : undefined,
      env.SEARCH_DEBUG,
    ),
    speechFactory: deepgramFactory(env.DEEPGRAM_API_KEY),
    logger,
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ phase2: { deepgram: Boolean(env.DEEPGRAM_API_KEY) } }, 'api ready');
}

main().catch((err: unknown) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
