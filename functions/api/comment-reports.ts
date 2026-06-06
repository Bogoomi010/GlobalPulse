import { Env, badRequest, createId, ensureAnonymousSession, json, readJson, requireString } from '../_shared';

type ReportBody = {
  commentId?: string;
  anonymousToken?: string;
  reason?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readJson<ReportBody>(request);
    const commentId = requireString(body.commentId, 'commentId');
    const anonymousToken = requireString(body.anonymousToken, 'anonymousToken');
    const reason = requireString(body.reason || 'policy_review', 'reason').slice(0, 120);
    const comment = await env.DB.prepare(
      `
        SELECT id
        FROM comments
        WHERE id = ? AND status IN ('visible', 'reported')
      `,
    )
      .bind(commentId)
      .first<{ id: string }>();

    if (!comment) return badRequest('Comment not found', 404);

    const reporterSessionId = await ensureAnonymousSession(
      env.DB,
      anonymousToken,
      env.SESSION_TOKEN_SECRET,
    );

    const reportId = createId('report');
    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT INTO comment_reports
            (id, comment_id, reporter_session_id, reason)
          VALUES (?, ?, ?, ?)
        `,
      ).bind(reportId, commentId, reporterSessionId, reason),
      env.DB.prepare(
        `
          UPDATE comments
          SET status = CASE WHEN status = 'visible' THEN 'reported' ELSE status END
          WHERE id = ?
        `,
      ).bind(commentId),
    ]);

    return json({ reportId, status: 'received' });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid report request');
  }
};
