import { Env, badRequest, ensureAnonymousSession, json, readJson, requireString } from '../_shared';

type ReactionBody = {
  anonymousToken?: string;
  issueId?: string;
  reactionType?: 'like' | 'dislike';
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readJson<ReactionBody>(request);
    const issueId = requireString(body.issueId, 'issueId');
    const anonymousToken = requireString(body.anonymousToken, 'anonymousToken');
    const reactionType = body.reactionType;

    if (reactionType !== 'like' && reactionType !== 'dislike') {
      return badRequest('reactionType must be like or dislike');
    }

    const issue = await env.DB.prepare('SELECT id FROM issues WHERE id = ?').bind(issueId).first();
    if (!issue) return badRequest('Issue not found', 404);

    const anonymousSessionId = await ensureAnonymousSession(
      env.DB,
      anonymousToken,
      env.SESSION_TOKEN_SECRET,
    );
    const existing = await env.DB.prepare(
      `
        SELECT id, reaction_type
        FROM issue_reactions
        WHERE issue_id = ? AND anonymous_session_id = ?
      `,
    )
      .bind(issueId, anonymousSessionId)
      .first<{ id: string; reaction_type: 'like' | 'dislike' }>();

    let currentReaction: 'like' | 'dislike' | null = reactionType;
    if (!existing) {
      await env.DB.prepare(
        `
          INSERT INTO issue_reactions
            (id, issue_id, anonymous_session_id, reaction_type)
          VALUES (?, ?, ?, ?)
        `,
      )
        .bind(crypto.randomUUID(), issueId, anonymousSessionId, reactionType)
        .run();
    } else if (existing.reaction_type === reactionType) {
      await env.DB.prepare('DELETE FROM issue_reactions WHERE id = ?').bind(existing.id).run();
      currentReaction = null;
    } else {
      await env.DB.prepare(
        `
          UPDATE issue_reactions
          SET reaction_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
        .bind(reactionType, existing.id)
        .run();
    }

    const counts = await env.DB.prepare(
      `
        SELECT
          i.seed_like_count + (
            SELECT COUNT(*) FROM issue_reactions r
            WHERE r.issue_id = i.id AND r.reaction_type = 'like'
          ) AS likes,
          i.seed_dislike_count + (
            SELECT COUNT(*) FROM issue_reactions r
            WHERE r.issue_id = i.id AND r.reaction_type = 'dislike'
          ) AS dislikes
        FROM issues i
        WHERE i.id = ?
      `,
    )
      .bind(issueId)
      .first<{ likes: number; dislikes: number }>();

    return json({
      issueId,
      currentReaction,
      likes: Number(counts?.likes ?? 0),
      dislikes: Number(counts?.dislikes ?? 0),
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid reaction request');
  }
};
