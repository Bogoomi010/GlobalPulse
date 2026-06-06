# GlobalPulse Implementation Plan

## Goal

Build GlobalPulse as a mobile-first global issue reaction dashboard where anonymous visitors can react with like/dislike, signed-in users can top up wallet balance through a real payment provider, and paid comments cost 100 KRW each.

## Current Milestone

This repository now contains the frontend MVP shell plus the first production API layer:

- Mobile-first dark feed UI
- 20 neutral dummy issues across required categories
- Search, category filters, and required sort tabs
- Like/dislike optimistic UI with D1 API support and localStorage fallback
- Issue detail modal with sources, reaction split, comments, and moderation notes
- Login, wallet, top-up plan, transaction history, about, and policy screens
- Cloudflare Pages Functions for issues, anonymous reactions, login, wallet, paid comments, reports, and Toss payment create/confirm/webhook
- D1 migrations for schema, payment plans, and dummy issue seed data
- Payment blocked state when provider environment variables are missing

## Milestones

1. Data model
   - Add D1 schema for issues, sources, sessions, reactions, users, wallets, transactions, payment plans, payments, comments, and reports.
   - Seed dummy issues and KR payment plans.

2. UI
   - Replace placeholder shop with GlobalPulse feed, filters, sorting, details, wallet, and policy screens.
   - Preserve neutral wording and "Anonymous global reaction" language.

3. Anonymous reactions
   - Done: Frontend creates an anonymous local token and uses optimistic state.
   - Done: Server hashes session token and stores one reaction per session per issue in D1.
   - Done: Toggle, cancel, and switch semantics are implemented in `/api/reactions`.

4. Authentication and wallet
   - In progress: `/api/auth/login` creates user and wallet records on first login.
   - Remaining: Replace demo email login with a verified email or deployment-provider authentication flow.

5. Paid comments
   - Done: `/api/comments` inserts a comment, subtracts 100 KRW, and inserts a wallet transaction in one D1 batch.
   - Done: Idempotency key prevents duplicate charge/comment writes.

6. Payments
   - In progress: Toss create/confirm/webhook endpoints are implemented.
   - Done: Server-side amount verification is required before Toss confirmation.
   - Done: Payment status transitions and duplicate paid payment checks are implemented.
   - Remaining: Connect the browser Toss payment SDK/widget and verify with live/test keys.

7. Deployment
   - Add Cloudflare Pages/Workers or equivalent server runtime.
   - Apply D1 migrations and bind the production database.
   - Stop before production deployment if payment secrets are missing.

## Required Environment Variables

Frontend:

- `VITE_TOSS_CLIENT_KEY`

Server:

- `TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `TOSS_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER=toss`
- `SESSION_TOKEN_SECRET`
- Cloudflare D1 binding named `DB`

## Deployment Gate

Do not claim real payments are available until the payment provider keys, webhook secret, production callback URLs, and D1 binding are configured and verified. If these are missing, deployment must stop before the "real payment available" claim.

## Remaining Production Work

- Real verified authentication
- Browser Toss payment SDK/widget request flow
- D1 migration execution in production
- Production deployment URL verification
- Legal/tax/refund/minor payment/privacy/moderation review
