import { E5Provider } from '../src/search/embedding';
const before = process.memoryUsage().rss;
const start = performance.now();
try {
  const provider = new E5Provider(process.env.EMBEDDING_ALLOW_DOWNLOAD === 'true');
  const vector = await provider.embed('knees in during plie', 'query');
  console.log(
    JSON.stringify({
      dimensions: vector.length,
      norm: Math.hypot(...vector),
      coldMs: performance.now() - start,
      baselineMiB: before / 1048576,
      rssMiB: process.memoryUsage().rss / 1048576,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
    }),
  );
} catch (error) {
  console.error(
    'Embedding measurement failed:',
    error instanceof Error ? error.message : 'unknown',
  );
  process.exitCode = 1;
}
