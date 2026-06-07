import { Env, authenticateUser, json, unauthorized } from '../_shared';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const user = await authenticateUser(request, env);
  if (!user) return unauthorized();

  const wallet = await env.DB.prepare(
    `
      SELECT id, currency_code, balance_amount
      FROM wallets
      WHERE user_id = ? AND currency_code = 'KRW'
    `,
  )
    .bind(user.id)
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
    .bind(user.id)
    .all<{
      id: string;
      transaction_type: string;
      amount: number;
      currency_code: string;
      status: string;
      idempotency_key: string;
      created_at: string;
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
      label: formatTransactionLabel(transaction.transaction_type, transaction.status),
      reference: transaction.idempotency_key,
      createdAt: transaction.created_at,
    })),
    plans: [],
  });
};

function formatTransactionLabel(type: string, status: string): string {
  if (type === 'topup') {
    if (status === 'completed') return 'Legacy top-up completed';
    if (status === 'cancelled') return 'Legacy top-up cancelled';
    if (status === 'failed') return 'Legacy top-up failed';
    return 'Legacy top-up pending';
  }

  if (type === 'comment_spend') return 'Comment';
  if (type === 'refund') {
    if (status === 'pending') return 'Refund pending balance recovery';
    return 'Payment refund';
  }
  if (type === 'adjustment') return 'Wallet adjustment';
  return 'Wallet transaction';
}
