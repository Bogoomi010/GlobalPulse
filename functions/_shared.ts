export type Env = {
  DB: D1Database;
  SESSION_TOKEN_SECRET?: string;
  TOSS_CLIENT_KEY?: string;
  TOSS_SECRET_KEY?: string;
  TOSS_WEBHOOK_SECRET?: string;
  PAYMENT_PROVIDER?: string;
  AUTH_PROVIDER?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  AUTH_EMAIL_REPLY_TO?: string;
  ALLOW_DEMO_LOGIN?: string;
};

export type ApiIssue = {
  id: string;
  category: string;
  createdHoursAgo: number;
  sourceCount: number;
  title: string;
  summary: string;
  detail: string;
  likes: number;
  dislikes: number;
  comments: number;
  velocity: number;
  sensitive: boolean;
  sources: Array<{ name: string; url: string }>;
};

export type IssueRow = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  category: string;
  created_at: string;
  source_count: number;
  reaction_velocity: number;
  is_sensitive: number;
  like_count: number;
  dislike_count: number;
  comment_count: number;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  countryCode: string;
};

export type UserWithWallet = {
  user: AuthenticatedUser;
  wallet: {
    id?: string;
    currencyCode: string;
    balance: number;
  };
};

export type TopupTransactionStatus = 'completed' | 'failed' | 'cancelled';

export type TopupTransactionInput = {
  userId: string;
  walletId: string;
  paymentId: string;
  amount: number;
  currencyCode: string;
  status: TopupTransactionStatus;
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function badRequest(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Valid email is required');
  }
  return email;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function createdHoursAgo(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.round((Date.now() - created) / 3600000));
}

export function normalizeIssue(row: IssueRow, sources: Array<{ name: string; url: string }>): ApiIssue {
  return {
    id: row.id,
    category: row.category,
    createdHoursAgo: createdHoursAgo(row.created_at),
    sourceCount: Number(row.source_count),
    title: row.title,
    summary: row.summary,
    detail: row.detail,
    likes: Number(row.like_count),
    dislikes: Number(row.dislike_count),
    comments: Number(row.comment_count),
    velocity: Number(row.reaction_velocity),
    sensitive: Boolean(row.is_sensitive),
    sources,
  };
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashSessionToken(token: string, secret?: string): Promise<string> {
  return hmacHex(secret || 'globalpulse-development-session-secret', token);
}

export async function ensureAnonymousSession(
  db: D1Database,
  anonymousToken: string,
  secret?: string,
): Promise<string> {
  const tokenHash = await hashSessionToken(anonymousToken, secret);
  const existing = await db
    .prepare('SELECT id FROM anonymous_sessions WHERE session_token_hash = ?')
    .bind(tokenHash)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare('UPDATE anonymous_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(existing.id)
      .run();
    return existing.id;
  }

  const id = createId('anon');
  await db
    .prepare('INSERT INTO anonymous_sessions (id, session_token_hash) VALUES (?, ?)')
    .bind(id, tokenHash)
    .run();
  return id;
}

export async function createUserSession(
  db: D1Database,
  userId: string,
  secret?: string,
): Promise<string> {
  const sessionToken = `gps_${crypto.randomUUID().replaceAll('-', '')}${crypto
    .randomUUID()
    .replaceAll('-', '')}`;
  const tokenHash = await hashSessionToken(sessionToken, secret);
  await db
    .prepare(
      `
        INSERT INTO user_sessions
          (id, user_id, session_token_hash, expires_at)
        VALUES (?, ?, ?, datetime('now', '+30 days'))
      `,
    )
    .bind(createId('session'), userId, tokenHash)
    .run();
  return sessionToken;
}

export async function ensureUserWithWallet(
  db: D1Database,
  input: {
    email: string;
    displayName: string;
    countryCode: string;
  },
): Promise<UserWithWallet> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim().slice(0, 80) || 'Global member';
  const countryCode = input.countryCode.trim().toUpperCase().slice(0, 2) || 'KR';

  const existing = await db
    .prepare('SELECT id, email, display_name, country_code FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; display_name: string; country_code: string }>();

  const userId = existing?.id ?? createId('user');
  const walletId = createId('wallet');

  if (existing) {
    await db.batch([
      db.prepare(
        `
          UPDATE users
          SET display_name = ?, country_code = ?, last_seen_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).bind(displayName, countryCode, userId),
      db.prepare(
        `
          INSERT OR IGNORE INTO wallets (id, user_id, currency_code, balance_amount)
          VALUES (?, ?, 'KRW', 0)
        `,
      ).bind(walletId, userId),
    ]);
  } else {
    await db.batch([
      db.prepare(
        `
          INSERT INTO users (id, email, display_name, country_code)
          VALUES (?, ?, ?, ?)
        `,
      ).bind(userId, email, displayName, countryCode),
      db.prepare(
        `
          INSERT OR IGNORE INTO wallets (id, user_id, currency_code, balance_amount)
          VALUES (?, ?, 'KRW', 0)
        `,
      ).bind(walletId, userId),
    ]);
  }

  const wallet = await db
    .prepare(
      `
        SELECT id, currency_code, balance_amount
        FROM wallets
        WHERE user_id = ? AND currency_code = 'KRW'
      `,
    )
    .bind(userId)
    .first<{ id: string; currency_code: string; balance_amount: number }>();

  return {
    user: {
      id: userId,
      email,
      displayName,
      countryCode,
    },
    wallet: {
      id: wallet?.id,
      currencyCode: wallet?.currency_code ?? 'KRW',
      balance: Number(wallet?.balance_amount ?? 0),
    },
  };
}

export async function authenticateUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const tokenHash = await hashSessionToken(token, env.SESSION_TOKEN_SECRET);
  const user = await env.DB.prepare(
    `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.country_code,
        s.id AS session_id
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `,
  )
    .bind(tokenHash)
    .first<{
      id: string;
      email: string;
      display_name: string;
      country_code: string;
      session_id: string;
    }>();

  if (!user) return null;

  await env.DB.batch([
    env.DB.prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(
      user.session_id,
    ),
    env.DB.prepare('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id),
  ]);

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    countryCode: user.country_code,
  };
}

export function unauthorized(): Response {
  return json({ error: 'Authentication required' }, 401);
}

export function tossAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

export function paymentProviderReady(env: Env): boolean {
  return Boolean(env.TOSS_CLIENT_KEY && env.TOSS_SECRET_KEY);
}

export async function recordTopupTransaction(
  db: D1Database,
  input: TopupTransactionInput,
): Promise<boolean> {
  const result = await db
    .prepare(
      `
        INSERT OR IGNORE INTO wallet_transactions
          (id, user_id, wallet_id, transaction_type, amount, currency_code, status, payment_id, idempotency_key)
        VALUES (?, ?, ?, 'topup', ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      createId('wtx'),
      input.userId,
      input.walletId,
      Number(input.amount),
      input.currencyCode,
      input.status,
      input.paymentId,
      input.status === 'completed'
        ? `payment:${input.paymentId}`
        : `payment:${input.paymentId}:${input.status}`,
    )
    .run();

  return Number(result.meta.changes ?? 0) > 0;
}

export async function verifyTossSignature(
  request: Request,
  rawBody: string,
  webhookSecret?: string,
): Promise<boolean> {
  if (!webhookSecret) return false;

  const timestamp =
    request.headers.get('tosspayments-webhook-transmission-time') ||
    request.headers.get('x-toss-timestamp');
  const signature =
    request.headers.get('tosspayments-webhook-signature') || request.headers.get('x-toss-signature');

  if (!timestamp || !signature) return false;

  const signedPayload = signature.startsWith('v1=') ? signature.slice(3) : signature;
  const expectedA = await hmacHex(webhookSecret, `${rawBody}:${timestamp}`);
  const expectedB = await hmacHex(webhookSecret, `${timestamp}.${rawBody}`);
  return safeEqual(signedPayload, expectedA) || safeEqual(signedPayload, expectedB);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}
