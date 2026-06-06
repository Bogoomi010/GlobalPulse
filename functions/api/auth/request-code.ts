import {
  Env,
  badRequest,
  createId,
  hmacHex,
  json,
  normalizeEmail,
  readJson,
  requireString,
} from '../../_shared';

type RequestCodeBody = {
  email?: string;
  displayName?: string;
  countryCode?: string;
};

const codeTtlMinutes = 10;
const maxRequestsPerWindow = 3;

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const deliveryMode = env.AUTH_EMAIL_DELIVERY || 'resend';
    if (env.ALLOW_DEMO_LOGIN === 'true' && env.AUTH_PROVIDER !== 'resend') {
      return json({ status: 'demo_available', codeRequired: false });
    }

    if (env.AUTH_PROVIDER !== 'resend') {
      return badRequest('AUTH_PROVIDER=resend is required for verified email login', 503);
    }

    if (!env.SESSION_TOKEN_SECRET) {
      return badRequest('SESSION_TOKEN_SECRET is required for verified email login', 503);
    }

    if (deliveryMode === 'log' && env.ALLOW_DEMO_LOGIN !== 'true') {
      return badRequest('Local email log delivery is only allowed with ALLOW_DEMO_LOGIN=true', 503);
    }

    if (deliveryMode !== 'log' && (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM)) {
      return badRequest('Email login provider is not configured', 503);
    }

    const body = await readJson<RequestCodeBody>(request);
    const email = normalizeEmail(requireString(body.email, 'email'));
    const displayName = requireString(body.displayName || 'Global member', 'displayName').slice(0, 80);
    const countryCode = (body.countryCode || 'KR').toUpperCase().slice(0, 2);

    const recent = await env.DB.prepare(
      `
        SELECT COUNT(*) AS count
        FROM email_login_codes
        WHERE email = ? AND created_at > datetime('now', '-10 minutes')
      `,
    )
      .bind(email)
      .first<{ count: number }>();

    if (Number(recent?.count ?? 0) >= maxRequestsPerWindow) {
      return badRequest('Too many login code requests. Try again later.', 429);
    }

    const code = createNumericCode();
    const codeId = createId('ecode');
    const codeHash = await hmacHex(env.SESSION_TOKEN_SECRET, `${email}:${code}`);

    await env.DB.batch([
      env.DB.prepare(
        `
          UPDATE email_login_codes
          SET consumed_at = CURRENT_TIMESTAMP
          WHERE email = ? AND consumed_at IS NULL
        `,
      ).bind(email),
      env.DB.prepare(
        `
          INSERT INTO email_login_codes
            (id, email, display_name, country_code, code_hash, expires_at)
          VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
        `,
      ).bind(codeId, email, displayName, countryCode, codeHash),
    ]);

    const sent = await sendVerificationEmail(env, {
      code,
      email,
      idempotencyKey: codeId,
    });

    if (!sent) {
      await env.DB.prepare(
        `
          UPDATE email_login_codes
          SET consumed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
        .bind(codeId)
        .run();
      return badRequest('Unable to send verification email', 502);
    }

    return json({
      status: 'code_sent',
      expiresInMinutes: codeTtlMinutes,
      ...(deliveryMode === 'log' && env.ALLOW_DEMO_LOGIN === 'true' ? { devCode: code } : {}),
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid email login request');
  }
};

function createNumericCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

async function sendVerificationEmail(
  env: Env,
  input: {
    code: string;
    email: string;
    idempotencyKey: string;
  },
): Promise<boolean> {
  if (env.AUTH_EMAIL_DELIVERY === 'log') {
    return env.ALLOW_DEMO_LOGIN === 'true';
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [input.email],
      subject: 'GlobalPulse login code',
      text: `Your GlobalPulse login code is ${input.code}. It expires in ${codeTtlMinutes} minutes.`,
      html: `<p>Your GlobalPulse login code is <strong>${input.code}</strong>.</p><p>It expires in ${codeTtlMinutes} minutes.</p>`,
    }),
  });

  return response.ok;
}
