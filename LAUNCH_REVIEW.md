# GlobalPulse Launch Review

Complete this review before telling users that GlobalPulse is production-ready.

## Required Operator Review

- Privacy review for email login, anonymous reaction tokens, moderation reports, comment retention, and account/session data.
- Moderation review for comment rules, report response workflow, hidden content handling, and escalation.
- Security review for session token entropy, admin token storage, production D1 access, and deployment secret handling.
- Content policy review for neutral issue wording, source attribution, sensitive issue notices, and user-generated comments.
- Jurisdiction review for any country-specific privacy, platform, or user-generated content obligations.

## Deployment Acknowledgement

After the operator has completed the review, set this deployment variable:

```bash
LAUNCH_REVIEW_ACK=GLOBALPULSE_LAUNCH_REVIEW_COMPLETE
```

`yarn check:deploy` must fail without this exact value. This acknowledgement is only an operational gate; it is not a substitute for legal, privacy, security, or moderation advice.
