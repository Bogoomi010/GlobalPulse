import {
  Env,
  badRequest,
  createUserSession,
  ensureUserWithWallet,
  json,
  readJson,
  requireString,
} from '../../_shared';

type LoginBody = {
  email?: string;
  displayName?: string;
  countryCode?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (env.AUTH_PROVIDER === 'resend') {
      return badRequest('Use email verification flow for production login', 400);
    }

    if (env.ALLOW_DEMO_LOGIN !== 'true') {
      return badRequest('Demo login is disabled. Configure AUTH_PROVIDER=resend for verified email login.', 503);
    }

    const body = await readJson<LoginBody>(request);
    const email = requireString(body.email, 'email');
    const displayName = requireString(body.displayName || 'Global member', 'displayName');
    const countryCode = (body.countryCode || 'KR').toUpperCase();

    const { user, wallet } = await ensureUserWithWallet(env.DB, { email, displayName, countryCode });
    const sessionToken = await createUserSession(env.DB, user.id, env.SESSION_TOKEN_SECRET);

    return json({
      user: {
        ...user,
        sessionToken,
      },
      wallet,
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid login request');
  }
};
