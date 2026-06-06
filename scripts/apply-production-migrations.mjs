import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrations } from './migrations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerPath = path.join(root, 'wrangler.toml');
const wranglerBin = path.join(root, 'node_modules', '.bin', 'wrangler');
const dryRun = process.argv.includes('--dry-run');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');
const databaseName = wrangler.match(/database_name\s*=\s*"([^"]+)"/)?.[1] ?? '';
const databaseId = wrangler.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? '';
const confirmation = process.env.CONFIRM_PRODUCTION_MIGRATIONS || '';

console.log('GlobalPulse production D1 migrations:');
for (const migration of migrations) {
  console.log(`- ${migration}`);
}

if (dryRun) {
  console.log('Dry run only. No remote D1 commands were executed.');
  process.exit(0);
}

if (!databaseName) {
  throw new Error('wrangler.toml must include database_name before applying production migrations.');
}

if (!databaseId || databaseId === 'REPLACE_WITH_PRODUCTION_D1_DATABASE_ID') {
  throw new Error('Replace wrangler.toml database_id with the production D1 database UUID first.');
}

if (confirmation !== databaseName) {
  throw new Error(
    `Set CONFIRM_PRODUCTION_MIGRATIONS=${databaseName} to apply migrations to the remote D1 database.`,
  );
}

for (const migration of migrations) {
  execFileSync(wranglerBin, ['d1', 'execute', 'DB', '--remote', '--file', migration], {
    cwd: root,
    stdio: 'inherit',
  });
}

console.log('Production D1 migrations applied.');
