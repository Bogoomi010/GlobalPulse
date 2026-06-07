# GlobalPulse Operator Runbook

Use this runbook to finish the production operator steps that cannot be completed from the repository alone.

Do not paste API keys, admin tokens, OTP codes, session tokens, or secret values into issues, commits, docs, screenshots, or chat. Record only pass/fail results, timestamps, command names, and non-secret observations.

## Production Target

- Cloudflare Pages project: `globalpulse-pages`
- Production origin: `https://globalpulse-pages.pages.dev`
- D1 binding name: `DB`
- D1 database name: `globalpulse-production`
- GitHub repository: `Bogoomi010/GlobalPulse`

## Required Operator Inputs

- Access to the Cloudflare account that owns the Pages project and D1 database.
- Access to the Resend account and verified sender/domain.
- A high-entropy `SESSION_TOKEN_SECRET`.
- A high-entropy `MODERATION_ADMIN_TOKEN`.
- An operator mailbox for OTP delivery testing.

Generate new secrets locally when needed:

```bash
openssl rand -hex 32
```

## Phase 1: Cloudflare Runtime Cleanup

Open Cloudflare Dashboard, then go to:

```text
Workers & Pages > globalpulse-pages > Settings > Variables and Secrets
```

Required production secrets:

- `SESSION_TOKEN_SECRET`
- `MODERATION_ADMIN_TOKEN`
- `AUTH_PROVIDER` with value `resend`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`
- `APP_PUBLIC_ORIGIN` with value `https://globalpulse-pages.pages.dev`

Required production binding:

- D1 database binding `DB` pointing to `globalpulse-production`

Forbidden legacy payment variables and secrets:

- `PAYMENT_PROVIDER`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `TOSS_WEBHOOK_SECRET`
- `VITE_TOSS_CLIENT_KEY`

Production must not include:

- `ALLOW_DEMO_LOGIN`
- `AUTH_EMAIL_DELIVERY=log`

After changing Cloudflare variables or secrets, trigger or wait for a fresh production deployment before running protected verification.

## Phase 2: Resend Email Readiness

In Resend:

- Verify the sender domain or sender address used by `AUTH_EMAIL_FROM`.
- Confirm `RESEND_API_KEY` belongs to the same Resend account and has permission to send email.
- Confirm the operator mailbox can receive messages from the configured sender.

Do not continue to launch acknowledgement until production OTP email delivery is verified.

## Phase 3: Public Evidence

Run:

```bash
APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review
APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn verify:production
```

Optionally save the public report as a local non-secret artifact:

```bash
APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review --output .artifacts/launch-review-public.md
```

Expected evidence:

- Public app loads.
- `/api/issues` returns at least 20 issues.
- Protected APIs reject missing tokens.
- Payment creation returns `410`.
- Admin runtime status is skipped by `launch:review` until an admin token is provided.

## Phase 4: Protected Runtime Evidence

Run with the operator admin token available only in the shell environment:

```bash
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:status
```

Optionally save the protected report as a local non-secret artifact:

```bash
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review --output .artifacts/launch-review-protected.md
```

Expected evidence:

- D1 issue count is at least 20.
- D1 schema tables are present.
- Resend is configured.
- Email sender is configured.
- Email log delivery is disabled.
- Public origin is HTTPS and matches the deployed request origin.
- Demo login is disabled.
- Active payment plans are `0`.
- Legacy payment secrets are `none`.
- Launch review is not acknowledged until the operator completes `LAUNCH_REVIEW.md`.

## Phase 5: Live Issue Refresh

Run:

```bash
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:refresh-issues
APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review
```

Record the upsert count and source counts from Wikimedia Current Events, Hacker News, and GDELT. Do not record the admin token.

## Phase 6: Production Email OTP Test

Request an OTP:

```bash
PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:test-email
```

After receiving the 6-digit code in the operator mailbox, verify the login flow:

```bash
PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com PRODUCTION_VERIFY_EMAIL_CODE=123456 APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:verify-email
```

Expected evidence:

- OTP request succeeds.
- Production response does not include `devCode`.
- OTP verification creates a session.
- `/api/auth/me` confirms the same email.
- Logout revokes the session.

## Phase 7: Launch Review And ACK

Complete every section in `LAUNCH_REVIEW.md`.

Only after the review is complete, set:

```text
LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE
```

Then wait for a fresh production deployment and run:

```bash
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:ready
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn verify:production
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review
```

Optionally save the final report:

```bash
PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review --output .artifacts/launch-review-final.md
```

All three commands must pass before claiming production readiness.

## Final Go/No-Go Evidence

Record in `LAUNCH_REVIEW.md`:

- Review date.
- Operator name.
- `launch:review` public and protected results.
- `admin:ready` result after ACK.
- OTP email verification result.
- Any open issues.
- GO or NO-GO decision.

If any command fails, do not launch. Fix the reported item and rerun the relevant phase.
