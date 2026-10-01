import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Lets TEST_DATABASE_URL live in apps/api/.env for local runs.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Integration tests share one database; run files serially.
    fileParallelism: false,
  },
});
