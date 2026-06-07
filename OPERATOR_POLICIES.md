# GlobalPulse Operator Policy Templates

These templates are draft operating policies for the launch review. They are not legal advice and do not replace privacy, security, moderation, or jurisdiction-specific review by the operator.

Use this file to complete the policy sections in `LAUNCH_REVIEW.md`. Do not paste API keys, admin tokens, OTP codes, session tokens, or secret values into this file.

## Data Handling Baseline

GlobalPulse currently handles these data categories:

- Public issues and source links.
- Anonymous browser reaction token stored in the browser, with only a server-side hash used to identify an anonymous reaction/report session.
- Like/dislike reactions attached to an anonymous session and issue.
- Email login data for signed-in comments: email, display name, country code, server-issued session hash, session expiry, and last-seen timestamps.
- Email OTP login codes stored as hashes with short expiry.
- Free comments from signed-in users.
- Comment reports from anonymous sessions.
- Operator moderation reviews for reported comments.

Current code-backed behaviors:

- Signed-in user sessions expire after 30 days and can be revoked by logout.
- Comment creation requires a valid Bearer session.
- Anonymous reactions and reports do not expose the browser token in public responses.
- Public comment lists return only `visible` and `reported` comments.
- `hidden` and `deleted` comments are not returned by public comment lists.
- Reported comments remain visible with `reported` status until an operator hides, restores, dismisses, or the author deletes them.
- Moderation reviews support `hide`, `restore`, and `dismiss`.
- Duplicate reports for the same comment and anonymous reporter session are idempotent.
- Comments are free and do not debit wallet balance.
- Payment endpoints return `410 Gone`.

## Privacy Handling Policy

Draft operator policy:

- Email login is used only to issue a server session for commenting.
- Users sign in to comment; anonymous visitors can still react with like/dislike.
- Anonymous reaction/report tokens are browser-local identifiers and are not treated as proof of identity.
- Server-side anonymous session hashes are used only to maintain one reaction per issue and report idempotency.
- Session tokens are stored only as hashes server-side.
- OTP codes are stored only as hashes and expire according to the production auth configuration.
- Logout revokes the current user session.
- Production responses must not expose OTP codes, admin tokens, session tokens, or secret values.
- Operators should use non-secret evidence only when recording launch results.

Current retention and handling baseline:

- User account, email, display name, country code, wallet compatibility, and session records are retained in D1 while the account/session exists.
- User sessions expire after 30 days and logout sets `revoked_at`, preventing further protected API access with that session.
- Comments remain stored in D1 unless the signed-in author deletes them; deleted comments are marked `deleted` with `deleted_at` and are excluded from public comment lists.
- Hidden comments remain stored for operator review but are excluded from public comment lists.
- Reported comments remain publicly visible with `reported` status until an operator hides, restores, dismisses, or the author deletes them.
- Comment reports and operator review records remain stored to preserve moderation history and duplicate-report idempotency.
- Anonymous reaction/report tokens are stored only in the browser; the server stores HMAC hashes derived from those tokens.
- Operators must define any additional deletion, export, contact, or jurisdiction-specific privacy request process before acknowledging launch readiness.

## Comment And Moderation Policy

Draft public rule:

GlobalPulse comments are user-generated discussion. They do not represent verified facts, official conclusions, or GlobalPulse endorsement.

Draft moderation actions:

- `report`: A visitor flags a visible or reported comment for operator review.
- `hide`: Operator hides a reported comment from public comment lists.
- `restore`: Operator returns a previously hidden or reviewed comment to public visibility.
- `dismiss`: Operator closes the report while keeping the comment visible.
- `delete`: The signed-in author deletes their own comment; deleted comments are excluded from public lists and cannot be moderated further.

Review queue policy:

- Review `open` reports first.
- Use `reviewed` to audit recently closed reports.
- Use `all` to confirm report history and queue completeness.
- Record only non-secret notes and timestamps.
- Do not include user email addresses, tokens, or OTP values in public status updates.

Escalation criteria for operator review:

- Hide immediately when a reported comment appears to contain illegal content, instructions to commit harm, private personal data, doxxing, credential or token exposure, targeted harassment, hate, self-harm encouragement, spam, impersonation, or obvious manipulation.
- Restore only when the report was mistaken, the content does not violate the public rule after context review, and the operator records a non-secret note.
- Dismiss when no policy issue is found, the report is duplicative or low-quality, and the comment should remain visible.
- Preserve only non-secret evidence such as issue ID, comment ID, report count, timestamps, action, and operator note.
- Do not copy user emails, OTPs, session tokens, admin tokens, API keys, or other secret values into public notes, tickets, screenshots, or launch reports.
- For legal, safety, privacy, or platform-risk cases, hide first, preserve non-secret identifiers, and route the review through the operator-designated private legal/safety/contact process before restoring the content.

## Content Policy

Draft content positioning:

- GlobalPulse shows reactions to issues; reactions are not truth, authority, or verification.
- Issue copy should avoid declaring a final truth, verdict, or targeted claim.
- Sensitive issues should use context-dependent wording.
- Issue details should include source links where available.
- Comments should not be described as verified or authoritative.
- Public copy should not mention paid comments, top-ups, checkout, Stripe, Toss, wallets, or refunds for paid balances.

Operator review questions:

```text
Do issue titles avoid verdict-like claims?
Do issue summaries/details avoid targeted accusations?
Do sensitive issue notices appear where needed?
Do source links exist where available?
Does comment UI avoid implying verified authority?
```

## Security Operations Policy

Draft operator policy:

- `SESSION_TOKEN_SECRET` must be high entropy and must not contain local/dev/smoke/placeholder wording.
- `MODERATION_ADMIN_TOKEN` must be high entropy, stored only as a Cloudflare secret, and rotated if shared during setup.
- `ALLOW_DEMO_LOGIN` must not be enabled in production.
- `AUTH_EMAIL_DELIVERY=log` must not be enabled in production.
- `APP_PUBLIC_ORIGIN` must exactly match the deployed HTTPS origin.
- The D1 binding `DB` must point to `globalpulse-production`.
- Legacy payment-provider variables and secrets must be removed from Cloudflare Pages.
- Protected runtime evidence should be gathered with environment variables in the shell, not pasted into files.

Secret rotation template:

```text
SESSION_TOKEN_SECRET generated on:
MODERATION_ADMIN_TOKEN generated on:
Cloudflare secret storage confirmed by:
Shared setup token rotated after setup: yes/no
Rotation cadence:
Emergency rotation owner:
```

## Jurisdiction Review Template

The operator must review launch-region obligations before setting `LAUNCH_REVIEW_ACK`. This checklist is operational, not legal advice.

```text
Target launch regions:
Privacy/cookie disclosure required:
UGC or platform disclosure required:
Moderation/contact process required:
Owner/operator contact information required:
Email sender/domain identity reviewed:
Age, safety, or sensitive-content requirements:
Legal/privacy reviewer:
Date:
Decision:
Open issues:
```

## Go/No-Go Inputs

Before marking the launch review complete, collect non-secret evidence for:

- Public launch review report.
- Protected runtime report with admin token supplied only through the shell.
- Cloudflare variable audit showing legacy payment variables are gone.
- Production OTP request and verification.
- Admin ready check after `LAUNCH_REVIEW_ACK`.
- Final `yarn goal:complete`.

Do not claim production readiness until `LAUNCH_REVIEW.md` has every checklist item closed and `yarn goal:complete` passes.
