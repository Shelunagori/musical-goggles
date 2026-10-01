// Run after building, with ADMIN_API_TOKEN supplied only in this process's environment.
// Output reports paths/counts, never the credential value.
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secret = process.env.ADMIN_API_TOKEN;
if (!secret || secret.length < 32)
  throw new Error('Supply a server-only ADMIN_API_TOKEN for the leak check.');
await stat(resolve(root, '.next/BUILD_ID')); // A completed production build is required.
let files = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) {
      files++;
      const content = await readFile(path);
      if (
        [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')].some((value) =>
          content.includes(value),
        )
      )
        throw new Error(`Admin credential leaked into frontend file: ${path}`);
    }
  }
}
await scan(resolve(root, 'src'));
await scan(resolve(root, '.next'));
process.stdout.write(`Admin credential absent from ${files} frontend source/build files.\n`);
