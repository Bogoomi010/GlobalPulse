import { Env, badRequest, json } from '../../_shared';
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

function requireAdmin(request: Request, env: Env): Response | null {
  if (!env.MODERATION_ADMIN_TOKEN) {
    return badRequest('Admin token is not configured', 503);
  }

  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  const bearerToken = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice('bearer '.length).trim()
    : '';
  const headerToken = request.headers.get('X-Admin-Token') || request.headers.get('x-admin-token');
  const token = bearerToken || headerToken || '';

  if (!token || token !== env.MODERATION_ADMIN_TOKEN) {
    return json({ error: 'Admin authentication required' }, 401);
  }

  return null;
}
