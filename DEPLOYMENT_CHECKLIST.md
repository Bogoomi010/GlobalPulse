# GlobalPulse Deployment Checklist

## Build

- Run `yarn lint`.
- Run `yarn build`.
- Verify mobile and desktop layouts.

## D1

- Create a production D1 database.
- Apply `migrations/0001_globalpulse_schema.sql`.
- Apply `migrations/0002_payment_plans_seed.sql`.
- Seed production dummy issues and issue sources.
- Bind the D1 database to the server runtime.

## Payments

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

## Stop Condition

If payment secrets or production webhook URLs are missing, do not deploy as a real-payment service and do not tell users that payments are available.

## Post-Deploy Verification

- Production URL opens publicly.
- Dummy issues are visible.
- `/api/issues` returns 20 seeded issues from D1.
- Search, filters, and sort tabs work.
- Anonymous like/dislike persists after refresh.
- Duplicate reactions from the same browser are prevented.
- Login works through the real auth provider.
- Wallet, paid comment, and payment creation APIs reject requests without a valid Bearer session token.
- Top-up creates a pending payment through `/api/payments/create`.
- Browser opens Toss Payments V2 Standard payment window from the selected top-up plan.
- Toss payment success calls `/api/payments/confirm` with server-side amount verification.
- Toss payment failure or cancellation calls `/api/payments/fail` and does not increase balance.
- Approved payment increases wallet balance once.
- Failed or cancelled payment does not increase balance.
- Paid comment subtracts 100 KRW and appears in the comment list.
- Transaction history persists after refresh.
- Mobile and desktop layouts remain usable.

## Operational Notes

- Legal, tax, refund, minor payment, privacy, payment provider, and moderation policies require operator review before launch.
- GlobalPulse must avoid language that presents reactions as factual truth.
- Paid comments do not imply credibility or factual accuracy.
