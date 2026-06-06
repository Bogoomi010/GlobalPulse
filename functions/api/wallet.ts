import { Env, badRequest, json } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const countryCode = (url.searchParams.get('countryCode') || 'KR').toUpperCase();

  if (!userId) return badRequest('userId is required');

  const wallet = await env.DB.prepare(
    `
      SELECT id, currency_code, balance_amount
      FROM wallets
      WHERE user_id = ? AND currency_code = 'KRW'
    `,
  )
    .bind(userId)
    .first<{ id: string; currency_code: string; balance_amount: number }>();

  const transactions = await env.DB.prepare(
    `
      SELECT id, transaction_type, amount, currency_code, status, idempotency_key, created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `,
  )
    .bind(userId)
    .all<{
      id: string;
      transaction_type: string;
      amount: number;
      currency_code: string;
      status: string;
      idempotency_key: string;
      created_at: string;
    }>();

  const plans = await env.DB.prepare(
    `
      SELECT id, country_code, currency_code, amount, display_label, provider_name, provider_price_id
      FROM payment_plans
      WHERE is_active = 1 AND (country_code = ? OR country_code != 'KR')
      ORDER BY country_code = ? DESC, amount ASC
    `,
  )
    .bind(countryCode, countryCode)
    .all<{
      id: string;
      country_code: string;
      currency_code: string;
      amount: number;
      display_label: string;
      provider_name: string;
      provider_price_id: string | null;
    }>();

  return json({
    wallet: {
      id: wallet?.id,
      currencyCode: wallet?.currency_code ?? 'KRW',
      balance: Number(wallet?.balance_amount ?? 0),
    },
    transactions: (transactions.results ?? []).map((transaction) => ({
      id: transaction.id,
      type: transaction.transaction_type,
      amount: Number(transaction.amount),
      currencyCode: transaction.currency_code,
      status: transaction.status,
      label: transaction.idempotency_key,
      createdAt: transaction.created_at,
    })),
    plans: (plans.results ?? []).map((plan) => ({
      id: plan.id,
      country: plan.country_code,
      currency: plan.currency_code,
      amount: Number(plan.amount),
      label: plan.display_label,
      provider: plan.provider_name,
      providerPriceId: plan.provider_price_id,
    })),
  });
};
