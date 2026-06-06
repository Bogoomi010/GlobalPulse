import { Env, badRequest, createId, createUserSession, json, readJson, requireString } from '../../_shared';

type LoginBody = {
  email?: string;
  displayName?: string;
  countryCode?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = await readJson<LoginBody>(request);
    const email = requireString(body.email, 'email').toLowerCase();
    const displayName = requireString(body.displayName || 'Global member', 'displayName');
    const countryCode = (body.countryCode || 'KR').toUpperCase();

    const existing = await env.DB.prepare('SELECT id, email, display_name, country_code FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string; email: string; display_name: string; country_code: string }>();

    const userId = existing?.id ?? createId('user');
    const walletId = createId('wallet');

    if (existing) {
      await env.DB.batch([
        env.DB.prepare(
        `
          UPDATE users
          SET display_name = ?, country_code = ?, last_seen_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).bind(displayName, countryCode, userId),
        env.DB.prepare(
          `
            INSERT OR IGNORE INTO wallets (id, user_id, currency_code, balance_amount)
            VALUES (?, ?, 'KRW', 0)
          `,
        ).bind(walletId, userId),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare(
          `
            INSERT INTO users (id, email, display_name, country_code)
            VALUES (?, ?, ?, ?)
          `,
        ).bind(userId, email, displayName, countryCode),
        env.DB.prepare(
          `
            INSERT OR IGNORE INTO wallets (id, user_id, currency_code, balance_amount)
            VALUES (?, ?, 'KRW', 0)
          `,
        ).bind(walletId, userId),
      ]);
    }

    const wallet = await env.DB.prepare(
      `
        SELECT id, currency_code, balance_amount
        FROM wallets
        WHERE user_id = ? AND currency_code = 'KRW'
      `,
    )
      .bind(userId)
      .first<{ id: string; currency_code: string; balance_amount: number }>();
    const sessionToken = await createUserSession(env.DB, userId, env.SESSION_TOKEN_SECRET);

    return json({
      user: {
        id: userId,
        email,
        displayName,
        countryCode,
        sessionToken,
      },
      wallet: {
        id: wallet?.id,
        currencyCode: wallet?.currency_code ?? 'KRW',
        balance: Number(wallet?.balance_amount ?? 0),
      },
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid login request');
  }
};
