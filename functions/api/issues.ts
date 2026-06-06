import { Env, IssueRow, json, normalizeIssue } from '../_shared';

type SourceRow = {
  issue_id: string;
  source_name: string;
  source_url: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const issueResult = await env.DB.prepare(
    `
      SELECT
        i.id,
        i.title,
        i.summary,
        i.detail,
        i.category,
        i.created_at,
        i.source_count,
        i.reaction_velocity,
        i.is_sensitive,
        i.seed_like_count + (
          SELECT COUNT(*) FROM issue_reactions r
          WHERE r.issue_id = i.id AND r.reaction_type = 'like'
        ) AS like_count,
        i.seed_dislike_count + (
          SELECT COUNT(*) FROM issue_reactions r
          WHERE r.issue_id = i.id AND r.reaction_type = 'dislike'
        ) AS dislike_count,
        i.seed_comment_count + (
          SELECT COUNT(*) FROM comments c
          WHERE c.issue_id = i.id AND c.status = 'visible'
        ) AS comment_count
      FROM issues i
      ORDER BY i.hot_score DESC, i.created_at DESC
    `,
  ).all<IssueRow>();

  const sourceResult = await env.DB.prepare(
    `
      SELECT issue_id, source_name, source_url
      FROM issue_sources
      ORDER BY created_at ASC
    `,
  ).all<SourceRow>();

  const sourcesByIssue = new Map<string, Array<{ name: string; url: string }>>();
  for (const source of sourceResult.results ?? []) {
    const list = sourcesByIssue.get(source.issue_id) ?? [];
    list.push({ name: source.source_name, url: source.source_url });
    sourcesByIssue.set(source.issue_id, list);
  }

  const issues = (issueResult.results ?? []).map((issue) =>
    normalizeIssue(issue, sourcesByIssue.get(issue.id) ?? []),
  );

  return json({ issues });
};
