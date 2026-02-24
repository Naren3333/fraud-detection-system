// testing/integration/transaction-api.test.js
// Integration tests for Transaction Service API

const request = require("supertest");
const { Pool } = require("pg");
const app = require("../../transaction-service/src/index");

describe("Transaction Service API", () => {
  let pool;
  let authToken;

  beforeAll(async () => {
    // Connect to test database
    pool = new Pool({
      host: process.env.TEST_DB_HOST || "localhost",
      port: process.env.TEST_DB_PORT || 5433,
      database: "transaction_db_test",
      user: "test_user",
      password: "test_password",
    });

    // Get auth token
    const authResponse = await request("http://localhost:3000")
      .post("/api/v1/auth/login")
      .send({
        email: "test@example.com",
        password: "TestPass123!",
      });

    authToken = authResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean database before each test
    await pool.query("TRUNCATE transactions CASCADE");
  });

  describe("POST /api/v1/transactions", () => {
    it("should create a valid transaction", async () => {
      const transactionData = {
        customerId: "cust_test_123",
        merchantId: "merchant_test",
        amount: 100.0,
        currency: "USD",
        cardNumber: "4111111111111111",
        cardType: "visa",
        location: {
          country: "US",
          city: "New York",
        },
      };

      const response = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .set("X-Idempotency-Key", "test-idempotency-1")
        .send(transactionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("transactionId");
      expect(response.body.data.amount).toBe(100.0);
      expect(response.body.data.status).toBe("PENDING");

      // Verify in database
      const dbResult = await pool.query(
        "SELECT * FROM transactions WHERE transaction_id = $1",
        [response.body.data.transactionId],
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].amount).toBe("100.00");
    });

    it("should reject transaction without auth token", async () => {
      const response = await request(app)
        .post("/api/v1/transactions")
        .send({
          customerId: "cust_123",
          amount: 100,
          currency: "USD",
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("auth");
    });

    it("should reject transaction with invalid amount", async () => {
      const response = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          customerId: "cust_123",
          merchantId: "merchant_test",
          amount: -100, // Invalid negative amount
          currency: "USD",
          cardNumber: "4111111111111111",
          cardType: "visa",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("amount");
    });

    it("should reject transaction with missing required fields", async () => {
      const response = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          customerId: "cust_123",
          // Missing amount, currency, cardNumber
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should enforce idempotency", async () => {
      const transactionData = {
        customerId: "cust_test_123",
        merchantId: "merchant_test",
        amount: 100.0,
        currency: "USD",
        cardNumber: "4111111111111111",
        cardType: "visa",
      };

      const idempotencyKey = "test-idempotency-duplicate";

      // First request
      const response1 = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .set("X-Idempotency-Key", idempotencyKey)
        .send(transactionData)
        .expect(201);

      const transactionId1 = response1.body.data.transactionId;

      // Second request with same idempotency key
      const response2 = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .set("X-Idempotency-Key", idempotencyKey)
        .send(transactionData)
        .expect(201);

      const transactionId2 = response2.body.data.transactionId;

      // Should return the same transaction
      expect(transactionId1).toBe(transactionId2);

      // Verify only one record in database
      const dbResult = await pool.query(
        "SELECT COUNT(*) FROM transactions WHERE transaction_id = $1",
        [transactionId1],
      );

      expect(parseInt(dbResult.rows[0].count)).toBe(1);
    });

    it("should handle large amounts correctly", async () => {
      const response = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .set("X-Idempotency-Key", "test-large-amount")
        .send({
          customerId: "cust_test_123",
          merchantId: "merchant_test",
          amount: 999999.99,
          currency: "USD",
          cardNumber: "4111111111111111",
          cardType: "visa",
        })
        .expect(201);

      expect(response.body.data.amount).toBe(999999.99);
    });

    it("should reject unsupported currencies", async () => {
      const response = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          customerId: "cust_test_123",
          merchantId: "merchant_test",
          amount: 100,
          currency: "XYZ", // Invalid currency
          cardNumber: "4111111111111111",
          cardType: "visa",
        })
        .expect(400);

      expect(response.body.error).toContain("currency");
    });
  });

  describe("GET /api/v1/transactions/:id", () => {
    it("should retrieve a transaction by ID", async () => {
      // Create transaction first
      const createResponse = await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .set("X-Idempotency-Key", "test-get-txn")
        .send({
          customerId: "cust_test_123",
          merchantId: "merchant_test",
          amount: 200.0,
          currency: "USD",
          cardNumber: "4111111111111111",
          cardType: "visa",
        })
        .expect(201);

      const transactionId = createResponse.body.data.transactionId;

      // Retrieve transaction
      const getResponse = await request(app)
        .get(`/api/v1/transactions/${transactionId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.transactionId).toBe(transactionId);
      expect(getResponse.body.data.amount).toBe(200.0);
    });

    it("should return 404 for non-existent transaction", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const response = await request(app)
        .get(`/api/v1/transactions/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it("should return 400 for invalid transaction ID format", async () => {
      const response = await request(app)
        .get("/api/v1/transactions/invalid-uuid")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain("Invalid");
    });
  });

  describe("GET /api/v1/health", () => {
    it("should return healthy status", async () => {
      const response = await request(app).get("/api/v1/health").expect(200);

      expect(response.body.status).toBe("healthy");
      expect(response.body).toHaveProperty("dependencies");
      expect(response.body.dependencies.database.status).toBe("healthy");
    });
  });
});
