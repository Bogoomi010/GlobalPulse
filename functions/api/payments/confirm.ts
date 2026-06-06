import { Env, badRequest, createId, json, readJson, requireString, tossAuthHeader } from '../../_shared';

type ConfirmPaymentBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
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
  amount?: number;
  totalAmount?: number;
  currency: string;
  status: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.TOSS_SECRET_KEY) {
      return badRequest('Toss Payments secret key is not configured', 503);
    }

    const body = await readJson<ConfirmPaymentBody>(request);
    const paymentKey = requireString(body.paymentKey, 'paymentKey');
    const orderId = requireString(body.orderId, 'orderId');
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) return badRequest('amount must be a positive integer');

    const payment = await env.DB.prepare(
      `
        SELECT id, user_id, provider_order_id, amount, currency_code, status
        FROM payments
        WHERE provider_order_id = ?
      `,
    )
      .bind(orderId)
      .first<PaymentRow>();

    if (!payment) return badRequest('Payment not found', 404);
    if (payment.status === 'paid') return json({ status: 'paid', alreadyProcessed: true });
    if (Number(payment.amount) !== amount) {
      await markPaymentFailed(env.DB, payment.id, paymentKey);
      return badRequest('Payment amount does not match the server-side payment record', 400);
    }

    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: tossAuthHeader(env.TOSS_SECRET_KEY),
        'Content-Type': 'application/json',
        'Idempotency-Key': payment.id,
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    if (!tossResponse.ok) {
      await markPaymentFailed(env.DB, payment.id, paymentKey);
      return json({ status: 'failed', providerError: await tossResponse.json() }, tossResponse.status);
    }

    const tossPayment = (await tossResponse.json()) as TossPayment;
    const approvedAmount = Number(tossPayment.totalAmount ?? tossPayment.amount);
    if (tossPayment.status !== 'DONE' || approvedAmount !== Number(payment.amount)) {
      await markPaymentFailed(env.DB, payment.id, paymentKey);
      return badRequest('Payment was not approved by provider with the expected amount', 400);
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

    const transactionId = createId('wtx');
    await env.DB.batch([
      env.DB.prepare(
        `
          UPDATE payments
          SET status = 'paid',
              provider_payment_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status != 'paid'
        `,
      ).bind(paymentKey, payment.id),
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
        transactionId,
        payment.user_id,
        wallet.id,
        Number(payment.amount),
        payment.currency_code,
        payment.id,
        `payment:${payment.id}`,
      ),
    ]);

    const nextWallet = await env.DB.prepare('SELECT balance_amount FROM wallets WHERE id = ?')
      .bind(wallet.id)
      .first<{ balance_amount: number }>();

    return json({
      status: 'paid',
      paymentId: payment.id,
      wallet: {
        balance: Number(nextWallet?.balance_amount ?? 0),
      },
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid payment confirmation request');
  }
};

async function markPaymentFailed(db: D1Database, paymentId: string, paymentKey: string): Promise<void> {
  await db
    .prepare(
      `
        UPDATE payments
        SET status = 'failed',
            provider_payment_id = COALESCE(provider_payment_id, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status != 'paid'
      `,
    )
    .bind(paymentKey, paymentId)
    .run();
}
