import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerPath = path.join(root, 'wrangler.toml');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');

const commonRequiredEnv = [
  'SESSION_TOKEN_SECRET',
  'AUTH_PROVIDER',
  'RESEND_API_KEY',
  'AUTH_EMAIL_FROM',
  'MODERATION_ADMIN_TOKEN',
  'APP_PUBLIC_ORIGIN',
  'LAUNCH_REVIEW_ACK',
];

const forbiddenPaymentEnv = [
  'PAYMENT_PROVIDER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TOSS_CLIENT_KEY',
  'TOSS_SECRET_KEY',
  'TOSS_WEBHOOK_SECRET',
  'VITE_TOSS_CLIENT_KEY',
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

for (const key of commonRequiredEnv) {
  if (!process.env[key]) failures.push(`${key} must be set in the deployment environment.`);
}

for (const key of forbiddenPaymentEnv) {
  if (process.env[key]) {
    failures.push(`${key} must be removed because GlobalPulse no longer accepts payments.`);
  }
}

const sessionSecret = process.env.SESSION_TOKEN_SECRET || '';
const authProvider = process.env.AUTH_PROVIDER || '';
const authEmailDelivery = process.env.AUTH_EMAIL_DELIVERY || '';
const resendApiKey = process.env.RESEND_API_KEY || '';
const authEmailFrom = process.env.AUTH_EMAIL_FROM || '';
const allowDemoLogin = process.env.ALLOW_DEMO_LOGIN || '';
const moderationAdminToken = process.env.MODERATION_ADMIN_TOKEN || '';
const appPublicOrigin = process.env.APP_PUBLIC_ORIGIN || '';
const launchReviewAck = process.env.LAUNCH_REVIEW_ACK || '';

if (sessionSecret && sessionSecret.length < 32) {
  failures.push('SESSION_TOKEN_SECRET must be at least 32 characters.');
}

if (sessionSecret && /local|dev|smoke|replace|secret/i.test(sessionSecret)) {
  failures.push('SESSION_TOKEN_SECRET must not use local/dev/smoke/placeholder wording.');
}

if (moderationAdminToken && moderationAdminToken.length < 32) {
  failures.push('MODERATION_ADMIN_TOKEN must be at least 32 characters.');
}

if (moderationAdminToken && /local|dev|smoke|replace|secret|placeholder/i.test(moderationAdminToken)) {
  failures.push('MODERATION_ADMIN_TOKEN must not use local/dev/smoke/placeholder wording.');
}

if (appPublicOrigin) {
  try {
    const url = new URL(appPublicOrigin);
    if (url.protocol !== 'https:') {
      failures.push('APP_PUBLIC_ORIGIN must use https for production.');
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      failures.push('APP_PUBLIC_ORIGIN must be an origin only, without path, query, or hash.');
    }
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
      failures.push('APP_PUBLIC_ORIGIN must not point to a local development host.');
    }
  } catch {
    failures.push('APP_PUBLIC_ORIGIN must be a valid URL origin.');
  }
}

if (launchReviewAck && launchReviewAck !== 'GLOBALPULSE_LAUNCH_REVIEW_COMPLETE') {
  failures.push(
    'LAUNCH_REVIEW_ACK must be set to GLOBALPULSE_LAUNCH_REVIEW_COMPLETE after operator launch review.',
  );
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
      'GlobalPulse cannot be deployed until these items are fixed:',
      ...failures.map((failure) => `- ${failure}`),
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Production readiness check passed.');
