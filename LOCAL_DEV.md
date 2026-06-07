# GlobalPulse Local Full-Stack Development

## Run The Vite UI

```bash
yarn dev
```

This serves the frontend only. API calls fall back to local demo state when Pages Functions are not available.

## Run Pages Functions With Local D1

```bash
yarn build
yarn db:migrate:local
yarn pages:dev
```

Open `http://127.0.0.1:8788`.

`pages:dev` sets local session, moderation, origin, demo-login, and email log-delivery bindings. It does not configure Stripe, Toss, or any other payment provider because GlobalPulse no longer accepts payments. Open the `Ops` navigation item and enter `local-dev-moderation-token` to inspect the local moderation queue after reporting a comment.

Local Pages dev also sets `ALLOW_DEMO_LOGIN=true` so `/api/auth/login` can issue a test session without sending email. The API smoke test uses `AUTH_PROVIDER=resend` plus `AUTH_EMAIL_DELIVERY=log` to verify the OTP endpoints without sending real email. Production must use Resend delivery and must not enable local log delivery.

The live issue refresh action is operator-only. In local Pages dev, open the `Ops` screen with `local-dev-moderation-token` and click `Refresh public issues`, or run this command when you want to pull public issues from Wikimedia Current Events, Hacker News, and GDELT into local D1:

```bash
curl -X POST -H "Authorization: Bearer local-dev-moderation-token" http://127.0.0.1:8788/api/admin/refresh-issues
```

## API Smoke Test

```bash
yarn test:api
```

The smoke test builds the app, applies D1 migrations to an isolated Wrangler state directory, starts `wrangler pages dev`, and verifies:

- D1 seeded issues are returned
- Wallet API rejects unauthenticated requests
- Payment creation, confirmation, and webhook endpoints return `410 Gone`
- Email OTP request and verification return a server session token
- Current session lookup works and logout revokes the server session
- Local email log delivery is explicitly enabled only for the smoke runtime
- Anonymous reactions can be added, switched, cancelled, and reflected in issue aggregates
- Comments reject missing auth
- Logged-in comments are free and do not change wallet balance
- Duplicate comment requests are idempotent
- Comment reporting keeps the comment visible with reported status
- Duplicate reports from the same anonymous session do not create extra report rows
- Moderation reports require an admin token and can hide or restore a reported comment
- The live issue refresh endpoint rejects requests without the admin token
- The admin runtime status endpoint rejects requests without the admin token and reports local D1 schema/payment/email settings with the token
- The ops screen can trigger live issue refresh after the operator enters the admin token
- The frontend ops screen accepts an operator-provided moderation token for queue review
- The author can delete their own comment

## Production Readiness Gate

```bash
yarn check:deploy
```

This command is expected to fail in local development until production D1, Resend email settings, `APP_PUBLIC_ORIGIN`, `SESSION_TOKEN_SECRET`, `MODERATION_ADMIN_TOKEN`, and launch review acknowledgement are configured.

`LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE` is also required for production readiness. Use it only after completing `LAUNCH_REVIEW.md`; the value is an operator acknowledgement, not a legal substitute.

## Production D1 Migrations

```bash
yarn db:migrate:production:dry-run
CONFIRM_PRODUCTION_MIGRATIONS=globalpulse-production yarn db:migrate:production
```

The production command applies the shared migration list to remote D1 through Wrangler and refuses to run until `wrangler.toml` has a real production `database_id` and the confirmation value matches `database_name`.

## Production URL Verification

```bash
APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production
PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn verify:production
```

The verifier checks the public app shell, D1 issue API count, protected API behavior, disabled payment API behavior, moderation and issue-refresh token protection, and optional Resend OTP delivery. When `PRODUCTION_ADMIN_TOKEN` or `MODERATION_ADMIN_TOKEN` is set, it also checks non-secret runtime readiness from `/api/admin/status`.

## Production Admin Commands

```bash
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:status
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:ready
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:refresh-issues
PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:test-email
PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com PRODUCTION_VERIFY_EMAIL_CODE=123456 APP_PUBLIC_ORIGIN=https://your-production-domain yarn admin:verify-email
```

These commands call the protected admin APIs without printing the token. `admin:ready` exits nonzero and lists missing runtime items when the deployment is not launch-ready. `admin:refresh-issues` refreshes public issues and then prints the updated runtime status. `admin:test-email` requests a production OTP email, and `admin:verify-email` verifies the 6-digit code, checks the issued session, and logs it out without printing the session token.
