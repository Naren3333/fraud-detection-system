// testing/load/transaction-load.js
// Load test for Transaction Service using k6

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const transactionDuration = new Trend("transaction_duration");
const transactionsCreated = new Counter("transactions_created");

// Test configuration
export const options = {
  stages: [
    { duration: "1m", target: 50 }, // Ramp up to 50 users
    { duration: "3m", target: 50 }, // Stay at 50 users
    { duration: "1m", target: 100 }, // Ramp up to 100 users
    { duration: "3m", target: 100 }, // Stay at 100 users
    { duration: "1m", target: 200 }, // Spike to 200 users
    { duration: "2m", target: 200 }, // Stay at 200 users
    { duration: "1m", target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests under 500ms
    http_req_failed: ["rate<0.01"], // Error rate under 1%
    errors: ["rate<0.05"], // Custom error rate under 5%
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// Setup: Get auth token
export function setup() {
  // Register user
  const registerPayload = JSON.stringify({
    email: `loadtest-${Date.now()}@example.com`,
    password: "LoadTest123!",
    firstName: "Load",
    lastName: "Test",
    role: "user",
  });

  const registerRes = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    registerPayload,
    {
      headers: { "Content-Type": "application/json" },
    },
  );

  const registerData = registerRes.json();

  // Login
  const loginPayload = JSON.stringify({
    email: registerData.data.email,
    password: "LoadTest123!",
  });

  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, loginPayload, {
    headers: { "Content-Type": "application/json" },
  });

  const loginData = loginRes.json();
  return { token: loginData.data.accessToken };
}

// Main test scenario
export default function (data) {
  const token = data.token;

  // Generate random transaction data
  const transaction = {
    customerId: `customer_${__VU}_${__ITER}`, // Virtual User + Iteration
    merchantId: `merchant_${Math.floor(Math.random() * 10)}`,
    amount: parseFloat((Math.random() * 1000 + 10).toFixed(2)),
    currency: ["USD", "EUR", "GBP"][Math.floor(Math.random() * 3)],
    cardNumber: "4111111111111111",
    cardType: "visa",
    location: {
      country: ["US", "GB", "SG", "CA"][Math.floor(Math.random() * 4)],
      city: "Test City",
    },
  };

  const payload = JSON.stringify(transaction);

  // Submit transaction
  const startTime = new Date();
  const res = http.post(`${BASE_URL}/api/v1/transactions`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": `loadtest-${__VU}-${__ITER}-${Date.now()}`,
    },
  });
  const endTime = new Date();
  const duration = endTime - startTime;

  // Record metrics
  transactionDuration.add(duration);

  // Check response
  const success = check(res, {
    "status is 201": (r) => r.status === 201,
    "response has transactionId": (r) => {
      const body = r.json();
      return body.data && body.data.transactionId;
    },
    "response time < 1s": (r) => r.timings.duration < 1000,
  });

  if (success) {
    transactionsCreated.add(1);
  } else {
    errorRate.add(1);
    console.error(`Failed request: ${res.status} - ${res.body}`);
  }

  // Think time between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// Teardown
export function teardown() {
  console.log("Load test completed");
  console.log(`Final transactions created: ${transactionsCreated.count}`);
}
