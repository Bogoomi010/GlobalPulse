import {
  Env,
  authenticateUser,
  badRequest,
  createId,
  json,
  paymentProviderReady,
  readJson,
  requireString,
  unauthorized,
} from '../../_shared';

type CreatePaymentBody = {
  planId?: string;
  idempotencyKey?: string;
  origin?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await authenticateUser(request, env);
    if (!user) return unauthorized();

    const body = await readJson<CreatePaymentBody>(request);
    const planId = requireString(body.planId, 'planId');
    const idempotencyKey = requireString(body.idempotencyKey, 'idempotencyKey');
    const origin = body.origin || new URL(request.url).origin;

    if (!paymentProviderReady(env)) {
      return badRequest('Payment provider is not configured', 503);
    }

    const existing = await env.DB.prepare(
      `
        SELECT id, provider_order_id, amount, currency_code, status
        FROM payments
        WHERE idempotency_key = ? AND user_id = ?
      `,
    )
      .bind(idempotencyKey, user.id)
      .first<{
        id: string;
        provider_order_id: string;
        amount: number;
        currency_code: string;
        status: string;
      }>();

    if (existing) {
      return json({
        paymentId: existing.id,
        orderId: existing.provider_order_id,
        orderName: `GlobalPulse ${existing.amount} ${existing.currency_code} top-up`,
        amount: Number(existing.amount),
        currency: existing.currency_code,
        status: existing.status,
        clientKey: env.TOSS_CLIENT_KEY,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
      });
    }

    const plan = await env.DB.prepare(
      `
        SELECT id, amount, currency_code, provider_name
        FROM payment_plans
        WHERE id = ? AND is_active = 1
      `,
    )
      .bind(planId)
      .first<{ id: string; amount: number; currency_code: string; provider_name: string }>();

    if (!plan) return badRequest('Payment plan not found', 404);
    if (plan.provider_name !== 'toss') return badRequest('Only Toss Payments is enabled for live KRW top-ups', 400);

    const paymentId = createId('pay');
    const orderId = `gp_${crypto.randomUUID().replaceAll('-', '').slice(0, 28)}`;

    await env.DB.prepare(
      `
        INSERT INTO payments
          (id, user_id, payment_plan_id, provider_name, provider_order_id, provider_payment_id, amount, currency_code, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'pending', ?)
      `,
    )
      .bind(
        paymentId,
        user.id,
        plan.id,
        plan.provider_name,
        orderId,
        Number(plan.amount),
        plan.currency_code,
        idempotencyKey,
      )
      .run();

    return json({
      paymentId,
      orderId,
      orderName: `GlobalPulse ${plan.amount} ${plan.currency_code} top-up`,
      amount: Number(plan.amount),
      currency: plan.currency_code,
      status: 'pending',
      clientKey: env.TOSS_CLIENT_KEY,
      successUrl: `${origin}/payment/success`,
      failUrl: `${origin}/payment/fail`,
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid payment request');
  }
};
