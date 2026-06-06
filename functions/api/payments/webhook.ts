import { Env, badRequest, createId, json, recordTopupTransaction } from '../../_shared';
import { ProviderPayment, configuredPaymentProvider } from '../../_payments';

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
  if (!env.TOSS_WEBHOOK_SECRET) {
    return badRequest('TOSS_WEBHOOK_SECRET must be configured before processing payment webhooks', 503);
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get('tosspayments-webhook-signature') || request.headers.get('x-toss-signature');
  if (!signatureHeader) return badRequest('Missing webhook signature', 401);
  const signatureOk = await provider.verifyWebhookSignature(env, request, rawBody);
  if (!signatureOk) return badRequest('Invalid webhook signature', 401);

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
  if (payment.status === 'paid' && providerPayment.status === 'paid') {
    return json({ status: 'already_processed', paymentId: payment.id });
  }

  if (
    (payment.status === 'paid' || payment.status === 'refunded') &&
    providerPayment.status === 'cancelled'
  ) {
    return handlePaidPaymentCancellation(env.DB, payment, providerPayment);
  }

  if (payment.status === 'refunded') {
    return json({ status: 'refunded', paymentId: payment.id, alreadyProcessed: true });
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

async function handlePaidPaymentCancellation(
  db: D1Database,
  payment: PaymentRow,
  providerPayment: ProviderPayment,
): Promise<Response> {
  const cancelledAmount = Math.min(
    Number(providerPayment.canceledAmount || payment.amount),
    Number(payment.amount),
  );
  if (!Number.isFinite(cancelledAmount) || cancelledAmount <= 0) {
    return json({ status: 'already_processed', paymentId: payment.id, refundRecorded: false });
  }

  const alreadyRecorded = await db
    .prepare(
      `
        SELECT COALESCE(SUM(ABS(amount)), 0) AS amount
        FROM wallet_transactions
        WHERE payment_id = ?
          AND transaction_type = 'refund'
          AND status IN ('pending', 'completed')
      `,
    )
    .bind(payment.id)
    .first<{ amount: number }>();

  const refundDelta = cancelledAmount - Number(alreadyRecorded?.amount ?? 0);
  const nextPaymentStatus = cancelledAmount >= Number(payment.amount) ? 'refunded' : 'paid';

  if (refundDelta <= 0) {
    await db
      .prepare(
        `
          UPDATE payments
          SET status = ?,
              provider_payment_id = COALESCE(provider_payment_id, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(nextPaymentStatus, providerPayment.providerPaymentId, payment.id)
      .run();
    return json({ status: nextPaymentStatus, paymentId: payment.id, refundRecorded: false });
  }

  const wallet = await db
    .prepare(
      `
        SELECT id, balance_amount
        FROM wallets
        WHERE user_id = ? AND currency_code = ?
      `,
    )
    .bind(payment.user_id, payment.currency_code)
    .first<{ id: string; balance_amount: number }>();

  if (!wallet) return badRequest('Wallet not found', 404);

  const transactionId = createId('wtx');
  const transactionStatus = Number(wallet.balance_amount) >= refundDelta ? 'completed' : 'pending';
  const idempotencyKey = `payment:${payment.id}:refund:${cancelledAmount}`;
  const statements = [
    db
      .prepare(
        `
          UPDATE payments
          SET status = ?,
              provider_payment_id = COALESCE(provider_payment_id, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(nextPaymentStatus, providerPayment.providerPaymentId, payment.id),
  ];

  if (transactionStatus === 'completed') {
    statements.push(
      db
        .prepare(
          `
            UPDATE wallets
            SET balance_amount = balance_amount - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND balance_amount >= ?
          `,
        )
        .bind(refundDelta, wallet.id, refundDelta),
    );
  }

  statements.push(
    db
      .prepare(
        `
          INSERT OR IGNORE INTO wallet_transactions
            (id, user_id, wallet_id, transaction_type, amount, currency_code, status, payment_id, idempotency_key)
          VALUES (?, ?, ?, 'refund', ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        transactionId,
        payment.user_id,
        wallet.id,
        -refundDelta,
        payment.currency_code,
        transactionStatus,
        payment.id,
        idempotencyKey,
      ),
  );

  const results = await db.batch(statements);
  const refundRecorded = Number(results.at(-1)?.meta.changes ?? 0) > 0;

  return json({
    status: nextPaymentStatus,
    paymentId: payment.id,
    refundAmount: refundDelta,
    refundRecorded,
    walletAdjusted: transactionStatus === 'completed',
  });
}
