import {
  Env,
  authenticateUser,
  badRequest,
  createId,
  json,
  readJson,
  requireString,
  unauthorized,
} from '../../_shared';
import { getPaymentProvider } from '../../_payments';

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
    const origin = normalizeOrigin(env.APP_PUBLIC_ORIGIN);
    if (!origin) return badRequest('APP_PUBLIC_ORIGIN must be configured before creating payments', 503);

    const existing = await env.DB.prepare(
      `
        SELECT id, provider_name, provider_order_id, provider_payment_id, amount, currency_code, status
        FROM payments
        WHERE idempotency_key = ? AND user_id = ?
      `,
    )
      .bind(idempotencyKey, user.id)
      .first<{
        id: string;
        provider_name: string;
        provider_order_id: string;
        provider_payment_id: string | null;
        amount: number;
        currency_code: string;
        status: string;
      }>();

    if (existing) {
      const provider = getPaymentProvider(existing.provider_name);
      if (!provider) return badRequest('Payment provider is not supported', 400);
      if (!provider.isReady(env)) return badRequest('Payment provider is not configured', 503);

      const payload = await provider.buildCheckoutPayload(env, {
        origin,
        paymentId: existing.id,
        orderId: existing.provider_order_id,
        providerPaymentId: existing.provider_payment_id,
        amount: Number(existing.amount),
        currencyCode: existing.currency_code,
        status: existing.status,
      });
      await updateProviderPaymentId(env.DB, existing.id, payload.providerPaymentId || payload.sessionId);
      return json(payload);
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

    const provider = getPaymentProvider(plan.provider_name);
    if (!provider) return badRequest('Payment provider is not supported', 400);
    if (!provider.isReady(env)) return badRequest('Payment provider is not configured', 503);

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

    const payload = await provider.buildCheckoutPayload(env, {
      paymentId,
      origin,
      orderId,
      amount: Number(plan.amount),
      currencyCode: plan.currency_code,
      status: 'pending',
    });
    await updateProviderPaymentId(env.DB, paymentId, payload.providerPaymentId || payload.sessionId);
    return json(payload);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid payment request');
  }
};

function normalizeOrigin(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

async function updateProviderPaymentId(
  db: D1Database,
  paymentId: string,
  providerPaymentId?: string,
): Promise<void> {
  if (!providerPaymentId) return;
  await db
    .prepare(
      `
        UPDATE payments
        SET provider_payment_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .bind(providerPaymentId, paymentId)
    .run();
}
