# TESTING.md

# Fraud Detection Platform - Testing Guide

This document describes how to test the Fraud Detection Platform using the provided Postman collection.

The system must be running locally via Docker before executing any tests.

---

# 1. Prerequisites

Ensure the following are installed:

* Docker Desktop
* Docker Compose
* Postman

---

# 2. Start the System

From the project root:

```bash
docker-compose up --build
```

Wait until:

* PostgreSQL is ready
* Kafka and Zookeeper are running
* API Gateway is listening on port 3000
* Transaction Service is listening on port 3001

Verify the gateway is up:

```
GET http://localhost:3000/api/v1/health
```

Expected: HTTP 200 response.

---

# 3. Import Postman Collection

1. Open Postman
2. Click **Import**
3. Select **File**
4. Choose:

```
testing/test.json
```

---

# 4. Create a Postman Environment

Create a new environment with the following variable:

| Variable | Value                                          |
| -------- | ---------------------------------------------- |
| baseUrl  | [http://localhost:3000](http://localhost:3000) |

Save and select this environment (top right corner, switch from no environment to this newly created one).

The collection will automatically store:

* `token`
* `transactionId`

after running specific requests.

---

# 5. Standard Test Flow

Run requests in the following order.

---

## 5.1 Login

Endpoint:

```
POST /api/v1/auth/login
```

Body:

```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

Expected:

* HTTP 200
* JWT token returned
* Token stored automatically in environment variable `token`

Failure cases to test:

* Wrong password → 401
* Missing body → 400
* Excessive attempts → 429 (rate limited)

---

## 5.2 Create Transaction

Endpoint:

```
POST /api/v1/transactions
```

Headers:

```
Authorization: Bearer {{token}}
Content-Type: application/json
X-Idempotency-Key: unique-key-001
X-Correlation-ID: test-corr-001
```

Body:

```json
{
  "customerId": "customer_123",
  "merchantId": "merchant_456",
  "amount": 1500.00,
  "currency": "USD",
  "cardNumber": "4111111111111111",
  "cardType": "visa",
  "deviceId": "device_abc",
  "ipAddress": "192.168.1.100",
  "location": {
    "country": "SG",
    "city": "Singapore"
  },
  "metadata": {
    "channel": "mobile"
  }
}
```

Expected:

* HTTP 201
* status = PENDING
* transactionId returned
* transactionId stored automatically

Validation checks:

* Card number should not be returned
* Only last four digits should be stored
* Correlation ID should match request

---

## 5.3 Idempotency Test

Repeat the same request with the same:

```
X-Idempotency-Key: unique-key-001
```

Expected:

* HTTP 200 or 201
* idempotent = true
* No duplicate transaction created in database

Change the idempotency key to confirm new record creation.

---

## 5.4 Get Transaction By ID

Endpoint:

```
GET /api/v1/transactions/{{transactionId}}
```

Expected:

* HTTP 200
* Correct transaction returned
* No sensitive card data exposed

Failure test:

* Invalid ID → 404
* Missing JWT → 401

---

## 5.5 Get Transactions By Customer

Endpoint:

```
GET /api/v1/transactions/customer/customer_123
```

Expected:

* HTTP 200
* Array of transactions
* Includes newly created transaction

---

## 5.6 Health Endpoints

Test without authentication:

```
GET /api/v1/health
GET /api/v1/health/live
GET /api/v1/health/ready
```

Expected:

* 200 OK
* Dependencies listed (Redis, etc.)

---

# 6. Rate Limiting Tests

## Auth Rate Limit

Attempt login more than 5 times within 15 minutes.

Expected:

* HTTP 429
* Error message indicating rate limit exceeded

## Transaction Rate Limit

Send more than 50 transaction requests within 1 minute.

Expected:

* HTTP 429

---

# 7. JWT Security Tests

## Missing Token

Remove Authorization header.

Expected:

* HTTP 401

## Invalid Token

Modify token manually.

Expected:

* HTTP 401

## Expired Token (if implemented)

Wait until expiry or simulate invalid signature.

Expected:

* HTTP 401

---

# 8. Kafka Verification (Optional Advanced Testing)

To verify events are being published:

```bash
docker exec -it kafka kafka-console-consumer \
--bootstrap-server kafka:9092 \
--topic transaction.created \
--from-beginning
```

You should see events when transactions are created.

---

# 9. Database Verification (Optional)

Connect to PostgreSQL container:

```bash
docker exec -it transaction-db psql -U postgres
```

Then:

```sql
SELECT * FROM transactions;
```

Confirm:

* No full card numbers stored
* Only last four digits present
* No duplicate entries for same idempotency key

---

# 10. Full System Reset

To stop services:

```bash
docker-compose down
```

To remove all data:

```bash
docker-compose down -v
```

---

# 11. Expected Test Coverage

This testing flow validates:

* Authentication
* Authorization
* Rate limiting
* Idempotency
* Data persistence
* Health checks
* Secure card handling
* Event publication to Kafka
* API Gateway routing

---

# 12. Testing Order Summary

1. Start Docker
2. Import Postman collection
3. Create environment
4. Login
5. Create transaction
6. Test idempotency
7. Fetch by ID
8. Fetch by customer
9. Test rate limits
10. Test JWT failures

---

# Conclusion

The system is considered functioning correctly when:

* All endpoints return expected status codes
* Idempotency prevents duplicate transactions
* Rate limits are enforced
* JWT authentication is required
* Sensitive card data is not stored
* Kafka events are published successfully
---