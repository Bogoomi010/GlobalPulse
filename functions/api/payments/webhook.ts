import { Env, badRequest, createId, json, recordTopupTransaction, tossAuthHeader, verifyTossSignature } from '../../_shared';

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
  provider_order_id: string;
  amount: number;
  currency_code: string;
  status: string;
};

type TossPayment = {
  paymentKey: string;
  orderId: string;
  totalAmount?: number;
  amount?: number;
  currency: string;
  status: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.TOSS_SECRET_KEY) {
    return badRequest('Toss Payments secret key is not configured', 503);
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get('tosspayments-webhook-signature') || request.headers.get('x-toss-signature');
  if (signatureHeader) {
    const signatureOk = await verifyTossSignature(request, rawBody, env.TOSS_WEBHOOK_SECRET);
    if (!signatureOk) return badRequest('Invalid webhook signature', 401);
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

  const providerPayment = await retrieveTossPayment(env.TOSS_SECRET_KEY, paymentKey, orderId);
  if (!providerPayment) return badRequest('Unable to verify payment with Toss Payments', 502);

  const payment = await env.DB.prepare(
    `
      SELECT id, user_id, provider_order_id, amount, currency_code, status
      FROM payments
      WHERE provider_order_id = ?
    `,
  )
    .bind(providerPayment.orderId)
    .first<PaymentRow>();

  if (!payment) return badRequest('Payment not found', 404);
  if (payment.status === 'paid') {
    return json({ status: 'already_processed', paymentId: payment.id });
  }

  const providerAmount = Number(providerPayment.totalAmount ?? providerPayment.amount);
  if (
    providerPayment.status !== 'DONE' ||
    providerAmount !== Number(payment.amount) ||
    providerPayment.currency !== payment.currency_code
  ) {
    const providerStatus = providerPayment.status.toUpperCase().includes('CANCEL') ? 'cancelled' : 'failed';
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
      .bind(status, providerPayment.paymentKey, payment.id)
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

    return json({ status: 'ignored', providerStatus: providerPayment.status, transactionRecorded });
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
    .bind(providerPayment.paymentKey, payment.id)
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

async function retrieveTossPayment(
  secretKey: string,
  paymentKey?: string,
  orderId?: string,
): Promise<TossPayment | null> {
  const path = paymentKey
    ? `/v1/payments/${encodeURIComponent(paymentKey)}`
    : `/v1/payments/orders/${encodeURIComponent(orderId || '')}`;
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    headers: {
      Authorization: tossAuthHeader(secretKey),
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as TossPayment;
}
