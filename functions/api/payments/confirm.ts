import {
  Env,
  badRequest,
  createId,
  json,
  readJson,
  recordTopupTransaction,
  requireString,
} from '../../_shared';
import { getPaymentProvider } from '../../_payments';

type ConfirmPaymentBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
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
  try {
    const body = await readJson<ConfirmPaymentBody>(request);
    const paymentKey = requireString(body.paymentKey, 'paymentKey');
    const orderId = requireString(body.orderId, 'orderId');
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) return badRequest('amount must be a positive integer');

    const payment = await env.DB.prepare(
      `
        SELECT id, user_id, provider_name, provider_order_id, amount, currency_code, status
        FROM payments
        WHERE provider_order_id = ?
      `,
    )
      .bind(orderId)
      .first<PaymentRow>();

    if (!payment) return badRequest('Payment not found', 404);
    if (payment.status === 'paid') return json({ status: 'paid', alreadyProcessed: true });

    const provider = getPaymentProvider(payment.provider_name);
    if (!provider) return badRequest('Payment provider is not supported', 400);
    if (!provider.isReady(env)) return badRequest('Payment provider is not configured', 503);

    if (Number(payment.amount) !== amount) {
      await markPaymentFailed(env.DB, payment, paymentKey);
      return badRequest('Payment amount does not match the server-side payment record', 400);
    }

    const providerResult = await provider.confirmPayment(env, {
      paymentKey,
      orderId,
      amount,
      idempotencyKey: payment.id,
    });

    if (!providerResult.ok) {
      await markPaymentFailed(env.DB, payment, paymentKey);
      return json({ status: 'failed', providerError: providerResult.providerError }, providerResult.status);
    }

    const providerPayment = providerResult.payment;
    if (
      providerPayment.status !== 'paid' ||
      providerPayment.providerOrderId !== payment.provider_order_id ||
      Number(providerPayment.amount) !== Number(payment.amount) ||
      providerPayment.currencyCode !== payment.currency_code
    ) {
      await markPaymentFailed(env.DB, payment, paymentKey);
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
      return json({ status: 'paid', alreadyProcessed: true });
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

async function markPaymentFailed(
  db: D1Database,
  payment: PaymentRow,
  paymentKey: string,
): Promise<void> {
  const status = payment.status === 'cancelled' ? 'cancelled' : 'failed';

  await db
    .prepare(
      `
        UPDATE payments
        SET status = ?,
            provider_payment_id = COALESCE(provider_payment_id, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status NOT IN ('paid', 'refunded')
      `,
    )
    .bind(status, paymentKey, payment.id)
    .run();

  const wallet = await db
    .prepare(
      `
        SELECT id
        FROM wallets
        WHERE user_id = ? AND currency_code = ?
      `,
    )
    .bind(payment.user_id, payment.currency_code)
    .first<{ id: string }>();

  if (!wallet) return;

  await recordTopupTransaction(db, {
    userId: payment.user_id,
    walletId: wallet.id,
    paymentId: payment.id,
    amount: Number(payment.amount),
    currencyCode: payment.currency_code,
    status,
  });
}
