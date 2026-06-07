import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

const allowHttp = process.argv.includes('--allow-http');
const target = process.argv.find((arg) => arg.startsWith('http')) || process.env.APP_PUBLIC_ORIGIN || '';
const verificationEmail = process.env.PRODUCTION_VERIFY_EMAIL || '';
const adminToken = process.env.PRODUCTION_ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN || '';

if (!target) {
  throw new Error('Set APP_PUBLIC_ORIGIN or pass a production URL to verify.');
}

const origin = normalizeOrigin(target);
if (!allowHttp && origin.protocol !== 'https:') {
  throw new Error('Production verification requires an https APP_PUBLIC_ORIGIN.');
}

const checks = [];
let smokeIssueIdPromise;

const record = async (name, fn) => {
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
};

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

await record('Issue source links are present', async () => {
  const { body, response } = await fetchJson('/api/issues');
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!Array.isArray(body?.issues)) throw new Error('issues must be an array');
  const sourceCount = validateIssueSources(body.issues);
  return `${sourceCount} source links across ${body.issues.length} issues`;
});

await record('Anonymous reaction toggle persists', runAnonymousReactionSmoke);

await record('Wallet API rejects missing session', async () => {
  const { response } = await fetchJson('/api/wallet?countryCode=KR');
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Comment list is public', async () => {
  const issueId = await getSmokeIssueId();
  const { body, response } = await fetchJson(`/api/comments?issueId=${encodeURIComponent(issueId)}`);
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!Array.isArray(body?.comments)) throw new Error('comments must be an array');
  return `${body.comments.length} comments for ${issueId}`;
});

await record('Comment API rejects missing session', async () => {
  const issueId = await getSmokeIssueId();
  const { response } = await fetchJson('/api/comments', {
    body: JSON.stringify({
      content: 'Production verification should not write without a session',
      idempotencyKey: `verify-comment-${randomUUID()}`,
      issueId,
    }),
    method: 'POST',
  });
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Payment create is disabled', () =>
  expectPaymentGone('/api/payments/create', {
    idempotencyKey: 'verify-create',
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
  const { response } = await fetchJson('/api/admin/refresh-issues', {
    method: 'POST',
  });
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Admin status API rejects missing admin token', async () => {
  const { response } = await fetchJson('/api/admin/status');
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

if (verificationEmail) {
  await record('Resend OTP request sends production email', async () => {
    const { body, response } = await fetchJson('/api/auth/request-code', {
      body: JSON.stringify({
        countryCode: 'KR',
        displayName: 'GlobalPulse Verify',
        email: verificationEmail,
      }),
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
    if (body?.status !== 'code_sent') throw new Error(`Expected code_sent, got ${body?.status}`);
    if (body && typeof body === 'object' && 'devCode' in body) {
      throw new Error('Production email response must not include devCode');
    }
    return `code sent to ${verificationEmail}`;
  });
}

if (adminToken) {
  await record('Admin runtime status is production-ready', async () => {
    const { body, response } = await fetchJson('/api/admin/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
    if (body?.status !== 'ok') throw new Error(`Expected ok status, got ${body?.status}`);
    if (!body.config?.sessionSecretConfigured) throw new Error('SESSION_TOKEN_SECRET is not configured');
    if (!body.config?.moderationAdminTokenConfigured) throw new Error('MODERATION_ADMIN_TOKEN is not configured');
    if (!body.config?.appPublicOriginConfigured) throw new Error('APP_PUBLIC_ORIGIN is not configured');
    if (!body.config?.appPublicOriginHttps) throw new Error('APP_PUBLIC_ORIGIN must use https');
    if (!body.config?.appPublicOriginMatchesRequest) {
      throw new Error('APP_PUBLIC_ORIGIN must match the deployed request origin');
    }
    if (body.config?.demoLoginEnabled) throw new Error('ALLOW_DEMO_LOGIN must not be enabled in production');
    if (body.auth?.provider !== 'resend') throw new Error(`AUTH_PROVIDER must be resend, got ${body.auth?.provider}`);
    if (!body.auth?.resendConfigured) throw new Error('RESEND_API_KEY is not configured');
    if (!body.auth?.emailFromConfigured) throw new Error('AUTH_EMAIL_FROM is not configured');
    if (body.auth?.logDeliveryEnabled) throw new Error('AUTH_EMAIL_DELIVERY=log must not be enabled');
    if (Number(body.d1?.issueCount ?? 0) < 20) throw new Error('D1 issue count must be at least 20');
    if (!body.d1?.requiredTablesPresent) {
      throw new Error(`D1 required tables are missing: ${(body.d1?.missingTables ?? []).join(', ')}`);
    }
    if (Number(body.payments?.activePlanCount ?? 0) !== 0) {
      throw new Error('Active payment plans must be disabled');
    }
    if (Number(body.payments?.legacySecretCount ?? 0) !== 0) {
      const names = Array.isArray(body.payments?.legacySecretsPresent)
        ? body.payments.legacySecretsPresent.join(', ')
        : 'unknown';
      throw new Error(`Legacy payment secrets must be removed: ${names}`);
    }
    if (!body.config?.launchReviewAcknowledged) {
      throw new Error('LAUNCH_REVIEW_ACK is not acknowledged');
    }
    return `${body.d1.issueCount} issues, payments disabled`;
  });
}

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
}

if (failures.length) {
  process.exit(1);
}

console.log('Production verification passed.');

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.pathname !== '/' || url.search || url.hash) {
    return new URL(url.origin);
  }
  return url;
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
  const issueId = await getSmokeIssueId();
  const baseline = await getIssueSnapshot(issueId);
  const baselineLikes = Number(baseline.likes);
  const baselineDislikes = Number(baseline.dislikes);
  const anonymousToken = `verify_${randomUUID()}`;
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
    expectReactionCounts(like, baselineLikes + 1, baselineDislikes, 'like');
    await expectIssueAggregate(issueId, like.likes, like.dislikes, 'like');

    const dislike = await postReaction('dislike');
    if (dislike?.currentReaction !== 'dislike') {
      throw new Error(`Expected currentReaction dislike, got ${dislike?.currentReaction}`);
    }
    expectReactionCounts(dislike, baselineLikes, baselineDislikes + 1, 'switch to dislike');
    await expectIssueAggregate(issueId, dislike.likes, dislike.dislikes, 'switch to dislike');

    const cancel = await postReaction('dislike');
    if (cancel?.currentReaction !== null) throw new Error(`Expected cancelled reaction, got ${cancel?.currentReaction}`);
    expectReactionCounts(cancel, baselineLikes, baselineDislikes, 'cancel');
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

function expectReactionCounts(body, expectedLikes, expectedDislikes, phase) {
  if (Number(body?.likes) !== expectedLikes) {
    throw new Error(`Expected ${expectedLikes} likes after ${phase}, got ${body?.likes}`);
  }
  if (Number(body?.dislikes) !== expectedDislikes) {
    throw new Error(`Expected ${expectedDislikes} dislikes after ${phase}, got ${body?.dislikes}`);
  }
}

async function getSmokeIssueId() {
  smokeIssueIdPromise ??= (async () => {
    const { body, response } = await fetchJson('/api/issues');
    if (!response.ok) throw new Error(`Expected 200 from /api/issues, got ${response.status}`);
    if (!Array.isArray(body?.issues) || !body.issues.length) throw new Error('No issues available');
    const index = randomIndex(body.issues.length);
    const issueId = body.issues[index].id;
    if (typeof issueId !== 'string' || !issueId) throw new Error('Selected issue does not include an id');
    return issueId;
  })();

  return smokeIssueIdPromise;
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function validateIssueSources(issues) {
  let sourceCount = 0;
  for (const issue of issues) {
    if (!Array.isArray(issue.sources) || !issue.sources.length) {
      throw new Error(`Issue ${issue.id || 'unknown'} must include at least one source`);
    }

    for (const source of issue.sources) {
      if (typeof source?.name !== 'string' || !source.name.trim()) {
        throw new Error(`Issue ${issue.id || 'unknown'} has a source without a name`);
      }
      if (typeof source?.url !== 'string' || !source.url.trim()) {
        throw new Error(`Issue ${issue.id || 'unknown'} has a source without a URL`);
      }
      const url = new URL(source.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`Issue ${issue.id || 'unknown'} source URL must use http or https`);
      }
      sourceCount += 1;
    }
  }
  return sourceCount;
}

async function getIssueSnapshot(issueId) {
  const { body, response } = await fetchJson('/api/issues');
  if (!response.ok) throw new Error(`Expected 200 from /api/issues, got ${response.status}`);
  const issue = Array.isArray(body?.issues) ? body.issues.find((item) => item.id === issueId) : null;
  if (!issue) throw new Error(`Issue ${issueId} missing from /api/issues`);
  return issue;
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
