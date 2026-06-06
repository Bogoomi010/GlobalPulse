import { Env, authenticateUser, json, unauthorized } from '../../_shared';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const user = await authenticateUser(request, env);
  if (!user) return unauthorized();

  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      countryCode: user.countryCode,
    },
  });
};
