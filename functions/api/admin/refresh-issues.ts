import { requireAdmin } from '../../_admin';
import { Env, json } from '../../_shared';
import { refreshLiveIssues } from '../../_issue_ingest';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const result = await refreshLiveIssues(env);
  return json({
    ...result,
    status: 'refreshed',
  });
};
