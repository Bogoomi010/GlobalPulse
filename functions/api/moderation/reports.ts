import { Env, badRequest, constantTimeEqual, createId, json, readJson, requireString } from '../../_shared';

type ModerationActionBody = {
  action?: string;
  commentId?: string;
  note?: string;
};

type ModerationQueueRow = {
  comment_id: string;
  issue_id: string;
  issue_title: string;
  content: string;
  comment_status: string;
  comment_created_at: string;
  author_name: string;
  author_email: string;
  review_action: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  report_count: number;
  open_report_count: number;
  first_reported_at: string;
  last_reported_at: string;
};

const allowedActions = new Set(['hide', 'restore', 'dismiss']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const unauthorized = requireModerator(request, env);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'open';
  const limit = clampLimit(url.searchParams.get('limit'));

  if (!['open', 'reviewed', 'all'].includes(status)) {
    return badRequest('status must be open, reviewed, or all');
  }

  const result = await env.DB.prepare(
    `
      WITH report_summary AS (
        SELECT
          c.id AS comment_id,
          c.issue_id,
          i.title AS issue_title,
          c.content,
          c.status AS comment_status,
          c.created_at AS comment_created_at,
          u.display_name AS author_name,
          u.email AS author_email,
          review.action AS review_action,
          review.note AS review_note,
          review.created_at AS reviewed_at,
          COUNT(r.id) AS report_count,
          SUM(
            CASE
              WHEN review.id IS NULL OR r.created_at > review.created_at THEN 1
              ELSE 0
            END
          ) AS open_report_count,
          MIN(r.created_at) AS first_reported_at,
          MAX(r.created_at) AS last_reported_at
        FROM comment_reports r
        JOIN comments c ON c.id = r.comment_id
        JOIN issues i ON i.id = c.issue_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN comment_report_reviews review ON review.comment_id = c.id
        GROUP BY c.id
      )
      SELECT *
      FROM report_summary
      WHERE ? = 'all'
        OR (? = 'open' AND open_report_count > 0)
        OR (? = 'reviewed' AND reviewed_at IS NOT NULL AND open_report_count = 0)
      ORDER BY last_reported_at DESC
      LIMIT ?
    `,
  )
    .bind(status, status, status, limit)
    .all<ModerationQueueRow>();

  return json({
    status,
    reports: (result.results ?? []).map((row) => ({
      commentId: row.comment_id,
      issueId: row.issue_id,
      issueTitle: row.issue_title,
      content: row.content,
      commentStatus: row.comment_status,
      commentCreatedAt: row.comment_created_at,
      author: {
        name: row.author_name,
        email: row.author_email,
      },
      review: row.review_action
        ? {
            action: row.review_action,
            note: row.review_note,
            reviewedAt: row.reviewed_at,
          }
        : null,
      reportCount: Number(row.report_count),
      openReportCount: Number(row.open_report_count),
      firstReportedAt: row.first_reported_at,
      lastReportedAt: row.last_reported_at,
    })),
  });
};

export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) => {
  const unauthorized = requireModerator(request, env);
  if (unauthorized) return unauthorized;

  try {
    const body = await readJson<ModerationActionBody>(request);
    const commentId = requireString(body.commentId, 'commentId');
    const action = requireString(body.action, 'action');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 240) : '';

    if (!allowedActions.has(action)) {
      return badRequest('action must be hide, restore, or dismiss');
    }

    const comment = await env.DB.prepare('SELECT id, status FROM comments WHERE id = ?')
      .bind(commentId)
      .first<{ id: string; status: string }>();

    if (!comment) return badRequest('Comment not found', 404);
    if (comment.status === 'deleted') return badRequest('Deleted comment cannot be moderated', 409);

    const nextStatus = action === 'hide' ? 'hidden' : 'visible';
    const reviewerLabel = 'moderator';

    await env.DB.batch([
      env.DB.prepare(
        `
          UPDATE comments
          SET status = ?
          WHERE id = ? AND status != 'deleted'
        `,
      ).bind(nextStatus, commentId),
      env.DB.prepare(
        `
          INSERT INTO comment_report_reviews
            (id, comment_id, action, note, reviewer_label)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(comment_id) DO UPDATE SET
            action = excluded.action,
            note = excluded.note,
            reviewer_label = excluded.reviewer_label,
            created_at = CURRENT_TIMESTAMP
        `,
      ).bind(createId('review'), commentId, action, note, reviewerLabel),
    ]);

    return json({
      commentId,
      action,
      commentStatus: nextStatus,
      openReportCount: 0,
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid moderation request');
  }
};

function requireModerator(request: Request, env: Env): Response | null {
  if (!env.MODERATION_ADMIN_TOKEN) {
    return badRequest('Moderation admin token is not configured', 503);
  }

  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  const bearerToken = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice('bearer '.length).trim()
    : '';
  const headerToken = request.headers.get('X-Moderation-Token') || request.headers.get('x-moderation-token');
  const token = bearerToken || headerToken || '';

  if (!token || !constantTimeEqual(token, env.MODERATION_ADMIN_TOKEN)) {
    return json({ error: 'Moderator authentication required' }, 401);
  }

  return null;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}
