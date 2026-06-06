import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerPath = path.join(root, 'wrangler.toml');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');

const requiredEnv = [
  'VITE_TOSS_CLIENT_KEY',
  'TOSS_CLIENT_KEY',
  'TOSS_SECRET_KEY',
  'TOSS_WEBHOOK_SECRET',
  'SESSION_TOKEN_SECRET',
  'PAYMENT_PROVIDER',
  'AUTH_PROVIDER',
  'RESEND_API_KEY',
  'AUTH_EMAIL_FROM',
];

const failures = [];
const warnings = [];

const databaseIdMatch = wrangler.match(/database_id\s*=\s*"([^"]+)"/);
const databaseNameMatch = wrangler.match(/database_name\s*=\s*"([^"]+)"/);
const databaseId = databaseIdMatch?.[1] ?? '';

if (!databaseNameMatch?.[1]) {
  failures.push('wrangler.toml must include a D1 database_name.');
}

if (!databaseId || databaseId === 'REPLACE_WITH_PRODUCTION_D1_DATABASE_ID') {
  failures.push('wrangler.toml database_id must be replaced with the production D1 database UUID.');
} else if (!/^[0-9a-f-]{32,36}$/i.test(databaseId)) {
  warnings.push('wrangler.toml database_id does not look like a UUID. Verify it before deployment.');
}

for (const key of requiredEnv) {
  if (!process.env[key]) failures.push(`${key} must be set in the deployment environment.`);
}

const viteClientKey = process.env.VITE_TOSS_CLIENT_KEY || '';
const serverClientKey = process.env.TOSS_CLIENT_KEY || '';
const secretKey = process.env.TOSS_SECRET_KEY || '';
const webhookSecret = process.env.TOSS_WEBHOOK_SECRET || '';
const tossApiBaseUrl = process.env.TOSS_API_BASE_URL || '';
const sessionSecret = process.env.SESSION_TOKEN_SECRET || '';
const provider = process.env.PAYMENT_PROVIDER || '';
const authProvider = process.env.AUTH_PROVIDER || '';
const authEmailDelivery = process.env.AUTH_EMAIL_DELIVERY || '';
const resendApiKey = process.env.RESEND_API_KEY || '';
const authEmailFrom = process.env.AUTH_EMAIL_FROM || '';
const allowDemoLogin = process.env.ALLOW_DEMO_LOGIN || '';

if (viteClientKey && !/^live_(ck|gck)_/.test(viteClientKey)) {
  failures.push('VITE_TOSS_CLIENT_KEY must be a Toss live client key for production deployment.');
}

if (serverClientKey && !/^live_(ck|gck)_/.test(serverClientKey)) {
  failures.push('TOSS_CLIENT_KEY must be a Toss live client key for production deployment.');
}

if (viteClientKey && serverClientKey && viteClientKey !== serverClientKey) {
  warnings.push('VITE_TOSS_CLIENT_KEY and TOSS_CLIENT_KEY differ. Confirm this is intentional.');
}

if (secretKey && !/^live_(sk|gsk)_/.test(secretKey)) {
  failures.push('TOSS_SECRET_KEY must be a Toss live secret key for production deployment.');
}

if (tossApiBaseUrl && tossApiBaseUrl.replace(/\/$/, '') !== 'https://api.tosspayments.com') {
  failures.push('TOSS_API_BASE_URL must not override the official Toss Payments API in production.');
}

if (webhookSecret && webhookSecret.length < 24) {
  failures.push('TOSS_WEBHOOK_SECRET must be at least 24 characters.');
}

if (sessionSecret && sessionSecret.length < 32) {
  failures.push('SESSION_TOKEN_SECRET must be at least 32 characters.');
}

if (sessionSecret && /local|dev|smoke|replace|secret/i.test(sessionSecret)) {
  failures.push('SESSION_TOKEN_SECRET must not use local/dev/smoke/placeholder wording.');
}

if (provider && provider !== 'toss') {
  failures.push('PAYMENT_PROVIDER must be set to "toss" for the current production payment adapter.');
}

if (authProvider && authProvider !== 'resend') {
  failures.push('AUTH_PROVIDER must be set to "resend" for verified production email login.');
}

if (allowDemoLogin === 'true') {
  failures.push('ALLOW_DEMO_LOGIN must not be enabled in production.');
}

if (authEmailDelivery === 'log') {
  failures.push('AUTH_EMAIL_DELIVERY=log must not be enabled in production.');
}

if (resendApiKey && !/^re_/.test(resendApiKey)) {
  warnings.push('RESEND_API_KEY does not use the usual Resend "re_" prefix. Verify it before deployment.');
}

if (authEmailFrom && !/.+<[^@\s]+@[^@\s]+\.[^@\s]+>$|^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authEmailFrom)) {
  failures.push('AUTH_EMAIL_FROM must be an email address or "Name <email@example.com>" sender.');
}

if (warnings.length) {
  console.warn(['Production readiness warnings:', ...warnings.map((warning) => `- ${warning}`)].join('\n'));
}

if (failures.length) {
  console.error(
    [
      'Production deployment is blocked.',
      'GlobalPulse cannot be deployed as a real-payment service until these items are fixed:',
      ...failures.map((failure) => `- ${failure}`),
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Production readiness check passed.');
