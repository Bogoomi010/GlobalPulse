import { Env, badRequest, json, readJson, requireString } from '../../_shared';

type FailPaymentBody = {
  orderId?: string;
  code?: string;
  message?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readJson<FailPaymentBody>(request);
    const orderId = requireString(body.orderId, 'orderId');
    const code = String(body.code || 'PAYMENT_FAILED');
    const status = code.toUpperCase().includes('CANCEL') ? 'cancelled' : 'failed';

    const result = await env.DB.prepare(
      `
        UPDATE payments
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE provider_order_id = ? AND status NOT IN ('paid', 'refunded')
      `,
    )
      .bind(status, orderId)
      .run();

    return json({
      status,
      updated: result.meta.changes > 0,
      code,
      message: body.message || '',
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid payment failure request');
  }
};
