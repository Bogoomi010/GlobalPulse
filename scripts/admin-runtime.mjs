import { URL } from 'node:url';

const command = process.argv[2] || 'status';
const target = process.argv.find((arg) => arg.startsWith('http')) || process.env.APP_PUBLIC_ORIGIN || '';
const adminToken = process.env.PRODUCTION_ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN || '';

if (!target) {
  throw new Error('Set APP_PUBLIC_ORIGIN or pass a production URL.');
}

if (!adminToken) {
  throw new Error('Set PRODUCTION_ADMIN_TOKEN or MODERATION_ADMIN_TOKEN.');
}

const origin = normalizeOrigin(target);

if (command === 'status') {
  const status = await adminJson('/api/admin/status');
  printStatus(status);
} else if (command === 'ready') {
  const status = await adminJson('/api/admin/status');
  printStatus(status);
  const failures = readinessFailures(status);
  if (failures.length) {
    console.error(['Production readiness failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'));
    process.exit(1);
  }
  console.log('Production runtime readiness passed.');
} else if (command === 'refresh-issues') {
  const result = await adminJson('/api/admin/refresh-issues', { method: 'POST' });
  console.log(
    [
      'Issue refresh complete.',
      `Upserted: ${result.upserted}`,
      `Wikimedia: ${result.sources?.wikimedia ?? 0}`,
      `Hacker News: ${result.sources?.hackerNews ?? 0}`,
      `GDELT: ${result.sources?.gdelt ?? 0}`,
    ].join('\n'),
  );
  const status = await adminJson('/api/admin/status');
  printStatus(status);
} else {
  throw new Error('Command must be "status", "ready", or "refresh-issues".');
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.pathname !== '/' || url.search || url.hash) {
    return new URL(url.origin);
  }
  return url;
}

async function adminJson(pathname, init = {}) {
  const response = await fetch(new URL(pathname, origin), {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'error' in body ? body.error : text;
    throw new Error(`${pathname} failed with ${response.status}: ${detail}`);
  }
  return body;
}

function printStatus(status) {
  const failures = readinessFailures(status);
  const lines = [
    'Runtime status:',
    `- D1 issues: ${status.d1?.issueCount ?? 'unknown'}`,
    `- Auth provider: ${status.auth?.provider || 'not configured'}`,
    `- Resend configured: ${formatBoolean(status.auth?.resendConfigured)}`,
    `- Email sender configured: ${formatBoolean(status.auth?.emailFromConfigured)}`,
    `- Email log delivery enabled: ${formatBoolean(status.auth?.logDeliveryEnabled)}`,
    `- Session secret configured: ${formatBoolean(status.config?.sessionSecretConfigured)}`,
    `- App public origin configured: ${formatBoolean(status.config?.appPublicOriginConfigured)}`,
    `- Demo login enabled: ${formatBoolean(status.config?.demoLoginEnabled)}`,
    `- Active payment plans: ${status.payments?.activePlanCount ?? 'unknown'}`,
    `- Launch review acknowledged: ${formatBoolean(status.config?.launchReviewAcknowledged)}`,
    `- Runtime readiness: ${failures.length ? 'not ready' : 'ready'}`,
  ];
  console.log(lines.join('\n'));
}

function readinessFailures(status) {
  const failures = [];

  if (!status?.config?.sessionSecretConfigured) {
    failures.push('SESSION_TOKEN_SECRET is not configured.');
  }
  if (!status?.config?.moderationAdminTokenConfigured) {
    failures.push('MODERATION_ADMIN_TOKEN is not configured.');
  }
  if (!status?.config?.appPublicOriginConfigured) {
    failures.push('APP_PUBLIC_ORIGIN is not configured.');
  }
  if (status?.config?.demoLoginEnabled) {
    failures.push('ALLOW_DEMO_LOGIN must not be enabled in production.');
  }
  if (status?.auth?.provider !== 'resend') {
    failures.push(`AUTH_PROVIDER must be resend; current value is ${status?.auth?.provider || 'not configured'}.`);
  }
  if (!status?.auth?.resendConfigured) {
    failures.push('RESEND_API_KEY is not configured.');
  }
  if (!status?.auth?.emailFromConfigured) {
    failures.push('AUTH_EMAIL_FROM is not configured.');
  }
  if (status?.auth?.logDeliveryEnabled) {
    failures.push('AUTH_EMAIL_DELIVERY=log must not be enabled in production.');
  }
  if (Number(status?.d1?.issueCount ?? 0) < 20) {
    failures.push('D1 issue count must be at least 20.');
  }
  if (Number(status?.payments?.activePlanCount ?? 0) !== 0) {
    failures.push('Active payment plans must be disabled.');
  }
  if (!status?.config?.launchReviewAcknowledged) {
    failures.push('LAUNCH_REVIEW_ACK is not acknowledged.');
  }

  return failures;
}

function formatBoolean(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}
