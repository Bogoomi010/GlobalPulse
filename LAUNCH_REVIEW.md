# GlobalPulse Launch Review

Complete this review before telling users that GlobalPulse is production-ready.

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

- [ ] Production URL opens publicly at `https://globalpulse-pages.pages.dev/`.
- [ ] `APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review` produces a non-secret launch review report.
- [ ] `APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn verify:production` passes.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:status` reports D1 schema ready, Resend configured, HTTPS public origin match, demo login disabled, active payment plans `0`, legacy payment secrets `none`, and launch review status not yet acknowledged.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn launch:review` includes protected runtime evidence without printing the admin token.
- [ ] `PRODUCTION_ADMIN_TOKEN=... APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:refresh-issues` refreshes public issues or reports no new items without exposing the token.
- [ ] `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:test-email` sends a production OTP email through Resend.
- [ ] `PRODUCTION_ADMIN_TOKEN=... PRODUCTION_VERIFY_EMAIL=operator@example.com PRODUCTION_VERIFY_EMAIL_CODE=123456 APP_PUBLIC_ORIGIN=https://globalpulse-pages.pages.dev yarn admin:verify-email` verifies the OTP, checks the issued session, and logs it out.
- [ ] Ops screen accepts the admin token and shows `Legacy payment secrets 0`.
- [ ] Cloudflare Pages Variables and Secrets no longer contain Stripe, Toss, or `PAYMENT_PROVIDER` entries.
- [ ] Mobile and desktop layouts are usable for feed, issue details, login, comments, policy, and ops.

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
