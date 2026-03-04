# Demo Bank UI (Live API)

The demo uses our real project APIs via API Gateway.

## What it showcases

- Real register/login/refresh/logout cycle (`/api/v1/auth/*`)
- Profile read + update (`GET/PATCH /api/v1/auth/profile`)
- Real transaction submission (`POST /api/v1/transactions`)
- Currency selector (`USD`, `EUR`, `GBP`, `SGD`, `JPY`, `AUD`, `CAD`, `CHF`, `HKD`, `MYR`)
- Location controls (preset or custom country/city/lat/lng) to make fraud outcomes easier to demo
- Real transaction status updates from your fraud pipeline (`PENDING`, `APPROVED`, `REJECTED`, `FLAGGED`)
- Email inbox preview rendered from real transaction outcomes:
  - `REJECTED` -> declined customer + declined fraud-team templates
  - `FLAGGED` -> flagged fraud-team template

## Prerequisites

- Your stack is running (`docker compose up --build`)
- API Gateway reachable at `http://localhost:3000`

## Run demo UI

From demo folder :

```powershell
python -m http.server 8080
```

Open:

- `http://localhost:8080/`

If needed, change `API Base URL` in the UI (default: `http://localhost:3000/api/v1`).

## Demo flow suggestion

1. Register two users (or one user and use sample recipient IDs).
2. Login and submit transfers with different risk scenarios.
3. Click `Refresh` or wait for auto-refresh to see status transitions.
4. Open Email Inbox section to preview rendered flagged/declined templates.

## Why 10,000 Often Becomes Flagged

Your current decision-engine config in `docker-compose.yml` sets:

- `THRESHOLD_HIGH_VALUE_AMOUNT=10000`
- `THRESHOLD_HIGH_VALUE_AUTO_FLAG=true`

So transactions at/above 10,000 are intentionally auto-flagged for manual review.

To demo declined outcomes:

1. Submit risky transactions below 10,000, or
2. Use the `Decline` button on `FLAGGED` rows (manual-review API path).
