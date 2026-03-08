# Fraud Detection Platform - Testing Guide

This guide matches the current Postman collection:

`testing/test.json`

## 1. Prerequisites

- Docker Desktop
- Docker Compose
- Postman
- Node.js 18+ for the automated API test scripts

Start the platform from project root:

```bash
docker compose up --build -d
```

The stack now reads secrets and host port bindings from `.env`.
A development `.env` is provided locally, and `.env.example` documents the expected variables.

## 2. Import Collection

1. Open Postman.
2. Import `testing/test.json`.
3. Use collection variables (already embedded in the collection):
   - `baseUrl = http://localhost:3000`
   - direct service URLs for ports 3001-3008, 3010, and 3011 are preconfigured.
   - monitoring URLs are preconfigured (`http://localhost:9099` and `http://localhost:3009`).
4. Open dashboards in browser:
   - `http://localhost:3008`
   - `http://localhost:3009`

## 2A. Automated Smoke Health Check

Run a quick reachability check across the main entrypoints:

```bash
cd testing
npm run smoke:health
```

The script checks:

- API Gateway live health
- Analytics service live health
- Prometheus health
- Grafana health
- OpenTelemetry Collector health
- Jaeger UI reachability

Optional environment variables:

- `E2E_BASE_URL` (default: `http://localhost:3000/api/v1`)
- `SMOKE_ANALYTICS_HEALTH_URL`
- `SMOKE_PROMETHEUS_HEALTH_URL`
- `SMOKE_GRAFANA_HEALTH_URL`
- `SMOKE_OTEL_HEALTH_URL`
- `SMOKE_JAEGER_URL`
- `SMOKE_REQUEST_TIMEOUT_MS`

## 2B. Automated Guard / Negative-Path Test

Run a fast API regression for common failure and auth guard cases:

```bash
cd testing
npm run test:guards
```

The script covers:

- fresh registration succeeds
- duplicate registration is rejected
- invalid login is rejected
- valid login succeeds
- unauthenticated profile access is blocked
- unauthenticated transaction access is blocked
- invalid transaction payload is rejected
- missing decision returns `404`
- logout succeeds

Optional environment variables:

- `E2E_BASE_URL` (default: `http://localhost:3000/api/v1`)
- `GUARD_AUTH_BASE_URL` (default: `http://localhost:3002/api/v1/auth`)
- `GUARD_TEST_PASSWORD`
- `GUARD_REQUEST_TIMEOUT_MS`

## 2C. Automated Happy-Path Test

Run the API-level end-to-end regression flow:

```bash
cd testing
npm run e2e:happy-path
```

The script covers:

- register
- login
- profile fetch
- high-value transaction creation
- decision persistence
- manual review decline
- appeal submission
- appeal reversal
- analytics verification

Optional environment variables:

- `E2E_BASE_URL` (default: `http://localhost:3000/api/v1`)
- `E2E_PASSWORD`
- `E2E_REQUEST_TIMEOUT_MS`
- `E2E_POLL_TIMEOUT_MS`
- `E2E_POLL_INTERVAL_MS`

## 2D. Notification Provider Proof

Use this to show whether the notification service is still in mock mode or is connected to a real external provider.

```bash
cd testing
npm run proof:notification
```

To make the command fail unless a real SMTP or Twilio provider is enabled and healthy:

```powershell
cd testing
$env:REQUIRE_REAL_NOTIFICATION_PROVIDER='true'
npm.cmd run proof:notification
```

Optional environment variables:

- `NOTIFICATION_PROOF_URL` (default: `http://localhost:3006/api/v1/health`)
- `NOTIFICATION_PROOF_TIMEOUT_MS`
- `REQUIRE_REAL_NOTIFICATION_PROVIDER`

Before using strict mode, set provider variables in `.env` and restart the stack:

- `EMAIL_PROVIDER=smtp` plus `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`
- or `SMS_PROVIDER=twilio` plus `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- optional demo recipients:
  - `NOTIFICATION_CUSTOMER_FALLBACK_EMAIL`
  - `NOTIFICATION_CUSTOMER_FALLBACK_PHONE`
  - `NOTIFICATION_FRAUD_TEAM_EMAIL`
  - `NOTIFICATION_FRAUD_TEAM_PHONE`

Suggested run order for the automated Node scripts:

1. `npm run smoke:health`
2. `npm run test:guards`
3. `npm run e2e:happy-path`
4. `npm run proof:notification`

## 3. Collection Structure (Run Order)

Run folders in this order:

1. `01 - Health and Metrics`
2. `02 - Auth Lifecycle`
3. `03 - Transactions Core`
4. `04 - Fraud and Decision Async Scenarios`
5. `05 - ML Scoring Service Direct`
6. `06 - Notification Service`
7. `07 - Rate Limit and Error Probes`
8. `08 - Audit Service`
9. `09 - End-to-End Smoke Flow`
10. `10 - Human Verification Flow`
11. `11 - Appeal Flow`

## 4. What Each Folder Validates

### 01 - Health and Metrics

Checks health/live/ready/metrics endpoints for:

- API Gateway (`:3000`)
- User service (`:3002`)
- Transaction service (`:3001`)
- Fraud detection service (`:3003`)
- ML scoring service (`:3004`)
- Decision engine service (`:3005`)
- Notification service (`:3006`)
- Audit service (`:3007`)
- Analytics service (`:3008`)
- Prometheus (`:9099`)
- Grafana (`:3009`)

Expected: HTTP `200` for healthy services.

### 02 - Auth Lifecycle

Covers full auth path:

- Register
- Login
- Validate token
- Refresh token
- Get/update profile
- Change password
- Login with new password
- Logout
- Forbidden admin route check (`401/403` expected for non-admin)

The collection auto-saves:

- `accessToken`
- `refreshToken`
- `userId`
- `testEmail`

### 03 - Transactions Core

Covers transaction API behavior through gateway:

- Create transaction (happy path)
- Get by transaction ID
- Get by customer ID
- Idempotency replay scenario (same `X-Idempotency-Key`)
- Validation failure scenario (`400/422` expected)
- Unauthorized scenario (`401/403` expected)

The collection auto-saves:

- `transactionId`
- `customerId`

### 04 - Fraud and Decision Async Scenarios

Validates asynchronous pipeline behavior:

- Fetch decision by transaction ID
- Fetch decision thresholds and stats
- Submit high-risk transaction
- Fetch decision for high-risk transaction

Important: decision endpoints may return `404` temporarily while Kafka processing is still in flight. Retry after 2-5 seconds.

### 05 - ML Scoring Service Direct

Tests ML service directly:

- Single score request (`/api/v1/score`)
- Batch score request (`/api/v1/score/batch`)
- Model info (`/api/v1/model/info`)

Expected: HTTP `200` with score/model payloads.

### 06 - Notification Service

Checks notification service operational endpoints:

- `health/live`
- `health/ready`
- `health`

Expected: HTTP `200`.

### 07 - Rate Limit and Error Probes

Includes:

- Auth brute-force probe (run quickly multiple times): expect `401` initially and `429` when limited.
- Login failure probe for invalid credentials.

### 09 - End-to-End Smoke Flow

Simple production-like smoke run:

1. Register fresh user
2. Login
3. Create transaction
4. Verify decision (retry if first call is `404`)

Expected: transaction created and decision eventually persisted.

### 10 - Human Verification Flow

Validates manual review backend flow:

- Health check for Human Verification Service (`:3010`)
- List pending manual reviews through API Gateway
- Fetch review item by `highRiskTransactionId`
- Submit manual decision (`APPROVED` / `DECLINED` / `FLAGGED`)
- Verify transaction status transitions after review event is consumed
- Includes explicit `DECLINED -> REJECTED` mapping check in transaction status

### 11 - Appeal Flow

Validates customer appeal backend flow:

- Appeal service health check (`:3011`)
- Fetch high-risk transaction and capture source status
- Submit appeal through API Gateway (`POST /api/v1/appeals`)
- List customer appeals and analyst pending queue (`GET /api/v1/reviews/appeals/pending`)
- Resolve appeal through Human Verification (`POST /api/v1/reviews/appeals/:appealId/resolve`)
- Verify transaction status after appeal resolution event is consumed
- Verify audit trail endpoint still responds for transaction timeline

## 5. Async and Reliability Notes

- Fraud scoring and decisioning are event-driven via Kafka and are not synchronous with transaction creation.
- For decision verification, `404` on first check is normal under load.
- Retry decision lookup after a short delay.

## 6. Useful Runtime Checks

Tail service logs when running async scenarios:

```bash
docker logs fraud-detection-service --tail 50
docker logs decision-engine-service --tail 50
docker logs notification-service --tail 50
docker logs analytics-service --tail 50
```

Check running containers:

```bash
docker compose ps
```

## 7. Full Reset

Stop and remove containers:

```bash
docker compose down
```

Stop and remove volumes (full data reset):

```bash
docker compose down -v
```

## 8. Success Criteria

System is healthy when:

- Smoke health checks pass for gateway, analytics, Prometheus, Grafana, the OpenTelemetry Collector, and Jaeger.
- Guard tests reject invalid or unauthenticated access correctly.
- Health endpoints are green across all services.
- Auth lifecycle works end-to-end (including password change).
- Transaction create/read/idempotency behave correctly.
- High-risk transaction reaches decision engine and is queryable.
- ML scoring endpoints return valid responses.
- Notification service health and metrics are reachable.
- Audit service endpoints are reachable.
- Monitoring stack endpoints are reachable (Prometheus and Grafana).
- Rate limiting returns `429` under burst attempts.
- Appeal flow can submit/resolve and transaction status updates correctly after `appeal.resolved`.
