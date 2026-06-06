import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

const allowHttp = process.argv.includes('--allow-http');
const target = process.argv.find((arg) => arg.startsWith('http')) || process.env.APP_PUBLIC_ORIGIN || '';
const verificationEmail = process.env.PRODUCTION_VERIFY_EMAIL || '';
const verificationSessionToken = process.env.PRODUCTION_VERIFY_SESSION_TOKEN || '';
const verificationPlanId = process.env.PRODUCTION_VERIFY_PLAN_ID || 'krw-1000-toss';

if (!target) {
  throw new Error('Set APP_PUBLIC_ORIGIN or pass a production URL to verify.');
}

const origin = normalizeOrigin(target);
if (!allowHttp && origin.protocol !== 'https:') {
  throw new Error('Production verification requires an https APP_PUBLIC_ORIGIN.');
}

const checks = [];

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

await record('Payment success route serves SPA', async () => {
  const response = await fetchText('/payment/success?paymentKey=verify&orderId=verify&amount=1000');
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!response.text.includes('GlobalPulse')) throw new Error('Payment success route did not serve app HTML');
  return `${response.status} ${response.contentType}`;
});

await record('Payment fail route serves SPA', async () => {
  const response = await fetchText('/payment/fail?orderId=verify&code=VERIFY&message=verify');
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!response.text.includes('GlobalPulse')) throw new Error('Payment fail route did not serve app HTML');
  return `${response.status} ${response.contentType}`;
});

await record('/api/issues returns seeded D1 issues', async () => {
  const { body, response } = await fetchJson('/api/issues');
  if (!response.ok) throw new Error(`Expected 200, got ${response.status}`);
  if (!Array.isArray(body?.issues)) throw new Error('issues must be an array');
  if (body.issues.length !== 20) throw new Error(`Expected 20 issues, got ${body.issues.length}`);
  return '20 issues';
});

await record('Wallet API rejects missing session', async () => {
  const { response } = await fetchJson('/api/wallet?countryCode=KR');
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

await record('Payment create rejects missing session', async () => {
  const { response } = await fetchJson('/api/payments/create', {
    body: JSON.stringify({
      idempotencyKey: 'verify',
      origin: origin.origin,
      planId: 'krw-1000-toss',
    }),
    method: 'POST',
  });
  if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
  return '401';
});

if (verificationSessionToken) {
  await record('Authenticated payment create uses production callback origin', async () => {
    const { body, response } = await fetchJson('/api/payments/create', {
      body: JSON.stringify({
        idempotencyKey: `verify-${randomUUID()}`,
        origin: 'https://client-origin-must-be-ignored.example',
        planId: verificationPlanId,
      }),
      headers: {
        Authorization: `Bearer ${verificationSessionToken}`,
      },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(body)}`);
    if (body?.status !== 'pending') throw new Error(`Expected pending payment, got ${body?.status}`);
    if (!body?.clientKey) throw new Error('Payment payload must include a Toss client key');
    if (!String(body?.orderId || '').startsWith('gp_')) throw new Error('Payment orderId must use gp_ prefix');
    if (body?.successUrl !== `${origin.origin}/payment/success`) {
      throw new Error(`Unexpected successUrl ${body?.successUrl}`);
    }
    if (body?.failUrl !== `${origin.origin}/payment/fail`) {
      throw new Error(`Unexpected failUrl ${body?.failUrl}`);
    }
    if (!Number.isInteger(Number(body?.amount)) || Number(body.amount) <= 0) {
      throw new Error(`Payment amount must be positive, got ${body?.amount}`);
    }
    return `${verificationPlanId} pending checkout payload`;
  });
}

await record('Moderation API rejects missing admin token', async () => {
  const { response } = await fetchJson('/api/moderation/reports');
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
