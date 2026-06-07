import { requireAdmin } from '../../_admin';
import { Env, json } from '../../_shared';

const requiredTables = [
  'anonymous_sessions',
  'comment_report_reviews',
  'comment_reports',
  'comments',
  'email_login_codes',
  'issue_reactions',
  'issue_sources',
  'issues',
  'payment_plans',
  'payments',
  'user_sessions',
  'users',
  'wallet_transactions',
  'wallets',
];

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = normalizeOrigin(env.APP_PUBLIC_ORIGIN);
  const issueCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM issues').first<{ count: number }>();
  const tableResult = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all<{ name: string }>();
  const activePaymentPlans = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM payment_plans WHERE is_active = 1',
  ).first<{ count: number }>();
  const existingTables = new Set((tableResult.results ?? []).map((row) => row.name));
  const missingTables = requiredTables.filter((table) => !existingTables.has(table));

  return json({
    auth: {
      emailFromConfigured: Boolean(env.AUTH_EMAIL_FROM),
      logDeliveryEnabled: env.AUTH_EMAIL_DELIVERY === 'log',
      provider: env.AUTH_PROVIDER || '',
      resendConfigured: Boolean(env.RESEND_API_KEY),
    },
    config: {
      appPublicOriginConfigured: Boolean(env.APP_PUBLIC_ORIGIN),
      appPublicOriginHttps: configuredOrigin ? configuredOrigin.startsWith('https://') : false,
      appPublicOriginMatchesRequest: Boolean(configuredOrigin && configuredOrigin === requestOrigin),
      demoLoginEnabled: env.ALLOW_DEMO_LOGIN === 'true',
      launchReviewAcknowledged: env.LAUNCH_REVIEW_ACK === 'GLOBALPULSE_LAUNCH_REVIEW_COMPLETE',
      moderationAdminTokenConfigured: Boolean(env.MODERATION_ADMIN_TOKEN),
      sessionSecretConfigured: Boolean(env.SESSION_TOKEN_SECRET),
    },
    d1: {
      issueCount: Number(issueCount?.count ?? 0),
      missingTables,
      requiredTableCount: requiredTables.length,
      requiredTablesPresent: missingTables.length === 0,
    },
    payments: {
      activePlanCount: Number(activePaymentPlans?.count ?? 0),
      mode: 'disabled',
    },
    status: 'ok',
  });
};

function normalizeOrigin(value?: string): string {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}
