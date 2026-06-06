import { Env, badRequest, json, readJson, recordTopupTransaction, requireString } from '../../_shared';

type FailPaymentBody = {
  orderId?: string;
  code?: string;
  message?: string;
};

type PaymentRow = {
  id: string;
  user_id: string;
  amount: number;
  currency_code: string;
  status: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readJson<FailPaymentBody>(request);
    const orderId = requireString(body.orderId, 'orderId');
    const code = String(body.code || 'PAYMENT_FAILED');
    const requestedStatus = code.toUpperCase().includes('CANCEL') ? 'cancelled' : 'failed';

    const payment = await env.DB.prepare(
      `
        SELECT id, user_id, amount, currency_code, status
        FROM payments
        WHERE provider_order_id = ?
      `,
    )
      .bind(orderId)
      .first<PaymentRow>();

    if (!payment) return badRequest('Payment not found', 404);
    if (payment.status === 'paid' || payment.status === 'refunded') {
      return json({
        status: payment.status,
        updated: false,
        transactionRecorded: false,
        code,
        message: body.message || '',
      });
    }

    const status =
      payment.status === 'failed' || payment.status === 'cancelled' ? payment.status : requestedStatus;

    const result = await env.DB.prepare(
      `
        UPDATE payments
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status NOT IN ('paid', 'refunded')
      `,
    )
      .bind(status, payment.id)
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

    if (!wallet) return badRequest('Wallet not found', 404);

    const transactionRecorded = await recordTopupTransaction(env.DB, {
      userId: payment.user_id,
      walletId: wallet.id,
      paymentId: payment.id,
      amount: Number(payment.amount),
      currencyCode: payment.currency_code,
      status,
    });

    return json({
      status,
      updated: Number(result.meta.changes ?? 0) > 0,
      transactionRecorded,
      code,
      message: body.message || '',
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid payment failure request');
  }
};
