# GlobalPulse Launch Review

Complete this review before telling users that GlobalPulse is production-ready.

Use `OPERATOR_RUNBOOK.md` for the ordered Cloudflare, Resend, verification, and launch acknowledgement procedure.
Use `GOAL_STATUS.md` for the current modified scope, production target, verified public evidence, and remaining launch gates.
Use `yarn goal:status` to print a non-secret summary of unfinished checklist items. Use `yarn goal:complete` as a final local gate; it fails while any checklist item is still open.

Do not paste API keys, admin tokens, OTP codes, session tokens, or secret values into this file. Record only pass/fail results, timestamps, command names, and non-secret observations.

## Required Operator Review

- Privacy review for email login, anonymous reaction tokens, moderation reports, comment retention, and account/session data.
- Moderation review for comment rules, report response workflow, hidden content handling, and escalation.
- Security review for session token entropy, admin token storage, production D1 access, and deployment secret handling.
- Content policy review for neutral issue wording, source attribution, sensitive issue notices, and user-generated comments.
- Jurisdiction review for any country-specific privacy, platform, or user-generated content obligations.

## Evidence Checklist

Complete the Pre-ACK items before setting `LAUNCH_REVIEW_ACK`. Complete the Post-ACK items immediately after setting it.

### Pre-ACK Evidence

- [x] Production URL opens publicly at `https://globalpulse-pages.pages.dev/`.
- [x] `APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review` produces a non-secret launch review report.
- [x] Optional: `APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review --output .artifacts/launch-review-public.md` saves a local non-secret report.
- [x] `APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn verify:production` passes.
- [x] Public verification confirms every returned issue includes named source links with HTTP(S) URLs.
- [x] Public verification confirms issue title, summary, and detail text avoid verdict-like fact/truth claims.
- [x] Public verification confirms anonymous reaction like, switch, cancel, baseline count restoration, and persisted `/api/issues` aggregates.
- [x] Public verification confirms issue comments can be listed and unauthenticated comment creation is rejected.
- [x] `yarn audit:public-copy` confirms public UI copy avoids removed payment-provider, checkout, top-up, and paid-comment wording.
- [x] Public production verification confirms deployed HTML, JS, and CSS assets avoid removed payment-provider, checkout, top-up, and paid-comment wording.
- [x] Public production verification confirms deployed UI/policy copy includes signed-in free comment access, comment non-authority disclaimers, moderation/report handling, and neutral issue framing.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:status` reports D1 schema ready, Resend configured, HTTPS public origin match, demo login disabled, active payment plans `0`, legacy payment secrets `none`, and launch review status not yet acknowledged.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review` includes protected runtime evidence without printing the admin token.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:refresh-issues` refreshes public issues or reports no new items without exposing the token.
- [ ] `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:test-email` sends a production OTP email through Resend.
- [ ] `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com PRODUCTION_VERIFY_EMAIL_CODE=123456 APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:verify-email` verifies the OTP, checks the issued session, and logs it out.
- [ ] Ops screen accepts the admin token and shows `Legacy payment secrets 0`.
- [ ] Cloudflare Pages Variables and Secrets no longer contain Stripe, Toss, or `PAYMENT_PROVIDER` entries.
- [x] Mobile and desktop layouts are usable for feed, issue details, login, comments, policy, and ops.

### Current Evidence Snapshot

```text
Timestamp: 2026-06-07T06:19:04Z
Public launch review: PASS via APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review --output .artifacts/launch-review-public.md
Public production verification: PASS via APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn verify:production, including deployed public-copy audit, deployed policy-copy audit, source links, neutral issue wording, anonymous reaction like/switch/cancel baseline restoration, and unauthenticated comment write rejection
Public copy audit: PASS via yarn audit:public-copy and deployed HTML/JS/CSS verification
Public browser smoke: PASS for feed render, search, category filter, sort tabs, detail modal, anonymous reaction toggle, mobile 390px layout, and desktop 1440px layout
Production responsive smoke: PASS for feed, issue details, login, comments, policy, and ops at 390x844 mobile and 1440x900 desktop with no horizontal overflow
Last Cloudflare dashboard observation: BLOCKED at 2026-06-07T06:16:18Z; required variable names are visible, but legacy payment variable names are still present: PAYMENT_PROVIDER, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TOSS_CLIENT_KEY, TOSS_SECRET_KEY, TOSS_WEBHOOK_SECRET, VITE_TOSS_CLIENT_KEY
Protected runtime evidence: PENDING; requires production admin token
Production email OTP evidence: PENDING; requires operator mailbox OTP flow
Launch ACK evidence: PENDING; set only after all review sections are complete
```

### Post-ACK Verification

- [ ] `LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE` is set only after every review section below is complete.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review` reports runtime readiness complete after `LAUNCH_REVIEW_ACK` is set.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:ready` passes after `LAUNCH_REVIEW_ACK` is set.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn verify:production` passes after `LAUNCH_REVIEW_ACK` is set.

## Privacy Review

- [ ] Email login copy makes clear that users sign in to comment.
- [ ] Anonymous reaction token storage is understood as browser-local state and server-hashed session data.
- [ ] Comment reports, comment retention, hidden comments, and deleted comments have an operator handling policy.
- [ ] Session logout is verified to revoke protected API access.
- [ ] No production response exposes OTP codes, admin tokens, session tokens, or secret values.

Notes:

```text
Reviewer:
Date:
Findings:
```

## Moderation Review

- [ ] Comment reporting flow is available from the issue detail view.
- [ ] Duplicate reports from the same anonymous session are idempotent.
- [ ] Ops queue can list open, reviewed, and all reports.
- [ ] Operator can hide, restore, and dismiss reported comments.
- [ ] Hidden comments are not visible in the public issue detail comment list.
- [ ] Escalation criteria for abusive, illegal, privacy-invasive, or unsafe content are documented outside the application if needed.

Notes:

```text
Reviewer:
Date:
Findings:
```

## Security Review

- [ ] `SESSION_TOKEN_SECRET` is high entropy and not a local/dev/smoke placeholder.
- [ ] `MODERATION_ADMIN_TOKEN` is high entropy, stored only as a Cloudflare secret, and rotated if it was shared during setup.
- [ ] `ALLOW_DEMO_LOGIN` is not enabled in production.
- [ ] `AUTH_EMAIL_DELIVERY=log` is not enabled in production.
- [ ] `APP_PUBLIC_ORIGIN` is exactly the deployed HTTPS origin.
- [ ] D1 binding `DB` points to the intended production database.
- [ ] Old payment-provider secrets are removed from Cloudflare Pages.

Notes:

```text
Reviewer:
Date:
Findings:
```

## Content Policy Review

- [ ] Feed language avoids presenting reactions as factual truth.
- [ ] Issue details include source links where available.
- [ ] Sensitive issues use neutral wording and avoid targeted claims.
- [ ] Comment UI does not imply that comments are verified or authoritative.
- [ ] Public copy does not mention paid comments, top-ups, checkout, Stripe, Toss, or wallets.

Notes:

```text
Reviewer:
Date:
Findings:
```

## Jurisdiction Review

- [ ] Operator has reviewed whether the target launch regions need additional privacy, cookie, UGC, or moderation disclosures.
- [ ] Email sender/domain setup matches the intended operating identity.
- [ ] Any required owner/contact/process information is available outside the app before launch.
- [ ] Launch decision does not rely on this checklist as legal advice.

Notes:

```text
Reviewer:
Date:
Findings:
```

## Go/No-Go

Use this section to record the final operator decision.

```text
Decision: GO / NO-GO
Decision date:
Operator:
Open issues:
```

## Deployment Acknowledgement

After the operator has completed the review, set this deployment variable:

```bash
LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE
```

`yarn check:deploy` must fail without this exact value. This acknowledgement is only an operational gate; it is not a substitute for legal, privacy, security, or moderation advice.
