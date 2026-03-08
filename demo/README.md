# Demo Bank UI (Live API)

The demo uses our real project APIs via API Gateway.

## What it showcases

- Real register/login/refresh/logout cycle (`/api/v1/auth/*`)
- Profile read + update (`GET/PATCH /api/v1/auth/profile`)
- Real transaction submission (`POST /api/v1/transactions`)
- Currency selector (`USD`, `EUR`, `GBP`, `SGD`, `JPY`, `AUD`, `CAD`, `CHF`, `HKD`, `MYR`)
- Location controls (preset or custom country/city/lat/lng) to make fraud outcomes easier to demo
- Real transaction status updates from your fraud pipeline (`PENDING`, `APPROVED`, `REJECTED`, `FLAGGED`)
- Appeal flow on rejected/flagged transactions:
  - submit customer appeal (`POST /api/v1/appeals`)
  - analyst resolves appeal via Human Verification (`POST /api/v1/reviews/appeals/:appealId/resolve`)
- Email inbox preview rendered from real transaction outcomes:
  - `REJECTED` -> declined customer + declined fraud-team templates
  - `FLAGGED` -> flagged fraud-team template

## Prerequisites

- Your stack is running (`docker compose up --build`)
- API Gateway reachable at `http://localhost:3000`

## Runtime config

The demo no longer hardcodes API hosts in `app.js`.

- Runtime config lives in `demo/config.js`
- `apiBase` can point to any gateway URL, for example:
  - `http://localhost:3000/api/v1`
  - `http://your-hostname:3000/api/v1`
  - `/api/v1` if the demo is reverse-proxied behind the same origin as the gateway
- If `apiBase` is left empty, the demo derives a sensible default from the current hostname

## Run demo UI

From demo folder :

```powershell
python -m http.server 8080
```

Open:

- `http://localhost:8080/`

If needed, change `API Base URL` in the UI or edit `demo/config.js`.

## Demo flow suggestion

1. Register two users (or one user and use sample recipient IDs).
2. Login and submit transfers with different risk scenarios.
3. Click `Refresh` or wait for auto-refresh to see status transitions.
4. Open Email Inbox section to preview rendered flagged/declined templates.
5. Click a transaction row in `Transaction History` to open `Decision Explainability`:
   - decision + risk/ML/rule scores
   - top decision reasons
   - trigger type (`HIGH_VALUE`, `GEOGRAPHIC_RISK`, `THRESHOLD_BAND`, etc.)
   - manual review metadata when available
6. On a `REJECTED` row, click `Appeal` and submit reason.
7. In `Appeals` panel, resolve with:
   - `Uphold` (no transaction status change)
   - `Reverse` (human-verification submits resolution, `appeal.resolved` is published; transaction moves to `APPROVED`)

## Grading Script

1. Start with one normal transfer and show it becomes `APPROVED`.
2. Submit one suspicious transfer and show it becomes `FLAGGED`.
3. Click the flagged row and show explainability reasons/trigger type.
4. Use `Decline` button on the flagged transaction and show status becomes `REJECTED`.
5. Submit appeal on the rejected transaction and resolve it as `REVERSE`.
6. Show transaction status updates to `APPROVED` after appeal resolution.
7. Show rendered internal email template for the reviewed/declined case.
8. Open analytics dashboard (`http://localhost:3008`) and point out:
   - manual reviews count
   - approved-after-review vs declined-after-review
   - average review turnaround
9. Close with model evaluation artifacts:
   - run `npm run evaluate:model` in `ml-scoring-service`
   - show generated `evaluation.md` and `evaluation.json`.

## Why 10,000 Often Becomes Flagged

Your current decision-engine config in `docker-compose.yml` sets:

- `THRESHOLD_HIGH_VALUE_AMOUNT=10000`
- `THRESHOLD_HIGH_VALUE_AUTO_FLAG=true`

So transactions at/above 10,000 are intentionally auto-flagged for manual review.

To demo declined outcomes:

1. Submit risky transactions below 10,000, or
2. Use the `Decline` button on `FLAGGED` rows (manual-review API path).
