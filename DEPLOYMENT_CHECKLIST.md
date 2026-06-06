# GlobalPulse Deployment Checklist

## Build

- Run `yarn lint`.
- Run `yarn build`.
- Run `yarn test:api`.
- Run `yarn check:deploy`.
- Verify mobile and desktop layouts.

## D1

- Create a production D1 database.
- Replace `wrangler.toml` `database_id` with the production D1 database UUID.
- Apply `migrations/0001_globalpulse_schema.sql`.
- Apply `migrations/0002_payment_plans_seed.sql`.
- Apply `migrations/0003_issues_seed.sql`.
- Apply `migrations/0004_user_sessions.sql`.
- Apply `migrations/0005_email_login_codes.sql`.
- Apply `migrations/0006_comment_report_uniqueness.sql`.
- Seed production dummy issues and issue sources.
- Bind the D1 database to the server runtime.

## Payments

- Configure `AUTH_PROVIDER=resend`.
- Configure `RESEND_API_KEY`.
- Configure `AUTH_EMAIL_FROM` with a verified sender domain.
- Ensure `ALLOW_DEMO_LOGIN` is not set in production.
- Ensure `AUTH_EMAIL_DELIVERY=log` is not set in production.
- Ensure `TOSS_API_BASE_URL` is unset or `https://api.tosspayments.com` in production.
- Configure Toss Payments production client key.
- Configure `VITE_TOSS_CLIENT_KEY` for the browser build.
- Configure `TOSS_CLIENT_KEY` for the Pages Functions response.
- Configure Toss Payments secret key.
- Configure Toss Payments webhook secret.
- Configure `SESSION_TOKEN_SECRET` with a high-entropy production value.
- Configure success, failure, cancel, and webhook callback URLs.
- Confirm `/payment/success` and `/payment/fail` route to the SPA through `public/_redirects`.
- Verify provider signatures on webhook requests.
- Ensure `provider_payment_id` and `idempotency_key` cannot be processed twice.

## Required Secrets

- `VITE_TOSS_CLIENT_KEY`
- `TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `TOSS_WEBHOOK_SECRET`
- `SESSION_TOKEN_SECRET`
- `PAYMENT_PROVIDER`
- `AUTH_PROVIDER`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`

## Stop Condition

If payment secrets or production webhook URLs are missing, do not deploy as a real-payment service and do not tell users that payments are available.

`yarn deploy` runs `yarn check:deploy` and must fail until the production D1 UUID, Toss live keys, webhook secret, session secret, `PAYMENT_PROVIDER=toss`, and verified email auth settings are configured.

## Post-Deploy Verification

- Production URL opens publicly.
- Dummy issues are visible.
- `/api/issues` returns 20 seeded issues from D1.
- Search, filters, and sort tabs work.
- Anonymous like/dislike persists after refresh.
- Duplicate reactions from the same browser are prevented.
- Login works through the Resend email OTP provider.
- Logout revokes the current server session and protected APIs reject the old Bearer token.
- Wallet, paid comment, and payment creation APIs reject requests without a valid Bearer session token.
- Top-up creates a pending payment through `/api/payments/create`.
- Browser opens Toss Payments V2 Standard payment window from the selected top-up plan.
- Toss payment success calls `/api/payments/confirm` with server-side amount verification.
- Toss payment failure or cancellation calls `/api/payments/fail` and does not increase balance.
- Approved payment increases wallet balance once.
- Failed or cancelled payment appears in transaction history without increasing wallet balance.
- Repeated failure/cancellation callbacks do not create duplicate transaction history rows.
- Toss `CANCELED` or `PARTIAL_CANCELED` webhook after a paid top-up records a refund transaction and adjusts wallet balance when sufficient balance remains.
- Paid comment subtracts 100 KRW and appears in the comment list.
- Duplicate comment reports from the same anonymous session are idempotent.
- Transaction history persists after refresh.
- Mobile and desktop layouts remain usable.

## Operational Notes

- Legal, tax, refund, minor payment, privacy, payment provider, and moderation policies require operator review before launch.
- GlobalPulse must avoid language that presents reactions as factual truth.
- Paid comments do not imply credibility or factual accuracy.
