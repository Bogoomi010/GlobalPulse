import { Env, badRequest, json } from './_shared';

export function requireAdmin(request: Request, env: Env): Response | null {
  if (!env.MODERATION_ADMIN_TOKEN) {
    return badRequest('Admin token is not configured', 503);
  }

  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  const bearerToken = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice('bearer '.length).trim()
    : '';
  const headerToken = request.headers.get('X-Admin-Token') || request.headers.get('x-admin-token');
  const token = bearerToken || headerToken || '';

  if (!token || !constantTimeEqual(token, env.MODERATION_ADMIN_TOKEN)) {
    return json({ error: 'Admin authentication required' }, 401);
  }

  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}
