import fs from 'node:fs';
import { URL } from 'node:url';

const defaultProjectName = 'globalpulse-pages';
const projectJsonPath = readOption('--project-json');
const accountId = readOption('--account-id') || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const apiToken = readOption('--api-token') || process.env.CLOUDFLARE_API_TOKEN || '';
const projectName =
  readOption('--project-name') ||
  process.env.CLOUDFLARE_PAGES_PROJECT_NAME ||
  process.env.CLOUDFLARE_PAGES_PROJECT ||
  defaultProjectName;

const requiredProductionEnv = [
  'SESSION_TOKEN_SECRET',
  'MODERATION_ADMIN_TOKEN',
  'AUTH_PROVIDER',
  'RESEND_API_KEY',
  'AUTH_EMAIL_FROM',
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

const project = projectJsonPath ? readProjectJson(projectJsonPath) : await fetchProject();
const result = project?.result ?? project;

if (!result || typeof result !== 'object') {
  throw new Error('Cloudflare project response is missing a result object.');
}

const productionNames = envNames(result.deployment_configs?.production?.env_vars);
const previewNames = envNames(result.deployment_configs?.preview?.env_vars);
const topLevelNames = envNames(result.env_vars);
const latestDeploymentNames = envNames(result.latest_deployment?.env_vars);
const allNames = new Set([...productionNames, ...previewNames, ...topLevelNames, ...latestDeploymentNames]);

const missingProduction = requiredProductionEnv.filter((name) => !productionNames.has(name));
const forbiddenPresent = forbiddenPaymentEnv.filter((name) => allNames.has(name));

console.log(
  [
    'Cloudflare Pages secret audit:',
    `- Project: ${projectName}`,
    `- Production variable names: ${productionNames.size}`,
    `- Preview variable names: ${previewNames.size}`,
    `- Top-level variable names: ${topLevelNames.size}`,
    `- Latest deployment variable names: ${latestDeploymentNames.size}`,
    `- Required production variables present: ${requiredProductionEnv.length - missingProduction.length}/${requiredProductionEnv.length}`,
    `- Forbidden legacy payment variables present: ${forbiddenPresent.length ? forbiddenPresent.join(', ') : 'none'}`,
  ].join('\n'),
);

const failures = [];

if (missingProduction.length) {
  failures.push(`Missing required production variables: ${missingProduction.join(', ')}`);
}

if (forbiddenPresent.length) {
  failures.push(`Remove forbidden legacy payment variables: ${forbiddenPresent.join(', ')}`);
}

if (failures.length) {
  console.error(['Cloudflare Pages secret audit failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'));
  process.exit(1);
}

console.log('Cloudflare Pages secret audit passed.');

function envNames(envVars) {
  if (!envVars || typeof envVars !== 'object') return new Set();
  return new Set(Object.keys(envVars));
}

function readOption(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function readProjectJson(pathname) {
  const raw = pathname === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(pathname, 'utf8');
  return JSON.parse(raw);
}

async function fetchProject() {
  if (!accountId) {
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID or pass --account-id.');
  }

  if (!apiToken) {
    throw new Error('Set CLOUDFLARE_API_TOKEN or pass --api-token.');
  }

  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
  );
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await response.json();

  if (!response.ok || body?.success === false) {
    const details = Array.isArray(body?.errors)
      ? body.errors.map((error) => error.message).filter(Boolean).join('; ')
      : '';
    throw new Error(`Cloudflare Pages project fetch failed with ${response.status}${details ? `: ${details}` : ''}.`);
  }

  return body;
}
