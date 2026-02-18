# Fraud Detection Platform – Testing Guide

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

Verify the gateway is up:

```
GET http://localhost:3000/api/v1/health
```

Expected: HTTP 200 OK

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

| Variable | Value                                          |
| -------- | ---------------------------------------------- |
| baseUrl  | [http://localhost:3000](http://localhost:3000) |

Select the environment from the top-right dropdown.

The collection automatically manages:

* accessToken
* refreshToken
* transactionId
* userId

via Postman test scripts.

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
* transactionId returned
* transactionId stored automatically

Validation:

* Full card number never returned
* Only last four digits persisted
* Correlation ID matches


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

Run:

```
Test Idempotency (Duplicate Request)
```

Then run it again.

Expected:

* First call → new transaction
* Second call → idempotent = true
* No duplicate database entry

</details>


# 6. Health & Monitoring

<details>
<summary><strong>Health Endpoints & Prometheus Metrics</strong></summary>

## Health Endpoints

```
GET /api/v1/health
GET /api/v1/health/live
GET /api/v1/health/ready
```

Expected:

* HTTP 200
* Dependency status visible


## Prometheus Metrics

```
GET /api/v1/metrics
```

Expected:

* Plain text Prometheus metrics
* HTTP request counters
* Service metrics

</details>


# 7. End-to-End Scenario

<details>
<summary><strong>Full Flow – Register → Login → Create Transaction</strong></summary>

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

</details>


# 8. Rate Limiting

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


# 9. Optional Advanced Verification

<details>
<summary><strong>Kafka & Database Verification</strong></summary>

## Kafka Event Verification (Windows CMD)

```cmd
docker exec -it kafka kafka-console-consumer --bootstrap-server kafka:9092 --topic transaction.created --from-beginning
```

Expected:

* Transaction events visible when transactions are created


## Database Verification

```bash
docker exec -it transaction-db psql -U postgres
```

Then:

```sql
SELECT * FROM transactions;
```

Verify:

* No full card numbers stored
* Only last four digits present
* No duplicate idempotency keys

</details>


# 10. Full System Reset

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

* User registration
* JWT authentication
* Refresh token lifecycle
* Logout & token revocation
* Profile management
* Password change logic
* Authorization middleware
* Rate limiting
* Idempotency control
* Secure card masking
* Data persistence
* Kafka event publication
* API Gateway routing
* Health & readiness probes
* Prometheus metrics exposure

---

# Conclusion

The system is considered functioning correctly when:

* All endpoints return expected HTTP status codes
* Tokens are issued, refreshed, and revoked properly
* Transactions are created and stored correctly
* Idempotency prevents duplicates
* Rate limits are enforced
* No sensitive card data is persisted
* Kafka events are published successfully
* Health and metrics endpoints are accessible
---