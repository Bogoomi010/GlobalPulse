import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrations } from './migrations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistTo = process.argv[2] || '.wrangler/state';
const wranglerBin = path.join(root, 'node_modules', '.bin', 'wrangler');

for (const migration of migrations) {
  execFileSync(
    wranglerBin,
    ['d1', 'execute', 'DB', '--local', '--persist-to', persistTo, '--file', migration],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
}
