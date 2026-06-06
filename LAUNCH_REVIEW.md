# GlobalPulse Launch Review

Complete this review before enabling real payments or telling users that GlobalPulse is production-ready.

## Required Operator Review

- Legal review for paid comment terms, refund wording, user notices, and jurisdiction-specific obligations.
- Tax/accounting review for KRW top-ups, wallet balance handling, refunds, and transaction records.
- Payment provider review for Stripe terms, webhook configuration, dispute handling, and callback URLs.
- Privacy review for email login, anonymous reaction tokens, moderation reports, transaction history, and retention.
- Minor payment review for age restrictions, guardian consent requirements, and purchase limits.
- Moderation review for paid comment rules, report response workflow, hidden content handling, and escalation.
- Security review for session token entropy, admin token storage, webhook signature verification, and production D1 access.

## Deployment Acknowledgement

After the operator has completed the review, set this deployment variable:

```bash
LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE
```

`yarn check:deploy` must fail without this exact value. This acknowledgement is only an operational gate; it is not a substitute for legal, tax, privacy, payment provider, or moderation advice.
