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
const apply = process.argv.includes('--apply');
const confirmDelete =
  readOption('--confirm-delete-legacy-payment-secrets') ||
  process.env.CONFIRM_CLOUDFLARE_LEGACY_SECRET_DELETE ||
  '';

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

const plan = cleanupPlan(result);
printPlan(plan);

if (!plan.total) {
  console.log('No configurable legacy payment variables found.');
  process.exit(0);
}

if (!apply) {
  console.log(
    [
      'Dry run only. No Cloudflare settings were changed.',
      `To apply, rerun with --apply and CONFIRM_CLOUDFLARE_LEGACY_SECRET_DELETE=${projectName}.`,
    ].join('\n'),
  );
  process.exit(0);
}

if (projectJsonPath) {
  throw new Error('--apply cannot be used with --project-json.');
}

if (confirmDelete !== projectName) {
  throw new Error(
    `Set CONFIRM_CLOUDFLARE_LEGACY_SECRET_DELETE=${projectName} or pass --confirm-delete-legacy-payment-secrets=${projectName}.`,
  );
}

const patchBody = buildPatchBody(plan);
await patchProject(patchBody);

const updatedProject = await fetchProject();
const updatedPlan = cleanupPlan(updatedProject?.result ?? updatedProject);

if (updatedPlan.total) {
  printPlan(updatedPlan);
  throw new Error('Cloudflare still reports configurable legacy payment variables after cleanup.');
}

console.log('Legacy payment variables removed from configurable Cloudflare Pages environments.');
console.log('Trigger or wait for a fresh production deployment, then run yarn audit:cloudflare-secrets and protected runtime checks.');

function cleanupPlan(projectResult) {
  const production = legacyNames(projectResult.deployment_configs?.production?.env_vars);
  const preview = legacyNames(projectResult.deployment_configs?.preview?.env_vars);
  const topLevel = legacyNames(projectResult.env_vars);

  return {
    preview,
    production,
    topLevel,
    total: production.length + preview.length + topLevel.length,
  };
}

function printPlan(plan) {
  console.log(
    [
      'Cloudflare Pages legacy payment cleanup plan:',
      `- Project: ${projectName}`,
      `- Production variables to remove: ${formatNames(plan.production)}`,
      `- Preview variables to remove: ${formatNames(plan.preview)}`,
      `- Top-level variables to remove: ${formatNames(plan.topLevel)}`,
    ].join('\n'),
  );
}

function buildPatchBody(plan) {
  const body = {};

  if (plan.production.length || plan.preview.length) {
    body.deployment_configs = {};
    if (plan.production.length) {
      body.deployment_configs.production = { env_vars: nullMap(plan.production) };
    }
    if (plan.preview.length) {
      body.deployment_configs.preview = { env_vars: nullMap(plan.preview) };
    }
  }

  if (plan.topLevel.length) {
    body.env_vars = nullMap(plan.topLevel);
  }

  return body;
}

function nullMap(names) {
  return Object.fromEntries(names.map((name) => [name, null]));
}

function legacyNames(envVars) {
  if (!envVars || typeof envVars !== 'object') return [];
  return forbiddenPaymentEnv.filter((name) => Object.hasOwn(envVars, name));
}

function formatNames(names) {
  return names.length ? names.join(', ') : 'none';
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

  const url = projectUrl();
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await response.json();

  if (!response.ok || body?.success === false) {
    const details = errorDetails(body);
    throw new Error(`Cloudflare Pages project fetch failed with ${response.status}${details ? `: ${details}` : ''}.`);
  }

  return body;
}

async function patchProject(body) {
  const response = await fetch(projectUrl(), {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  });
  const responseBody = await response.json();

  if (!response.ok || responseBody?.success === false) {
    const details = errorDetails(responseBody);
    throw new Error(`Cloudflare Pages project update failed with ${response.status}${details ? `: ${details}` : ''}.`);
  }
}

function projectUrl() {
  return new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
  );
}

function errorDetails(body) {
  return Array.isArray(body?.errors) ? body.errors.map((error) => error.message).filter(Boolean).join('; ') : '';
}
