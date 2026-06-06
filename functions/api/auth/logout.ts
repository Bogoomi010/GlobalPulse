import { Env, json, revokeCurrentUserSession } from '../../_shared';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const revoked = await revokeCurrentUserSession(request, env);
  return json({ revoked });
};
