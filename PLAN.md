# GlobalPulse Implementation Plan

## Goal

Build GlobalPulse as a mobile-first global issue reaction dashboard where anonymous visitors can react with like/dislike and signed-in users can write free comments. The product does not include payment, wallet top-up, paid comments, or payment-provider integration.

## Current Milestone

This repository now contains the frontend MVP shell plus the first production API layer:

- Mobile-first dark feed UI
- 20 neutral seed issues across required categories
- Token-protected live issue refresh from Wikimedia Current Events, Hacker News, and GDELT
- Search, category filters, and required sort tabs
- Like/dislike optimistic UI with D1 API support and localStorage fallback
- Issue detail modal with sources, reaction split, free comments, and moderation notes
- Login, about, policy, and moderation ops screens
- Browser-based moderation ops screen for reviewing reported comments with an admin token
- Browser-based ops action for refreshing public issue data with the same admin token
- Token-protected runtime status for D1 schema, email, public origin, payment-disabled, and launch-review readiness
- Token-protected runtime status reports legacy payment-provider secret presence without exposing secret values
- Cloudflare Pages Functions for issues, anonymous reactions, login, wallet compatibility, free comments, reports, and disabled payment endpoints
- D1 migrations for schema, disabled payment plans, free-comment support, and dummy issue seed data
- Server-issued session tokens protect comments and wallet compatibility APIs
- Stored sessions can be checked through `/api/auth/me` and revoked through `/api/auth/logout`
- Email OTP login endpoints are prepared for production through Resend, with demo login allowed only by explicit local binding
- Comment reports are idempotent per anonymous session to reduce moderation queue spam
- Token-protected moderation API and ops screen list reported comments and record hide/restore/dismiss review actions
- Local full-stack smoke test runs Pages Functions with local D1 through Wrangler and verifies OTP login, reactions, free comments, reporting, moderation, logout, and disabled payment endpoints
- Production deploy gate blocks deployment when D1, session secret, moderation admin token, public origin, launch review acknowledgement, verified email auth settings, or old payment-provider secrets are misconfigured
- Production D1 migration script shares the local migration list and requires an explicit confirmation value before applying remote migrations
- Production URL verification script checks the public app, D1 issue count, protected API behavior, disabled payment API behavior, moderation and live-refresh protection, and optional Resend OTP delivery
- Production URL verification script checks that every returned issue includes named HTTP(S) source links
- Production URL verification script checks that issue title, summary, and detail text avoid verdict-like fact/truth claims
- Production URL verification script checks deployed HTML, JS, and CSS assets for removed payment-provider, checkout, top-up, and paid-comment wording
- Production URL verification script also checks anonymous reaction like, switch, cancel, baseline count restoration, and `/api/issues` aggregate persistence
- Production URL verification script checks public comment listing and rejects unauthenticated comment writes
- Public-copy audit checks that visible UI copy does not mention removed payment-provider, checkout, top-up, or paid-comment flows
- Launch review report script prints non-secret public and protected runtime evidence for operator review
- Operator runbook documents the ordered Cloudflare, Resend, verification, and launch acknowledgement procedure
- Production admin CLI can check runtime state, refresh public issues, and verify production email OTP login without exposing admin tokens or session tokens
- `GOAL_STATUS.md` summarizes the current modified scope, production URL, verified public evidence, and remaining operator-controlled launch gates

## Milestones

1. Data model
   - Done: Add D1 schema for issues, sources, sessions, reactions, users, wallets, comments, and reports.
   - Done: Seed dummy issues.
   - Done: Add operator-triggered public data refresh for Wikimedia Current Events, Hacker News, and GDELT.
   - Done: Disable legacy payment plans and support zero-cost comments.

2. UI
   - Done: Replace placeholder shop with GlobalPulse feed, filters, sorting, details, free comments, and policy screens.
   - Done: Remove top-up, wallet balance, and payment return screens.
   - Done: Preserve neutral wording and "Anonymous global reaction" language.

3. Anonymous reactions
   - Done: Frontend creates an anonymous local token and uses optimistic state.
   - Done: Server hashes session token and stores one reaction per session per issue in D1.
   - Done: Toggle, cancel, and switch semantics are implemented in `/api/reactions`.
   - Done: Smoke tests verify reaction count persistence through `/api/issues`.

4. Authentication
   - Done: `/api/auth/login` creates user and compatibility wallet records on first login.
   - Done: Login returns a server-issued session token stored only as a hash in D1.
   - Done: Comments require Bearer session authentication.
   - Done: `/api/auth/request-code` and `/api/auth/verify-code` support verified email OTP login through Resend.
   - Done: `/api/auth/me` verifies stored sessions and `/api/auth/logout` revokes them server-side.
   - Remaining: Configure Resend production sender/domain and verify end-to-end email delivery in deployment.

5. Comments and moderation
   - Done: `/api/comments` inserts a free comment without wallet debit.
   - Done: Comment idempotency key prevents duplicate comment writes.
   - Done: Comment reports are unique per comment and anonymous reporter session.
   - Done: `/api/moderation/reports` lets token-authenticated operators list reports and hide, restore, or dismiss reported comments.
   - Done: The frontend ops screen can connect with `MODERATION_ADMIN_TOKEN` and review reported comments without exposing the token in deployment env.
   - Done: The frontend ops screen can trigger public issue refresh without exposing the token in deployment env.
   - Done: The frontend ops screen can show non-secret deployment readiness status after the operator enters the admin token.

6. Payments
   - Done: Payment UI and hosted checkout flows are removed.
   - Done: `/api/payments/create`, `/api/payments/confirm`, `/api/payments/fail`, and `/api/payments/webhook` return `410 Gone`.
   - Done: Stripe/Toss adapter code and frontend payment SDK loading are removed.
   - Done: Legacy payment plans are disabled by migration.

7. Deployment
   - Done: Cloudflare Pages/Functions runtime is configured.
   - Done: `yarn db:migrate:production:dry-run` lists production migrations, and `yarn db:migrate:production` applies them only after `CONFIRM_PRODUCTION_MIGRATIONS` matches the configured D1 database name.
   - Done: `yarn verify:production` verifies the public deployment URL and can send a real Resend OTP when `PRODUCTION_VERIFY_EMAIL` is provided.
   - Done: `yarn launch:review` prints a non-secret launch review report for public and optional protected runtime evidence.
   - Done: Public launch verification checks that every returned issue includes named HTTP(S) source links.
   - Done: Public launch verification checks issue title, summary, and detail text for verdict-like fact/truth claims.
   - Done: Public launch verification checks deployed HTML, JS, and CSS assets for removed payment-provider and paid-comment wording.
   - Done: Public launch verification checks anonymous reaction persistence by liking, switching, cancelling, restoring baseline counts, and reading `/api/issues` aggregates.
   - Done: Public launch verification checks comment list loading and unauthenticated comment write rejection.
   - Done: `yarn audit:public-copy` checks that visible UI copy avoids removed payment-provider and paid-comment wording.
   - Done: `yarn admin:status`, `yarn admin:ready`, `yarn admin:refresh-issues`, `yarn admin:test-email`, and `yarn admin:verify-email` support protected production operations when an operator token is supplied.
   - Done: Public production verification confirms the deployed app loads and `/api/issues` returns 20 D1-backed issues.
   - Remaining: Confirm protected D1 schema/runtime status with the production admin token.
   - Remaining: Run `yarn check:deploy` in the production build environment after final Cloudflare variables, Resend settings, launch review acknowledgement, and old payment-provider secret removal are complete.

## Required Environment Variables

Frontend:

- None required.

Server:

- `SESSION_TOKEN_SECRET`
- `MODERATION_ADMIN_TOKEN`
- `AUTH_PROVIDER=resend`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`
- `APP_PUBLIC_ORIGIN`
- `LAUNCH_REVIEW_ACK`
- Cloudflare D1 binding named `DB`

## Deployment Gate

Do not claim GlobalPulse is production-ready until the D1 binding, session secret, moderation token, Resend email settings, public origin, and launch review acknowledgement are configured and verified.
Do not claim GlobalPulse is production-ready while old Stripe, Toss, or payment-provider secrets remain configured in the deployment environment.

## Remaining Production Work

- Resend sender/domain verification and email OTP delivery test in production
- Protected admin-token runtime evidence for D1 schema, email settings, public origin, demo-login state, disabled payment plans, and old payment-provider secret removal
- Remove old Stripe/Toss/payment-provider secrets from Cloudflare Pages
- Privacy/security/moderation/content policy review
- Run operator live issue refresh after production secrets and D1 are confirmed
- Set `LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE` after completing the operator launch review
- Run final protected `admin:ready`, `verify:production`, and `launch:review` checks after the acknowledgement deployment
