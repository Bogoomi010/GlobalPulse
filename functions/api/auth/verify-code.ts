import {
  Env,
  badRequest,
  createUserSession,
  ensureUserWithWallet,
  hmacHex,
  json,
  normalizeEmail,
  readJson,
  requireString,
} from '../../_shared';

type VerifyCodeBody = {
  email?: string;
  code?: string;
};

type EmailCodeRow = {
  id: string;
  email: string;
  display_name: string;
  country_code: string;
  code_hash: string;
  attempt_count: number;
  expired: number;
};

const maxAttempts = 5;

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (env.AUTH_PROVIDER !== 'resend') {
      return badRequest('AUTH_PROVIDER=resend is required for verified email login', 503);
    }

    if (!env.SESSION_TOKEN_SECRET) {
      return badRequest('SESSION_TOKEN_SECRET is required for verified email login', 503);
    }

    const body = await readJson<VerifyCodeBody>(request);
    const email = normalizeEmail(requireString(body.email, 'email'));
    const code = requireString(body.code, 'code');
    if (!/^\d{6}$/.test(code)) return badRequest('Verification code must be 6 digits');

    const record = await env.DB.prepare(
      `
        SELECT
          id,
          email,
          display_name,
          country_code,
          code_hash,
          attempt_count,
          CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
        FROM email_login_codes
        WHERE email = ? AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
      .bind(email)
      .first<EmailCodeRow>();

    if (!record) return badRequest('Verification code was not requested or has already been used', 400);

    if (Number(record.expired) === 1) {
      await consumeCode(env.DB, record.id);
      return badRequest('Verification code has expired', 400);
    }

    if (Number(record.attempt_count) >= maxAttempts) {
      await consumeCode(env.DB, record.id);
      return badRequest('Too many verification attempts. Request a new code.', 429);
    }

    const codeHash = await hmacHex(env.SESSION_TOKEN_SECRET, `${email}:${code}`);
    if (!equalDigest(codeHash, record.code_hash)) {
      await env.DB.prepare(
        `
          UPDATE email_login_codes
          SET attempt_count = attempt_count + 1
          WHERE id = ?
        `,
      )
        .bind(record.id)
        .run();
      return badRequest('Verification code is incorrect', 400);
    }

    await consumeCode(env.DB, record.id);
    const { user, wallet } = await ensureUserWithWallet(env.DB, {
      email: record.email,
      displayName: record.display_name,
      countryCode: record.country_code,
    });
    const sessionToken = await createUserSession(env.DB, user.id, env.SESSION_TOKEN_SECRET);

    return json({
      user: {
        ...user,
        sessionToken,
      },
      wallet,
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid verification request');
  }
};

async function consumeCode(db: D1Database, codeId: string): Promise<void> {
  await db
    .prepare(
      `
        UPDATE email_login_codes
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .bind(codeId)
    .run();
}

function equalDigest(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}
