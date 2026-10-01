import { E5Provider } from '../src/search/embedding';
import { backfill } from '../src/search/backfill';
import { runCli, withDb } from './db-cli';
await runCli(async () => {
  await withDb(async (db) => {
    const provider = new E5Provider(process.env.EMBEDDING_ALLOW_DOWNLOAD === 'true');
    const counts = await backfill(db, provider);
    console.log(JSON.stringify({ ...counts, rssMiB: process.memoryUsage().rss / 1048576 }));
  });
});
