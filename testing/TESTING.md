# Fraud Detection Platform — Testing Guide

This document describes how to test the Fraud Detection Platform using the provided Postman collection:

```
testing/test.json
```

The system must be running locally via Docker before executing any tests.

---

# 1. Setup

<details open>
<summary><strong>Prerequisites & System Startup</strong></summary>

## Prerequisites

Ensure the following are installed:

* Docker Desktop
* Docker Compose
* Postman

## Start the System

From the project root:

```bash
docker-compose up --build
```

Wait until:

* PostgreSQL is healthy
* Kafka and Zookeeper are running
* Redis is ready
* API Gateway is listening on port 3000
* Transaction Service is listening on port 3001
* Fraud Detection Service is listening on port 3003

Verify the gateway is up:

```
GET http://localhost:3000/api/v1/health
```

Verify the fraud detection service is up:

```
GET http://localhost:3003/api/v1/health
```

Verify the ML scoring service is up:

```
GET http://localhost:3004/api/v1/health
```

All should return HTTP 200 OK.

</details>


# 2. Postman Setup

<details>
<summary><strong>Import Collection & Configure Environment</strong></summary>

## Import Collection

1. Open Postman
2. Click **Import**
3. Select **File**
4. Choose:

```
testing/test.json
```

The collection includes built-in variables:

* `baseUrl`
* `accessToken`
* `refreshToken`
* `transactionId`
* `userId`

## Create Environment

Create a new environment:

| Variable | Value                    |
| -------- | ------------------------ |
| baseUrl  | http://localhost:3000    |

Select the environment from the top-right dropdown.

The collection automatically manages `accessToken`, `refreshToken`, `transactionId`, and `userId` via Postman test scripts.

> **Note:** Fraud Detection Service health and metrics endpoints hit `http://localhost:3003` directly — they are not proxied through the API Gateway.

</details>


# 3. Authentication Flow

<details>
<summary><strong>Register, Login, Token Validation, Refresh, Logout</strong></summary>

## Register New User

```
POST /api/v1/auth/register
```

Expected:

* HTTP 201 or 200
* User created
* `userId` stored automatically


## Login

```
POST /api/v1/auth/login
```

Expected:

* HTTP 200
* accessToken returned
* refreshToken returned
* Tokens stored automatically


## Validate Token

```
POST /api/v1/auth/validate
```

Headers:

```
Authorization: Bearer {{accessToken}}
```

Expected:

* HTTP 200
* Token validation success


## Refresh Access Token

```
POST /api/v1/auth/refresh
```

Expected:

* HTTP 200
* New accessToken issued
* accessToken updated


## Logout

```
POST /api/v1/auth/logout
```

Expected:

* HTTP 200
* Tokens cleared

</details>


# 4. User Profile Management

<details>
<summary><strong>Profile Retrieval & Update</strong></summary>

## Get My Profile

```
GET /api/v1/auth/profile
```

Expected:

* HTTP 200
* Authenticated user profile returned


## Update Profile

```
PATCH /api/v1/auth/profile
```

Expected:

* HTTP 200
* Profile updated successfully


## Change Password

```
POST /api/v1/auth/change-password
```

Expected:

* HTTP 200
* Tokens revoked
* Must login again

</details>


# 5. Transaction Testing

<details>
<summary><strong>Create, Fetch & Idempotency Validation</strong></summary>

Login first to obtain `accessToken`.


## Create Transaction

```
POST /api/v1/transactions
```

Headers:

```
Authorization: Bearer {{accessToken}}
X-Idempotency-Key: {{$guid}}
X-Correlation-ID: corr-{{$timestamp}}
```

Expected:

* HTTP 201
* status = PENDING
* transactionId returned and stored automatically

Validation:

* Full card number never returned
* Only last four digits persisted
* Correlation ID matches

Once created, the transaction is published to Kafka (`transaction.created`) and picked up by the Fraud Detection Service within milliseconds. Check fraud processing output:

```bash
docker logs fraud-detection-service --tail 20
```


## Get Transaction by ID

```
GET /api/v1/transactions/{{transactionId}}
```

Expected:

* HTTP 200
* Correct transaction returned
* No sensitive card data exposed


## Get Transactions by Customer

```
GET /api/v1/transactions/customer/customer_123
```

Expected:

* HTTP 200
* Array of transactions


## Idempotency Test

Run **Test Idempotency (Duplicate Request)** twice with the same `X-Idempotency-Key: idempotent-test-key-001`.

Expected:

* First call → HTTP 201, new transaction
* Second call → HTTP 200, `idempotent: true`, no duplicate database entry

</details>


# 6. Fraud Detection

<details>
<summary><strong>Pipeline Verification & High-Risk Transaction Testing</strong></summary>

The fraud detection pipeline runs asynchronously. When a transaction is created via the API, it is published to Kafka and processed by the Fraud Detection Service in the background. There is no synchronous fraud response on the transaction creation endpoint — verification is done via logs or Kafka topic inspection.

## Verify a Normal Transaction Was Scored

After creating any transaction, run:

```bash
docker logs fraud-detection-service --tail 20
```

Expected log output (summarised):

```
"message": "Raw Kafka message received"
"message": "Fraud rules evaluated"
"message": "Fraud analysis completed", "flagged": false, "riskScore": <n>
"message": "Transaction processed successfully"
```

Or consume the scored topic directly:

```bash
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server kafka:9092 \
  --topic transaction.scored \
  --from-beginning
```

## High-Risk Transaction (Fraud Flag Expected)

Run the **High-Risk Transaction (Fraud Flag Expected)** request from the **Test Scenarios** folder.

This sends:

```json
{
  "amount": 15000.00,
  "location": { "country": "KP" }
}
```

Rules triggered:

| Rule | Reason | Score contribution |
|---|---|---|
| Suspicious amount | $15,000 exceeds $10,000 threshold | +30 |
| High-risk country | KP (North Korea) in blocklist | +25 |
| Round amount | $15,000 is divisible by 100 | +5 |

Expected fraud service log:

```
"message": "Fraud analysis completed", "flagged": true, "riskScore": <n>
```

## Fraud Detection Health Check

The fraud detection service exposes its own health endpoint at port 3003 (not behind the API Gateway):

```
GET http://localhost:3003/api/v1/health
```

The response includes:

* Redis connectivity
* ML Scoring Service circuit breaker state (`CLOSED` / `OPEN` / `HALF_OPEN`)
* Process uptime and memory

```
GET http://localhost:3003/api/v1/health/live    — liveness probe
GET http://localhost:3003/api/v1/health/ready   — readiness probe (Redis check)
```

## Fraud Detection Metrics

```
GET http://localhost:3003/api/v1/metrics
```

Key metrics exposed:

| Metric | Description |
|---|---|
| `fraud_detection_transactions_processed_total` | Transactions processed, by status and flagged |
| `fraud_detection_transaction_processing_duration_ms` | End-to-end processing time histogram |
| `fraud_detection_risk_score_distribution` | Risk score histogram by source (rules / ml / combined) |
| `fraud_detection_rule_evaluations_total` | Individual rule evaluations, by rule and triggered |
| `fraud_detection_ml_scoring_requests_total` | ML scoring requests by status (success / fallback / circuit_open) |
| `fraud_detection_ml_circuit_breaker_state` | Circuit breaker state (0=closed, 1=open, 2=half-open) |
| `fraud_detection_kafka_messages_consumed_total` | Kafka messages consumed by status |
| `fraud_detection_kafka_dlq_messages_total` | Dead letter queue messages by reason |

</details>


# 7. ML Scoring Service

<details>
<summary><strong>Direct Scoring, Health, Metrics & Explainability</strong></summary>

The ML Scoring Service runs on port 3004 and is called directly by the Fraud Detection Service via HTTP. It is not proxied through the API Gateway.

## Health Check

```
GET http://localhost:3004/api/v1/health
```

Response includes:

* Redis connectivity (result cache on db:4)
* ML model load status and version
* Cache hit rate and request counts

```
GET http://localhost:3004/api/v1/health/live    — liveness probe
GET http://localhost:3004/api/v1/health/ready   — readiness probe (Redis + model check)
```

## Score a Transaction Directly

```
POST http://localhost:3004/api/v1/score
Content-Type: application/json

{
  "transaction": {
    "id": "txn_test_001",
    "customerId": "customer_123",
    "amount": 15000.00,
    "currency": "USD",
    "createdAt": "2026-02-20T01:00:00.000Z",
    "location": { "country": "KP" }
  },
  "ruleResults": {
    "flagged": true,
    "ruleScore": 75,
    "reasons": ["High-risk country", "Suspicious amount"],
    "riskFactors": {
      "velocity": {
        "customerTransactionsLastHour": 5,
        "customerAmountLastHour": 20000,
        "customerTransactionsLastDay": 12
      },
      "amount": { "suspicious": true, "highAmount": true },
      "geography": { "country": "KP" },
      "time": { "unusualTime": false }
    }
  }
}
```

Expected response:

* `score` — 0–100 risk score
* `probability` — raw model probability
* `confidence` — feature coverage confidence
* `explanation.topContributors` — ranked feature contributions with impact direction
* `explanation.reasons` — human-readable risk reasons
* `metadata.inferenceTimeMs` — model inference latency

> **Note:** Repeated calls with the same transaction ID and rule hash return cached results from Redis. Check `metadata.inferenceTimeMs` — a cache hit will be sub-millisecond.

## Model Information

```
GET http://localhost:3004/api/v1/model/info
```

Returns model version, feature count, cache hit rate, and top feature importances.

## Metrics

```
GET http://localhost:3004/api/v1/metrics
```

Key metrics:

| Metric | Description |
|---|---|
| `ml_scoring_scoring_requests_total` | Total scoring requests by status |
| `ml_scoring_scoring_duration_ms` | End-to-end scoring latency histogram, by cached |
| `ml_scoring_score_distribution` | Distribution of output risk scores |
| `ml_scoring_confidence_distribution` | Distribution of prediction confidence |
| `ml_scoring_model_inference_duration_ms` | Raw model inference latency |
| `ml_scoring_feature_extraction_duration_ms` | Feature engineering latency |
| `ml_scoring_cache_hits_total` | Redis cache hits |
| `ml_scoring_cache_misses_total` | Redis cache misses |
| `ml_scoring_errors_total` | Errors by component and type |

</details>


# 8. Health & Monitoring

<details>
<summary><strong>Health Endpoints & Prometheus Metrics</strong></summary>

## API Gateway Health

```
GET /api/v1/health
GET /api/v1/health/live
GET /api/v1/health/ready
```

Expected:

* HTTP 200
* Dependency status visible

## Prometheus Metrics (API Gateway)

```
GET /api/v1/metrics
```

Expected:

* Plain text Prometheus metrics
* HTTP request counters
* Service metrics

## Fraud Detection Health & Metrics

See **Section 6** above — the fraud detection service runs on port 3003 directly.

</details>


# 9. End-to-End Scenario

<details>
<summary><strong>Full Flow — Register → Login → Create Transaction</strong></summary>

Navigate to:

```
Test Scenarios → Full Flow - Register → Login → Create Transaction
```

Run in order:

1. Register
2. Login
3. Create Transaction

This validates:

* User creation
* Authentication
* Token issuance
* Transaction creation
* Kafka event publication → fraud detection pipeline

After step 3, verify fraud processing:

```bash
docker logs fraud-detection-service --tail 10
```

</details>


# 10. Rate Limiting

<details>
<summary><strong>Brute Force & Rate Limit Testing</strong></summary>

Run:

```
Rate Limit Test (Run 6x quickly)
```

Expected:

* Initial attempts → 401
* After threshold → HTTP 429 Too Many Requests

Validates:

* Auth rate limiting
* Brute force protection

</details>


# 11. Optional Advanced Verification

<details>
<summary><strong>Kafka & Database Verification</strong></summary>

## Kafka: Incoming Transactions

```bash
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server kafka:9092 \
  --topic transaction.created \
  --from-beginning
```

Expected: transaction events appear when transactions are created.

## Kafka: Fraud Scored Transactions

```bash
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server kafka:9092 \
  --topic transaction.scored \
  --from-beginning
```

Expected: scored event per transaction with `riskScore`, `flagged`, full `ruleResults` and `mlResults` audit trail.

## Kafka: Dead Letter Queue

```bash
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server kafka:9092 \
  --topic transaction.dlq \
  --from-beginning
```

Expected: empty under normal operation. Messages appear here if transaction payload fails validation or processing fails after retries.

## Database Verification

```bash
docker exec -it transaction-db psql -U postgres
```

Then:

```sql
SELECT id, customer_id, amount, currency, card_last_four, status FROM transactions;
```

Verify:

* No full card numbers stored
* Only last four digits present
* No duplicate idempotency keys

</details>


# 12. Full System Reset

<details>
<summary><strong>Reset Containers & Data</strong></summary>

Stop containers:

```bash
docker-compose down
```

Remove all data:

```bash
docker-compose down -v
```

</details>


# Test Coverage Summary

This testing guide validates:

* User registration and JWT authentication
* Refresh token lifecycle and logout / token revocation
* Profile management and password change
* Authorization middleware and rate limiting
* Idempotency control and duplicate prevention
* Secure card masking and data persistence
* Kafka event publication (`transaction.created`)
* Fraud detection pipeline (rules engine, ML scoring, score combination)
* ML Scoring Service — direct scoring, feature engineering, explainability, result caching
* Fraud risk scoring and flagging (`transaction.scored`)
* Dead letter queue behaviour
* API Gateway routing
* Health and readiness probes (API Gateway + Fraud Detection Service)
* Prometheus metrics (API Gateway + Fraud Detection Service)

---

# Conclusion

The system is considered functioning correctly when:

* All endpoints return expected HTTP status codes
* Tokens are issued, refreshed, and revoked properly
* Transactions are created and stored correctly with card data masked
* Idempotency prevents duplicates
* Rate limits are enforced
* Kafka events are published to `transaction.created`
* Fraud Detection Service consumes and scores every transaction
* High-risk transactions are flagged (`flagged: true`) in fraud service logs
* Results are published to `transaction.scored`
* Health and metrics endpoints are accessible on gateway (`:3000`), fraud service (`:3003`), and ML scoring service (`:3004`)