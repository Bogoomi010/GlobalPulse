export type Env = {
  DB: D1Database;
  SESSION_TOKEN_SECRET?: string;
  TOSS_CLIENT_KEY?: string;
  TOSS_SECRET_KEY?: string;
  TOSS_WEBHOOK_SECRET?: string;
  PAYMENT_PROVIDER?: string;
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

export function tossAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

export function paymentProviderReady(env: Env): boolean {
  return Boolean(env.TOSS_CLIENT_KEY && env.TOSS_SECRET_KEY);
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
