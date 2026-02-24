// testing/e2e/transaction-flow.spec.js
// End-to-end test for complete fraud detection flow using Playwright

const { test, expect } = require("@playwright/test");

test.describe("Complete Transaction Flow", () => {
  let authToken;
  let transactionId;

  test.beforeAll(async ({ request }) => {
    // Register and login
    const registerResponse = await request.post(
      "http://localhost:3000/api/v1/auth/register",
      {
        data: {
          email: `e2e-test-${Date.now()}@example.com`,
          password: "TestPass123!",
          firstName: "E2E",
          lastName: "Test",
          role: "user",
        },
      },
    );

    expect(registerResponse.ok()).toBeTruthy();

    const registerData = await registerResponse.json();

    const loginResponse = await request.post(
      "http://localhost:3000/api/v1/auth/login",
      {
        data: {
          email: registerData.data.email,
          password: "TestPass123!",
        },
      },
    );

    const loginData = await loginResponse.json();
    authToken = loginData.data.accessToken;
  });

  test("should process low-risk transaction (APPROVED)", async ({
    request,
  }) => {
    // Step 1: Submit transaction
    const submitResponse = await request.post(
      "http://localhost:3000/api/v1/transactions",
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Idempotency-Key": `e2e-low-risk-${Date.now()}`,
        },
        data: {
          customerId: "e2e_customer_low_risk",
          merchantId: "e2e_merchant",
          amount: 50.0,
          currency: "USD",
          cardNumber: "4111111111111111",
          cardType: "visa",
          location: {
            country: "US",
            city: "New York",
          },
        },
      },
    );

    expect(submitResponse.ok()).toBeTruthy();
    const submitData = await submitResponse.json();
    transactionId = submitData.data.transactionId;

    expect(submitData.data.status).toBe("PENDING");

    // Step 2: Wait for fraud detection processing (polling)
    let decision = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

      const decisionResponse = await request.get(
        `http://localhost:3005/api/v1/decisions/${transactionId}`,
        { failOnStatusCode: false },
      );

      if (decisionResponse.ok()) {
        decision = await decisionResponse.json();
        break;
      }

      attempts++;
    }

    // Step 3: Verify decision was made
    expect(decision).not.toBeNull();
    expect(decision.data.decision).toBe("APPROVED");
    expect(decision.data.riskScore).toBeLessThanOrEqual(49);

    // Step 4: Verify audit trail exists
    const auditResponse = await request.get(
      `http://localhost:3007/api/v1/audit/transaction/${transactionId}`,
    );

    expect(auditResponse.ok()).toBeTruthy();
    const auditData = await auditResponse.json();

    expect(auditData.data.eventCount).toBeGreaterThanOrEqual(3);
    expect(auditData.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "transaction.created" }),
        expect.objectContaining({ eventType: "transaction.scored" }),
        expect.objectContaining({ eventType: "transaction.finalised" }),
      ]),
    );

    // Step 5: Verify analytics captured the transaction
    const analyticsResponse = await request.get(
      "http://localhost:3008/api/v1/analytics/realtime",
    );

    expect(analyticsResponse.ok()).toBeTruthy();
  });

  test("should process high-risk transaction (DECLINED)", async ({
    request,
  }) => {
    // Submit high-risk transaction
    const submitResponse = await request.post(
      "http://localhost:3000/api/v1/transactions",
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Idempotency-Key": `e2e-high-risk-${Date.now()}`,
        },
        data: {
          customerId: "e2e_customer_high_risk",
          merchantId: "e2e_merchant",
          amount: 15000.0,
          currency: "USD",
          cardNumber: "4111111111111111",
          cardType: "visa",
          location: {
            country: "NG", // High-risk country
            city: "Lagos",
          },
        },
      },
    );

    expect(submitResponse.ok()).toBeTruthy();
    const submitData = await submitResponse.json();
    const txnId = submitData.data.transactionId;

    // Wait for processing
    let decision = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const decisionResponse = await request.get(
        `http://localhost:3005/api/v1/decisions/${txnId}`,
        { failOnStatusCode: false },
      );

      if (decisionResponse.ok()) {
        decision = await decisionResponse.json();
        break;
      }
    }

    // Verify decision
    expect(decision).not.toBeNull();
    expect(decision.data.decision).toBe("DECLINED");
    expect(decision.data.riskScore).toBeGreaterThanOrEqual(50);

    // Verify audit trail
    const auditResponse = await request.get(
      `http://localhost:3007/api/v1/audit/transaction/${txnId}`,
    );

    expect(auditResponse.ok()).toBeTruthy();
    const auditData = await auditResponse.json();
    expect(auditData.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "transaction.finalised" }),
      ]),
    );
  });

  test("should process medium-risk transaction (FLAGGED)", async ({
    request,
  }) => {
    // Submit medium-risk transaction
    const submitResponse = await request.post(
      "http://localhost:3000/api/v1/transactions",
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Idempotency-Key": `e2e-medium-risk-${Date.now()}`,
        },
        data: {
          customerId: "e2e_customer_medium_risk",
          merchantId: "e2e_merchant",
          amount: 5000.0,
          currency: "USD",
          cardNumber: "4111111111111111",
          cardType: "visa",
          location: {
            country: "RU", // Medium-risk country
            city: "Moscow",
          },
        },
      },
    );

    expect(submitResponse.ok()).toBeTruthy();
    const submitData = await submitResponse.json();
    const txnId = submitData.data.transactionId;

    // Wait for processing
    let decision = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const decisionResponse = await request.get(
        `http://localhost:3005/api/v1/decisions/${txnId}`,
        { failOnStatusCode: false },
      );

      if (decisionResponse.ok()) {
        decision = await decisionResponse.json();
        break;
      }
    }

    // Verify decision
    expect(decision).not.toBeNull();
    expect(decision.data.decision).toBe("FLAGGED");
    expect(decision.data.decisionReason).toContain("manual review");

    // Verify flagged event in audit trail
    const auditResponse = await request.get(
      `http://localhost:3007/api/v1/audit/transaction/${txnId}`,
    );

    const auditData = await auditResponse.json();
    expect(auditData.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "transaction.flagged" }),
      ]),
    );
  });

  test("should verify chain integrity in audit service", async ({
    request,
  }) => {
    // Verify audit chain integrity
    const verifyResponse = await request.post(
      "http://localhost:3007/api/v1/audit/verify",
      {
        data: {
          startEventId: 1,
          endEventId: 100,
        },
      },
    );

    expect(verifyResponse.ok()).toBeTruthy();
    const verifyData = await verifyResponse.json();

    expect(verifyData.data.verified).toBe(true);
    expect(verifyData.data.issues).toHaveLength(0);
  });

  test("should display transaction in analytics dashboard", async ({
    page,
  }) => {
    // Navigate to analytics dashboard
    await page.goto("http://localhost:3008");

    // Wait for dashboard to load
    await page.waitForSelector(".header", { timeout: 10000 });

    // Check that dashboard elements are present
    const totalTransactions = await page.textContent("#total-transactions");
    expect(parseInt(totalTransactions)).toBeGreaterThan(0);

    // Check real-time stats
    await page.waitForSelector("#rt-total");
    const rtTotal = await page.textContent("#rt-total");
    expect(parseInt(rtTotal)).toBeGreaterThanOrEqual(0);

    // Take screenshot for verification
    await page.screenshot({ path: "reports/dashboard-screenshot.png" });
  });
});
