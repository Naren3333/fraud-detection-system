# Fraud Detection Platform - Testing Guide

This guide matches the current Postman collection:

`testing/test.json`

## 1. Prerequisites

- Docker Desktop
- Docker Compose
- Postman

Start the platform from project root:

```bash
docker compose up --build -d
```

## 2. Import Collection

1. Open Postman.
2. Import `testing/test.json`.
3. Use collection variables (already embedded in the collection):
   - `baseUrl = http://localhost:3000`
   - direct service URLs for ports 3001-3006 are preconfigured.

## 3. Collection Structure (Run Order)

Run folders in this order:

1. `01 - Health and Metrics`
2. `02 - Auth Lifecycle`
3. `03 - Transactions Core`
4. `04 - Fraud and Decision Async Scenarios`
5. `05 - ML Scoring Service Direct`
6. `06 - Notification Service`
7. `07 - Rate Limit and Error Probes`
8. `08 - End-to-End Smoke Flow`

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

### 08 - End-to-End Smoke Flow

Simple production-like smoke run:

1. Register fresh user
2. Login
3. Create transaction
4. Verify decision (retry if first call is `404`)

Expected: transaction created and decision eventually persisted.

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

- Health endpoints are green across all services.
- Auth lifecycle works end-to-end (including password change).
- Transaction create/read/idempotency behave correctly.
- High-risk transaction reaches decision engine and is queryable.
- ML scoring endpoints return valid responses.
- Notification service health and metrics are reachable.
- Rate limiting returns `429` under burst attempts.
