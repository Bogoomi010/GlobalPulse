# GlobalPulse Local Full-Stack Development

## Run The Vite UI

```bash
yarn dev
```

This serves the frontend only. API calls fall back to local demo state when Pages Functions are not available.

## Run Pages Functions With Local D1

```bash
yarn build
yarn db:migrate:local
yarn pages:dev
```

Open `http://127.0.0.1:8788`.

`pages:dev` uses local placeholder Toss keys. Replace the bindings with real Toss test keys before manually testing the payment window.

Local Pages dev also sets `ALLOW_DEMO_LOGIN=true` so `/api/auth/login` can issue a test session without sending email. Production must use the verified email OTP flow instead.

## API Smoke Test

```bash
yarn test:api
```

The smoke test builds the app, applies D1 migrations to an isolated Wrangler state directory, starts `wrangler pages dev`, and verifies:

- D1 seeded issues are returned
- Wallet API rejects unauthenticated requests
- Login returns a server session token
- Local demo login is explicitly enabled only for the smoke runtime
- Anonymous reactions can be added and cancelled
- Paid comments reject missing auth and insufficient balance
- Missing issue comments do not subtract wallet balance
- Paid comment spending subtracts 100 KRW after a local wallet top-up
- Duplicate paid comment requests do not charge twice
- Comment reporting keeps the comment visible with reported status
- The author can delete their own paid comment
- Payment creation writes a pending Toss payment
- Payment failure/cancellation records a failed top-up transaction without increasing balance

## Production Readiness Gate

```bash
yarn check:deploy
```

This command is expected to fail in local development until production D1 and Toss live payment secrets are configured. It blocks `yarn deploy` when real payments cannot work safely.
