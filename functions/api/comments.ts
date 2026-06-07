import { Env, authenticateUser, badRequest, createId, json, readJson, requireString, unauthorized } from '../_shared';

type CommentBody = {
  issueId?: string;
  content?: string;
  idempotencyKey?: string;
};

const commentCost = 0;

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const issueId = url.searchParams.get('issueId');
  if (!issueId) return badRequest('issueId is required');

  const result = await env.DB.prepare(
    `
      SELECT
        c.id,
        c.issue_id,
        c.user_id,
        c.content,
        c.cost_amount,
        c.currency_code,
        c.status,
        c.created_at,
        u.display_name
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.issue_id = ? AND c.status IN ('visible', 'reported')
      ORDER BY c.created_at DESC
      LIMIT 100
    `,
  )
    .bind(issueId)
    .all<{
      id: string;
      issue_id: string;
      user_id: string;
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
      userId: comment.user_id,
      author: comment.display_name,
      content: comment.content,
      cost: commentCost,
      currencyCode: comment.currency_code,
      status: comment.status,
      createdAt: comment.created_at,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await authenticateUser(request, env);
    if (!user) return unauthorized();

    const body = await readJson<CommentBody>(request);
    const issueId = requireString(body.issueId, 'issueId');
    const content = requireString(body.content, 'content').slice(0, 500);
    const idempotencyKey = requireString(body.idempotencyKey, 'idempotencyKey');
    const supportsCommentIdempotency = await hasCommentIdempotency(env.DB);

    const existing = supportsCommentIdempotency
      ? await env.DB.prepare(
          `
            SELECT id
            FROM comments
            WHERE user_id = ? AND idempotency_key = ?
          `,
        )
          .bind(user.id, idempotencyKey)
          .first<{ id: string }>()
      : null;

    if (existing?.id) {
      return json({ status: 'duplicate', commentId: existing.id });
    }

    const issue = await env.DB.prepare('SELECT id FROM issues WHERE id = ?')
      .bind(issueId)
      .first<{ id: string }>();

    if (!issue) return badRequest('Issue not found', 404);

    const commentId = createId('comment');

    const commentWrite = supportsCommentIdempotency
      ? await env.DB.prepare(
          `
            INSERT INTO comments
              (id, issue_id, user_id, content, cost_amount, currency_code, status, idempotency_key)
            VALUES (?, ?, ?, ?, 0, 'KRW', 'visible', ?)
          `,
        )
          .bind(commentId, issueId, user.id, content, idempotencyKey)
          .run()
      : await env.DB.prepare(
          `
            INSERT INTO comments
              (id, issue_id, user_id, content, cost_amount, currency_code, status)
            VALUES (?, ?, ?, ?, 100, 'KRW', 'visible')
          `,
        )
          .bind(commentId, issueId, user.id, content)
          .run();

    if (Number(commentWrite.meta.changes ?? 0) === 0) {
      return badRequest('Unable to create comment', 409);
    }

    return json({
      comment: {
        id: commentId,
        issueId,
        userId: user.id,
        author: user.displayName,
        content,
        cost: commentCost,
        currencyCode: 'KRW',
        status: 'visible',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid comment request');
  }
};

async function hasCommentIdempotency(db: D1Database): Promise<boolean> {
  const result = await db.prepare('PRAGMA table_info(comments)').all<{ name: string }>();
  return (result.results ?? []).some((column) => column.name === 'idempotency_key');
}

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  const user = await authenticateUser(request, env);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const commentId = url.searchParams.get('commentId');
  if (!commentId) return badRequest('commentId is required');

  const result = await env.DB.prepare(
    `
      UPDATE comments
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
  )
    .bind(commentId, user.id)
    .run();

  return json({ deleted: result.meta.changes > 0 });
};
