import { Env, badRequest, createId, json, recordTopupTransaction } from '../../_shared';
import { configuredPaymentProvider } from '../../_payments';

type TossWebhookPayload = {
  eventType?: string;
  data?: {
    paymentKey?: string;
    orderId?: string;
    status?: string;
    totalAmount?: number;
    amount?: number;
    currency?: string;
  };
  paymentKey?: string;
  orderId?: string;
  status?: string;
  totalAmount?: number;
  amount?: number;
  currency?: string;
};

type PaymentRow = {
  id: string;
  user_id: string;
  provider_name: string;
  provider_order_id: string;
  amount: number;
  currency_code: string;
  status: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const provider = configuredPaymentProvider(env);
  if (!provider) return badRequest('Payment provider is not supported', 400);
  if (!provider.isReady(env)) return badRequest('Payment provider is not configured', 503);

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get('tosspayments-webhook-signature') || request.headers.get('x-toss-signature');
  if (signatureHeader) {
    const signatureOk = await provider.verifyWebhookSignature(env, request, rawBody);
    if (!signatureOk) return badRequest('Invalid webhook signature', 401);
  } else if (env.TOSS_WEBHOOK_SECRET) {
    return badRequest('Missing webhook signature', 401);
  }

  let payload: TossWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as TossWebhookPayload;
  } catch {
    return badRequest('Invalid webhook payload');
  }

  const paymentKey = payload.data?.paymentKey || payload.paymentKey;
  const orderId = payload.data?.orderId || payload.orderId;
  if (!paymentKey && !orderId) return badRequest('paymentKey or orderId is required');

  const providerPayment = await provider.retrievePayment(env, { paymentKey, orderId });
  if (!providerPayment) return badRequest('Unable to verify payment with Toss Payments', 502);

  const payment = await env.DB.prepare(
    `
      SELECT id, user_id, provider_name, provider_order_id, amount, currency_code, status
      FROM payments
      WHERE provider_order_id = ?
    `,
  )
    .bind(providerPayment.providerOrderId)
    .first<PaymentRow>();

  if (!payment) return badRequest('Payment not found', 404);
  if (payment.provider_name !== provider.name) return badRequest('Webhook provider does not match payment', 400);
  if (payment.status === 'paid') {
    return json({ status: 'already_processed', paymentId: payment.id });
  }

  if (
    providerPayment.status !== 'paid' ||
    Number(providerPayment.amount) !== Number(payment.amount) ||
    providerPayment.currencyCode !== payment.currency_code
  ) {
    const providerStatus = providerPayment.status === 'cancelled' ? 'cancelled' : 'failed';
    const status =
      payment.status === 'failed' || payment.status === 'cancelled' ? payment.status : providerStatus;
    await env.DB.prepare(
      `
        UPDATE payments
        SET status = ?,
            provider_payment_id = COALESCE(provider_payment_id, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status != 'paid'
      `,
    )
      .bind(status, providerPayment.providerPaymentId, payment.id)
      .run();

    const wallet = await env.DB.prepare(
      `
        SELECT id
        FROM wallets
        WHERE user_id = ? AND currency_code = ?
      `,
    )
      .bind(payment.user_id, payment.currency_code)
      .first<{ id: string }>();

    const transactionRecorded = wallet
      ? await recordTopupTransaction(env.DB, {
          userId: payment.user_id,
          walletId: wallet.id,
          paymentId: payment.id,
          amount: Number(payment.amount),
          currencyCode: payment.currency_code,
          status,
        })
      : false;

    return json({ status: 'ignored', providerStatus: providerPayment.rawStatus, transactionRecorded });
  }

  const wallet = await env.DB.prepare(
    `
      SELECT id
      FROM wallets
      WHERE user_id = ? AND currency_code = ?
    `,
  )
    .bind(payment.user_id, payment.currency_code)
    .first<{ id: string }>();

  if (!wallet) return badRequest('Wallet not found', 404);

  const paidUpdate = await env.DB.prepare(
    `
      UPDATE payments
      SET status = 'paid',
          provider_payment_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'paid'
    `,
    )
    .bind(providerPayment.providerPaymentId, payment.id)
    .run();

  if (paidUpdate.meta.changes === 0) {
    return json({ status: 'already_processed', paymentId: payment.id });
  }

  await env.DB.batch([
    env.DB.prepare(
      `
        UPDATE wallets
        SET balance_amount = balance_amount + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).bind(Number(payment.amount), wallet.id),
    env.DB.prepare(
      `
        INSERT OR IGNORE INTO wallet_transactions
          (id, user_id, wallet_id, transaction_type, amount, currency_code, status, payment_id, idempotency_key)
        VALUES (?, ?, ?, 'topup', ?, ?, 'completed', ?, ?)
      `,
    ).bind(
      createId('wtx'),
      payment.user_id,
      wallet.id,
      Number(payment.amount),
      payment.currency_code,
      payment.id,
      `payment:${payment.id}`,
    ),
  ]);

  return json({ status: 'paid', paymentId: payment.id });
};
