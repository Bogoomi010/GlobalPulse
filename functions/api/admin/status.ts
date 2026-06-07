import { requireAdmin } from '../../_admin';
import { Env, json } from '../../_shared';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const issueCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM issues').first<{ count: number }>();
  const activePaymentPlans = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM payment_plans WHERE is_active = 1',
  ).first<{ count: number }>();

  return json({
    auth: {
      emailFromConfigured: Boolean(env.AUTH_EMAIL_FROM),
      logDeliveryEnabled: env.AUTH_EMAIL_DELIVERY === 'log',
      provider: env.AUTH_PROVIDER || '',
      resendConfigured: Boolean(env.RESEND_API_KEY),
    },
    config: {
      appPublicOriginConfigured: Boolean(env.APP_PUBLIC_ORIGIN),
      demoLoginEnabled: env.ALLOW_DEMO_LOGIN === 'true',
      launchReviewAcknowledged: env.LAUNCH_REVIEW_ACK === 'GLOBALPULSE_LAUNCH_REVIEW_COMPLETE',
      moderationAdminTokenConfigured: Boolean(env.MODERATION_ADMIN_TOKEN),
      sessionSecretConfigured: Boolean(env.SESSION_TOKEN_SECRET),
    },
    d1: {
      issueCount: Number(issueCount?.count ?? 0),
    },
    payments: {
      activePlanCount: Number(activePaymentPlans?.count ?? 0),
      mode: 'disabled',
    },
    status: 'ok',
  });
};
