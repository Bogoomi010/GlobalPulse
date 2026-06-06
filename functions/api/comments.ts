import { Env, badRequest, createId, json, readJson, requireString } from '../_shared';

type CommentBody = {
  issueId?: string;
  userId?: string;
  content?: string;
  idempotencyKey?: string;
};

const commentCost = 100;

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const issueId = url.searchParams.get('issueId');
  if (!issueId) return badRequest('issueId is required');

  const result = await env.DB.prepare(
    `
      SELECT
        c.id,
        c.issue_id,
        c.content,
        c.cost_amount,
        c.currency_code,
        c.status,
        c.created_at,
        u.display_name
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.issue_id = ? AND c.status != 'deleted'
      ORDER BY c.created_at DESC
      LIMIT 100
    `,
  )
    .bind(issueId)
    .all<{
      id: string;
      issue_id: string;
      content: string;
      cost_amount: number;
      currency_code: string;
      status: string;
      created_at: string;
      display_name: string;
    }>();

  return json({
    comments: (result.results ?? []).map((comment) => ({
      id: comment.id,
      issueId: comment.issue_id,
      author: comment.display_name,
      content: comment.content,
      cost: Number(comment.cost_amount),
      currencyCode: comment.currency_code,
      status: comment.status,
      createdAt: comment.created_at,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readJson<CommentBody>(request);
    const issueId = requireString(body.issueId, 'issueId');
    const userId = requireString(body.userId, 'userId');
    const content = requireString(body.content, 'content').slice(0, 500);
    const idempotencyKey = requireString(body.idempotencyKey, 'idempotencyKey');

    const existing = await env.DB.prepare(
      `
        SELECT related_comment_id
        FROM wallet_transactions
        WHERE idempotency_key = ?
      `,
    )
      .bind(idempotencyKey)
      .first<{ related_comment_id: string }>();

    if (existing?.related_comment_id) {
      return json({ status: 'duplicate', commentId: existing.related_comment_id });
    }

    const wallet = await env.DB.prepare(
      `
        SELECT id, balance_amount
        FROM wallets
        WHERE user_id = ? AND currency_code = 'KRW'
      `,
    )
      .bind(userId)
      .first<{ id: string; balance_amount: number }>();

    if (!wallet) return badRequest('Wallet not found', 404);
    if (Number(wallet.balance_amount) < commentCost) {
      return badRequest('Insufficient wallet balance', 402);
    }

    const commentId = createId('comment');
    const transactionId = createId('wtx');

    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT INTO comments
            (id, issue_id, user_id, content, cost_amount, currency_code, status)
          VALUES (?, ?, ?, ?, 100, 'KRW', 'visible')
        `,
      ).bind(commentId, issueId, userId, content),
      env.DB.prepare(
        `
          UPDATE wallets
          SET balance_amount = balance_amount - 100,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND balance_amount >= 100
        `,
      ).bind(wallet.id),
      env.DB.prepare(
        `
          INSERT INTO wallet_transactions
            (id, user_id, wallet_id, transaction_type, amount, currency_code, status, related_issue_id, related_comment_id, idempotency_key)
          VALUES (?, ?, ?, 'comment_spend', -100, 'KRW', 'completed', ?, ?, ?)
        `,
      ).bind(transactionId, userId, wallet.id, issueId, commentId, idempotencyKey),
    ]);

    const nextWallet = await env.DB.prepare('SELECT balance_amount FROM wallets WHERE id = ?')
      .bind(wallet.id)
      .first<{ balance_amount: number }>();

    return json({
      comment: {
        id: commentId,
        issueId,
        author: 'You',
        content,
        cost: commentCost,
        currencyCode: 'KRW',
        status: 'visible',
        createdAt: new Date().toISOString(),
      },
      wallet: {
        balance: Number(nextWallet?.balance_amount ?? 0),
      },
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid comment request');
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const commentId = url.searchParams.get('commentId');
  const userId = url.searchParams.get('userId');
  if (!commentId || !userId) return badRequest('commentId and userId are required');

  const result = await env.DB.prepare(
    `
      UPDATE comments
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
  )
    .bind(commentId, userId)
    .run();

  return json({ deleted: result.meta.changes > 0 });
};
