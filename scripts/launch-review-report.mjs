import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

const allowHttp = process.argv.includes('--allow-http');
const outputPath = readOption('--output');
const target = process.argv.find((arg) => arg.startsWith('http')) || process.env.APP_PUBLIC_ORIGIN || '';
const adminToken = process.env.PRODUCTION_ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN || '';

if (!target) {
  throw new Error('Set APP_PUBLIC_ORIGIN or pass a production URL.');
}

const origin = normalizeOrigin(target);
if (!allowHttp && origin.protocol !== 'https:') {
  throw new Error('Launch review report requires an https APP_PUBLIC_ORIGIN.');
}

const checks = [];
let adminStatus = null;
let firstIssueIdPromise;

await record('Public app loads', async () => {
  const response = await fetchText('/');
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!response.text.includes('GlobalPulse')) throw new Error('Response does not include GlobalPulse');
  return `${response.status} ${response.contentType}`;
});

await record('/api/issues returns D1 issues', async () => {
  const { body, response } = await fetchJson('/api/issues');
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!Array.isArray(body?.issues)) throw new Error('issues must be an array');
  if (body.issues.length < 20) throw new Error(`Expected at least 20 issues, got ${body.issues.length}`);
  return `${body.issues.length} issues`;
});

await record('Anonymous reaction toggle persists', runAnonymousReactionSmoke);

await record('Wallet API rejects missing session', async () => {
  const { response } = await fetchJson('/api/wallet?countryCode=KR');
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Comment list is public', async () => {
  const issueId = await getFirstIssueId();
  const { body, response } = await fetchJson(`/api/comments?issueId=${encodeURIComponent(issueId)}`);
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!Array.isArray(body?.comments)) throw new Error('comments must be an array');
  return `${body.comments.length} comments for ${issueId}`;
});

await record('Comment API rejects missing session', async () => {
  const issueId = await getFirstIssueId();
  const { response } = await fetchJson('/api/comments', {
    body: JSON.stringify({
      content: 'Launch review should not write without a session',
      idempotencyKey: `launch-review-comment-${randomUUID()}`,
      issueId,
    }),
    method: 'POST',
  });
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Payment create is disabled', () =>
  expectPaymentGone('/api/payments/create', {
    idempotencyKey: 'launch-review-create',
    origin: origin.origin,
    planId: 'removed',
  }),
);

await record('Payment confirm is disabled', () =>
  expectPaymentGone('/api/payments/confirm', {
    paymentId: 'removed',
  }),
);

await record('Payment fail is disabled', () =>
  expectPaymentGone('/api/payments/fail', {
    paymentId: 'removed',
  }),
);

await record('Payment webhook is disabled', () =>
  expectPaymentGone('/api/payments/webhook', {
    provider: 'removed',
  }),
);

await record('Moderation API rejects missing admin token', async () => {
  const { response } = await fetchJson('/api/moderation/reports');
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Issue refresh API rejects missing admin token', async () => {
  const { response } = await fetchJson('/api/admin/refresh-issues', { method: 'POST' });
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Admin status API rejects missing admin token', async () => {
  const { response } = await fetchJson('/api/admin/status');
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

if (adminToken) {
  await record('Admin runtime status available', async () => {
    const { body, response } = await fetchJson('/api/admin/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
    if (body?.status !== 'ok') throw new Error(`Expected ok status, got ${body?.status}`);
    adminStatus = body;
    return 'ok';
  });
} else {
  checks.push({
    detail: 'Set PRODUCTION_ADMIN_TOKEN or MODERATION_ADMIN_TOKEN to include protected runtime readiness.',
    name: 'Admin runtime status available',
    ok: null,
  });
}

const runtimeFailures = adminStatus ? readinessFailures(adminStatus) : [];
const publicFailures = checks.filter((check) => check.ok === false);
const report = renderReport();

if (outputPath) {
  writeReport(outputPath, report);
}

console.log(report);

if (publicFailures.length) {
  process.exit(1);
}

function renderReport() {
  const lines = [
    '# GlobalPulse Launch Review Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Origin: ${origin.origin}`,
    '',
    'This report does not print API keys, admin tokens, OTP codes, session tokens, or secret values.',
    '',
    '## Public Checks',
    '',
    '| Check | Result | Detail |',
    '| --- | --- | --- |',
    ...checks.map((check) => `| ${escapeMarkdown(check.name)} | ${formatResult(check.ok)} | ${escapeMarkdown(check.detail)} |`),
    '',
    '## Protected Runtime Summary',
    '',
    ...renderRuntimeSummary(),
    '',
    '## Launch Review Status',
    '',
    ...renderLaunchReviewStatus(),
    '',
    '## Next Actions',
    '',
    ...renderNextActions(),
  ];

  return lines.join('\n');
}

function renderRuntimeSummary() {
  if (!adminStatus) {
    return ['- Skipped: admin token was not provided.'];
  }

  return [
    `- D1 issues: ${adminStatus.d1?.issueCount ?? 'unknown'}`,
    `- D1 schema tables: ${formatBoolean(adminStatus.d1?.requiredTablesPresent)}`,
    `- Auth provider: ${adminStatus.auth?.provider || 'not configured'}`,
    `- Resend configured: ${formatBoolean(adminStatus.auth?.resendConfigured)}`,
    `- Email sender configured: ${formatBoolean(adminStatus.auth?.emailFromConfigured)}`,
    `- Email log delivery enabled: ${formatBoolean(adminStatus.auth?.logDeliveryEnabled)}`,
    `- Session secret configured: ${formatBoolean(adminStatus.config?.sessionSecretConfigured)}`,
    `- App public origin HTTPS: ${formatBoolean(adminStatus.config?.appPublicOriginHttps)}`,
    `- App public origin matches request: ${formatBoolean(adminStatus.config?.appPublicOriginMatchesRequest)}`,
    `- Demo login enabled: ${formatBoolean(adminStatus.config?.demoLoginEnabled)}`,
    `- Active payment plans: ${adminStatus.payments?.activePlanCount ?? 'unknown'}`,
    `- Legacy payment secrets: ${formatLegacyPaymentSecrets(adminStatus.payments)}`,
    `- Launch review acknowledged: ${formatBoolean(adminStatus.config?.launchReviewAcknowledged)}`,
    `- Runtime readiness: ${runtimeFailures.length ? 'not ready' : 'ready'}`,
  ];
}

function renderLaunchReviewStatus() {
  if (!adminStatus) {
    return [
      '- Public checks can be recorded as Pre-ACK evidence.',
      '- Protected runtime and Post-ACK evidence still require an admin token.',
    ];
  }

  if (!runtimeFailures.length) {
    return ['- Runtime readiness is complete. Post-ACK verification can be recorded.'];
  }

  return ['Runtime readiness is not complete:', ...runtimeFailures.map((failure) => `- ${failure}`)];
}

function renderNextActions() {
  const actions = [];

  if (!adminStatus) {
    actions.push(
      'Run `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review` to include protected runtime evidence.',
    );
    actions.push(
      'Run `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:status` to inspect runtime readiness.',
    );
  } else {
    if (runtimeFailures.length) {
      actions.push(...runtimeFailures.map((failure) => `Fix: ${failure}`));
    }
    if (!adminStatus.config?.launchReviewAcknowledged) {
      actions.push(
        'After every Launch Review section is complete, set `LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE` in Cloudflare Pages.',
      );
    }
  }

  actions.push(
    'Run `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:test-email` to request a production OTP.',
  );
  actions.push(
    'Run `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com PRODUCTION_VERIFY_EMAIL_CODE=123456 APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:verify-email` after receiving the OTP.',
  );

  return actions.length ? actions.map((action) => `- ${action}`) : ['- No remaining automated actions detected.'];
}

async function record(name, fn) {
  try {
    const detail = await fn();
    checks.push({ detail, name, ok: true });
  } catch (error) {
    checks.push({
      detail: error instanceof Error ? error.message : String(error),
      name,
      ok: false,
    });
  }
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
  if (!status?.config?.appPublicOriginHttps) {
    failures.push('APP_PUBLIC_ORIGIN must use https.');
  }
  if (!status?.config?.appPublicOriginMatchesRequest) {
    failures.push('APP_PUBLIC_ORIGIN must match the deployed request origin.');
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
  if (!status?.d1?.requiredTablesPresent) {
    const missing = Array.isArray(status?.d1?.missingTables) ? status.d1.missingTables.join(', ') : 'unknown';
    failures.push(`D1 required tables are missing: ${missing}.`);
  }
  if (Number(status?.payments?.activePlanCount ?? 0) !== 0) {
    failures.push('Active payment plans must be disabled.');
  }
  if (Number(status?.payments?.legacySecretCount ?? 0) !== 0) {
    const names = Array.isArray(status?.payments?.legacySecretsPresent)
      ? status.payments.legacySecretsPresent.join(', ')
      : 'unknown';
    failures.push(`Legacy payment secrets must be removed: ${names}.`);
  }
  if (!status?.config?.launchReviewAcknowledged) {
    failures.push('LAUNCH_REVIEW_ACK is not acknowledged.');
  }

  return failures;
}

async function fetchText(pathname) {
  const response = await fetch(new URL(pathname, origin));
  return {
    contentType: response.headers.get('content-type') || '',
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function fetchJson(pathname, init = {}) {
  const response = await fetch(new URL(pathname, origin), {
    ...init,
    headers: {
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
  return { body, response };
}

async function expectPaymentGone(pathname, body) {
  const { response } = await fetchJson(pathname, {
    body: JSON.stringify(body),
    method: 'POST',
  });
  if (response.status !== 410) throw new Error(`Expected 410, got ${response.status}`);
  return '410';
}

async function runAnonymousReactionSmoke() {
  const issueId = await getFirstIssueId();
  const anonymousToken = `launch_review_${randomUUID()}`;
  let currentReaction = null;

  const postReaction = async (reactionType) => {
    const result = await fetchJson('/api/reactions', {
      body: JSON.stringify({ anonymousToken, issueId, reactionType }),
      method: 'POST',
    });
    if (!result.response.ok) throw new Error(`Expected reaction ${reactionType} to succeed, got ${result.response.status}`);
    currentReaction = result.body?.currentReaction ?? null;
    return result.body;
  };

  try {
    const like = await postReaction('like');
    if (like?.currentReaction !== 'like') throw new Error(`Expected currentReaction like, got ${like?.currentReaction}`);
    await expectIssueAggregate(issueId, like.likes, like.dislikes, 'like');

    const dislike = await postReaction('dislike');
    if (dislike?.currentReaction !== 'dislike') {
      throw new Error(`Expected currentReaction dislike, got ${dislike?.currentReaction}`);
    }
    await expectIssueAggregate(issueId, dislike.likes, dislike.dislikes, 'switch to dislike');

    const cancel = await postReaction('dislike');
    if (cancel?.currentReaction !== null) throw new Error(`Expected cancelled reaction, got ${cancel?.currentReaction}`);
    await expectIssueAggregate(issueId, cancel.likes, cancel.dislikes, 'cancel');

    return `${issueId} like, switch, cancel`;
  } finally {
    if (currentReaction === 'like' || currentReaction === 'dislike') {
      try {
        await postReaction(currentReaction);
      } catch (error) {
        console.error(
          `Warning: reaction smoke cleanup failed for ${issueId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}

async function expectIssueAggregate(issueId, expectedLikes, expectedDislikes, phase) {
  const { body, response } = await fetchJson('/api/issues');
  if (!response.ok) throw new Error(`Expected 200 from /api/issues after ${phase}, got ${response.status}`);
  const issue = Array.isArray(body?.issues) ? body.issues.find((item) => item.id === issueId) : null;
  if (!issue) throw new Error(`Issue ${issueId} missing from /api/issues after ${phase}`);
  if (Number(issue.likes) !== Number(expectedLikes)) {
    throw new Error(`Issue ${issueId} likes did not persist after ${phase}: expected ${expectedLikes}, got ${issue.likes}`);
  }
  if (Number(issue.dislikes) !== Number(expectedDislikes)) {
    throw new Error(
      `Issue ${issueId} dislikes did not persist after ${phase}: expected ${expectedDislikes}, got ${issue.dislikes}`,
    );
  }
}

async function getFirstIssueId() {
  firstIssueIdPromise ??= (async () => {
    const { body, response } = await fetchJson('/api/issues');
    if (!response.ok) throw new Error(`Expected 200 from /api/issues, got ${response.status}`);
    if (!Array.isArray(body?.issues) || !body.issues.length) throw new Error('No issues available');
    const issueId = body.issues[0].id;
    if (typeof issueId !== 'string' || !issueId) throw new Error('First issue does not include an id');
    return issueId;
  })();

  return firstIssueIdPromise;
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.pathname !== '/' || url.search || url.hash) {
    return new URL(url.origin);
  }
  return url;
}

function formatBoolean(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}

function formatLegacyPaymentSecrets(payments) {
  const count = Number(payments?.legacySecretCount ?? 0);
  if (!count) return 'none';
  const names = Array.isArray(payments?.legacySecretsPresent) ? payments.legacySecretsPresent.join(', ') : 'unknown';
  return `${count} present (${names})`;
}

function formatResult(value) {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  return 'SKIP';
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function readOption(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function writeReport(targetPath, report) {
  const resolvedPath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${report}\n`, 'utf8');
  console.error(`Launch review report written to ${resolvedPath}.`);
}
