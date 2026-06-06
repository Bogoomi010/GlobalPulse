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

`pages:dev` uses local placeholder Toss keys, `APP_PUBLIC_ORIGIN=http://127.0.0.1:8788`, and `MODERATION_ADMIN_TOKEN=local-dev-moderation-token`. Replace the bindings with real Toss test keys before manually testing the payment window.
Open the `Ops` navigation item and enter `local-dev-moderation-token` to inspect the local moderation queue after reporting a paid comment.

Local Pages dev also sets `ALLOW_DEMO_LOGIN=true` so `/api/auth/login` can issue a test session without sending email. The API smoke test uses `AUTH_PROVIDER=resend` plus `AUTH_EMAIL_DELIVERY=log` to verify the OTP endpoints without sending real email. It also points `TOSS_API_BASE_URL` at a local Toss mock and configures a local `TOSS_WEBHOOK_SECRET` so payment confirm, signed cancellation webhook handling, unsigned webhook rejection, and fixed callback origin behavior can be tested without live keys. Production must use Resend delivery and the official Toss API instead.

## API Smoke Test

```bash
yarn test:api
```

The smoke test builds the app, applies D1 migrations to an isolated Wrangler state directory, starts `wrangler pages dev`, and verifies:

- D1 seeded issues are returned
- Wallet API rejects unauthenticated requests
- Email OTP request and verification return a server session token
- Current session lookup works and logout revokes the server session
- Local email log delivery is explicitly enabled only for the smoke runtime
- Anonymous reactions can be added and cancelled
- Paid comments reject missing auth and insufficient balance
- Missing issue comments do not subtract wallet balance
- Paid comment spending subtracts 100 KRW after a local wallet top-up
- Duplicate paid comment requests do not charge twice
- Comment reporting keeps the comment visible with reported status
- Duplicate reports from the same anonymous session do not create extra report rows
- Moderation reports require an admin token and can hide or restore a reported comment
- The frontend ops screen accepts an operator-provided moderation token for queue review
- The author can delete their own paid comment
- Payment creation writes a pending Toss payment
- Payment creation uses the configured public origin for success/fail callback URLs
- Payment confirmation through the provider adapter increases wallet balance once
- Payment failure/cancellation records a failed top-up transaction without increasing balance
- Unsigned or incorrectly signed Toss webhooks are rejected when a webhook secret is configured
- Paid payment cancellation webhook records a refund and does not duplicate repeated webhook handling

## Production Readiness Gate

```bash
yarn check:deploy
```

This command is expected to fail in local development until production D1, Toss live payment secrets, Resend email settings, `APP_PUBLIC_ORIGIN`, and the moderation admin token are configured. It blocks `yarn deploy` when real payments or operational safeguards cannot work safely.

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
```

The verifier checks the public app shell, payment return routes, seeded issue API count, protected API rejection, and moderation token protection. The email variant intentionally sends a production Resend OTP to the provided address and verifies that no local `devCode` leaks in the response.
