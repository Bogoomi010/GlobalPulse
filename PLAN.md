# GlobalPulse Implementation Plan

## Goal

Build GlobalPulse as a mobile-first global issue reaction dashboard where anonymous visitors can react with like/dislike, signed-in users can top up wallet balance through a real payment provider, and paid comments cost 100 KRW each.

## Current Milestone

This repository now contains the frontend MVP shell:

- Mobile-first dark feed UI
- 20 neutral dummy issues across required categories
- Search, category filters, and required sort tabs
- Like/dislike optimistic UI with localStorage persistence
- Issue detail modal with sources, reaction split, comments, and moderation notes
- Login, wallet, top-up plan, transaction history, about, and policy screens
- Payment blocked state when provider environment variables are missing

## Milestones

1. Data model
   - Add D1 schema for issues, sources, sessions, reactions, users, wallets, transactions, payment plans, payments, comments, and reports.
   - Seed dummy issues and KR payment plans.

2. UI
   - Replace placeholder shop with GlobalPulse feed, filters, sorting, details, wallet, and policy screens.
   - Preserve neutral wording and "Anonymous global reaction" language.

3. Anonymous reactions
   - Frontend: create anonymous local session and optimistic state.
   - Server: hash session token and store one reaction per session per issue in D1.
   - Enforce toggle, cancel, and switch semantics.

4. Authentication and wallet
   - Replace local demo login with server-backed email authentication suitable for the deployment environment.
   - Create user and wallet records on first login.

5. Paid comments
   - Create an atomic server endpoint that inserts a comment, subtracts 100 KRW, and inserts a wallet transaction.
   - Require an idempotency key to prevent duplicate charge/comment writes.

6. Payments
   - Implement provider adapter interface.
   - Start with Toss Payments for KRW.
   - Add webhook signature verification, duplicate payment protection, and payment status transitions.

7. Deployment
   - Add Cloudflare Pages/Workers or equivalent server runtime.
   - Apply D1 migrations and bind the production database.
   - Stop before production deployment if payment secrets are missing.

## Required Environment Variables

Frontend:

- `VITE_TOSS_CLIENT_KEY`

Server:

- `TOSS_SECRET_KEY`
- `TOSS_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER=toss`
- `SESSION_TOKEN_SECRET`
- `D1_DATABASE_BINDING`

## Deployment Gate

Do not claim real payments are available until the payment provider keys, webhook secret, production callback URLs, and D1 binding are configured and verified. If these are missing, deployment must stop before the "real payment available" claim.

## Remaining Production Work

- Server runtime and D1 API endpoints
- Real authentication
- Toss Payments approval/cancel/fail/webhook flow
- D1 migration execution in production
- Production deployment URL verification
- Legal/tax/refund/minor payment/privacy/moderation review
