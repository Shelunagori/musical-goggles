import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source, so they are bundled in;
// npm dependencies stay external and are resolved from node_modules at runtime.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    migrate: 'scripts/migrate.ts',
    seed: 'scripts/seed.ts',
    embed: 'scripts/embed.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@mg\//],
});
