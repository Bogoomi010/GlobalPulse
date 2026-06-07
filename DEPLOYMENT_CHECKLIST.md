# GlobalPulse Deployment Checklist

## Build

- Run `yarn lint`.
- Run `yarn build`.
- Run `yarn test:api`.
- Run `yarn check:deploy`.
- Run `yarn db:migrate:production:dry-run`.
- After deployment, run `APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production`.
- With the admin token available, run `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production`.
- Verify mobile and desktop layouts.
- Complete `LAUNCH_REVIEW.md` before calling the service production-ready.

## D1

- Create a production D1 database.
- Replace `wrangler.toml` `database_id` with the production D1 database UUID.
- Review the migration list with `yarn db:migrate:production:dry-run`.
- Apply all migrations with `CONFIRM_PRODUCTION_MIGRATIONS=globalpulse-production yarn db:migrate:production`.
- Confirm migration `0009_remove_payment_system.sql` has disabled payment plans.
- Seed production dummy issues and issue sources.
- Use the browser `Ops` screen or `/api/admin/refresh-issues` with `MODERATION_ADMIN_TOKEN` to add public live issues after deployment when needed.
- Bind the D1 database to the server runtime.

## Runtime Configuration

- Configure `AUTH_PROVIDER=resend`.
- Configure `RESEND_API_KEY`.
- Configure `AUTH_EMAIL_FROM` with a verified sender domain.
- Ensure `ALLOW_DEMO_LOGIN` is not set in production.
- Ensure `AUTH_EMAIL_DELIVERY=log` is not set in production.
- Configure `SESSION_TOKEN_SECRET` with a high-entropy production value.
- Configure `MODERATION_ADMIN_TOKEN` with a high-entropy production value.
- Configure `APP_PUBLIC_ORIGIN` to the production HTTPS origin.
- Set `LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE` only after the launch review is complete.

## Required Deployment Variables

- `SESSION_TOKEN_SECRET`
- `MODERATION_ADMIN_TOKEN`
- `AUTH_PROVIDER`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`
- `APP_PUBLIC_ORIGIN`
- `LAUNCH_REVIEW_ACK`

## Stop Condition

Do not deploy as production if email login, session secret, moderation token, D1 binding, public origin, or launch review acknowledgement are missing.

GlobalPulse does not use Stripe, Toss, or other payment provider secrets. If old payment secrets still exist in Cloudflare, remove them from the project settings after the deployment is verified.

## Post-Deploy Verification

- Production URL opens publicly.
- Dummy issues are visible.
- Optional live issues from Wikimedia Current Events, Hacker News, and GDELT can be refreshed by an operator.
- `APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production` passes.
- `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:status` reports runtime readiness without exposing secrets.
- `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:ready` passes after runtime settings and launch review are complete.
- `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:refresh-issues` refreshes public issues when needed.
- `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:test-email` requests a production OTP.
- `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com PRODUCTION_VERIFY_EMAIL_CODE=123456 APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:verify-email` verifies the received OTP, session lookup, and logout.
- `PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production` sends a Resend OTP without returning `devCode`.
- `/api/issues` returns at least 20 issues from D1.
- `/api/payments/create`, `/api/payments/confirm`, and `/api/payments/webhook` return `410 Gone`.
- Search, filters, and sort tabs work.
- Anonymous like/dislike persists after refresh.
- Duplicate reactions from the same browser are prevented.
- Login works through the Resend email OTP provider.
- Logout revokes the current server session and protected APIs reject the old Bearer token.
- Comment APIs reject requests without a valid Bearer session token.
- Logged-in comments are free and do not change wallet balance.
- Duplicate comment reports from the same anonymous session are idempotent.
- `/api/moderation/reports` rejects missing admin tokens, lists reported comments, and can hide or restore a reviewed comment.
- `/api/admin/refresh-issues` rejects missing admin tokens before any external source fetch runs.
- `/api/admin/status` rejects missing admin tokens and reports non-secret runtime readiness with an admin token.
- The browser ops screen can connect with `MODERATION_ADMIN_TOKEN`, perform the same hide/restore review flow, trigger public issue refresh, and show runtime readiness.
- Mobile and desktop layouts remain usable.
- `LAUNCH_REVIEW_ACK` is set only after privacy, security, moderation, and operations review is complete.

## Operational Notes

- Privacy, security, moderation, and jurisdiction-specific operating policies require operator review before launch.
- GlobalPulse must avoid language that presents reactions as factual truth.
- Comments do not imply credibility or factual accuracy.
