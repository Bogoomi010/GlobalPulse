import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistTo = process.argv[2] || '.wrangler/state';
const wranglerBin = path.join(root, 'node_modules', '.bin', 'wrangler');

const migrations = [
  'migrations/0001_globalpulse_schema.sql',
  'migrations/0002_payment_plans_seed.sql',
  'migrations/0003_issues_seed.sql',
  'migrations/0004_user_sessions.sql',
  'migrations/0005_email_login_codes.sql',
  'migrations/0006_comment_report_uniqueness.sql',
  'migrations/0007_comment_report_reviews.sql',
];

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
