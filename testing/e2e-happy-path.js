const crypto = require('crypto');

const BASE_URL = String(process.env.E2E_BASE_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const PASSWORD = process.env.E2E_PASSWORD || 'Passw0rd!123';
const REQUEST_TIMEOUT_MS = Number(process.env.E2E_REQUEST_TIMEOUT_MS || 10000);
const POLL_TIMEOUT_MS = Number(process.env.E2E_POLL_TIMEOUT_MS || 90000);
const POLL_INTERVAL_MS = Number(process.env.E2E_POLL_INTERVAL_MS || 2000);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function httpRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let body = null;

    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = rawText;
    }

    const expectedStatuses = options.expectedStatuses || [200];
    if (!expectedStatuses.includes(response.status)) {
      const detail = typeof body === 'object'
        ? body?.error?.message || body?.error || body?.message || JSON.stringify(body)
        : rawText;
      throw new Error(`${options.method || 'GET'} ${path} failed with ${response.status}: ${detail}`);
    }

    if (response.ok && body && typeof body === 'object' && body.success === false) {
      throw new Error(`${options.method || 'GET'} ${path} returned unsuccessful payload: ${body.error || body.message || 'Unknown error'}`);
    }

    return { status: response.status, body };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${options.method || 'GET'} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitFor(label, fetcher, options = {}) {
  const timeoutMs = options.timeoutMs || POLL_TIMEOUT_MS;
  const intervalMs = options.intervalMs || POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const value = await fetcher();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  if (lastError) {
    throw new Error(`Timed out waiting for ${label}: ${lastError.message}`);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

function pickUserId(user) {
  return user?.user_id || user?.userId || user?.id || null;
}

function pickTransactionStatus(tx) {
  return String(tx?.status || '').toUpperCase();
}

async function waitForTransactionStatus(transactionId, token, expectedStatus) {
  const target = String(expectedStatus).toUpperCase();
  return waitFor(`transaction ${transactionId} to become ${target}`, async () => {
    const response = await httpRequest(`/transactions/${encodeURIComponent(transactionId)}`, { token });
    const tx = response.body?.data || null;
    return pickTransactionStatus(tx) === target ? tx : null;
  });
}

async function waitForDecision(transactionId, token, expectedDecision) {
  const target = String(expectedDecision).toUpperCase();
  return waitFor(`decision ${target} for ${transactionId}`, async () => {
    const response = await httpRequest(`/decisions/${encodeURIComponent(transactionId)}`, {
      token,
      expectedStatuses: [200, 404],
    });

    if (response.status === 404) {
      return null;
    }

    const decision = response.body?.data || null;
    return String(decision?.decision || '').toUpperCase() === target ? decision : null;
  });
}

async function waitForManualReview(transactionId, token) {
  return waitFor(`manual review for ${transactionId}`, async () => {
    const response = await httpRequest(`/reviews/${encodeURIComponent(transactionId)}`, {
      token,
      expectedStatuses: [200, 404],
    });

    return response.status === 200 ? response.body?.data || null : null;
  });
}

async function waitForAnalyticsChange(token, baseline) {
  return waitFor('analytics counters to reflect manual review and appeal resolution', async () => {
    const response = await httpRequest('/analytics/dashboard?timeRange=1h', { token });
    const metrics = response.body?.data || {};
    const analystImpact = metrics.analystImpact || {};
    const appealImpact = metrics.appealImpact || {};

    const manualReviews = Number(analystImpact.totalManualReviews || 0);
    const appealsCreated = Number(appealImpact.appealsCreated || 0);
    const reversedCount = Number(appealImpact.reversedCount || 0);

    if (
      manualReviews >= baseline.manualReviews + 1 &&
      appealsCreated >= baseline.appealsCreated + 1 &&
      reversedCount >= baseline.reversedCount + 1
    ) {
      return metrics;
    }

    return null;
  }, { timeoutMs: 60000, intervalMs: 3000 });
}

async function main() {
  console.log(`[e2e] Base URL: ${BASE_URL}`);

  const runId = makeId('e2e');
  const email = `${runId}@example.com`;
  const firstName = 'North';
  const lastName = 'Star';

  console.log(`[e2e] Registering user ${email}`);
  await httpRequest('/auth/register', {
    method: 'POST',
    expectedStatuses: [201],
    body: {
      firstName,
      lastName,
      email,
      password: PASSWORD,
      role: 'user',
    },
  });

  console.log('[e2e] Logging in');
  const loginResponse = await httpRequest('/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });

  const session = loginResponse.body?.data || {};
  const accessToken = session.accessToken;
  const refreshToken = session.refreshToken;
  const user = session.user || {};
  const userId = pickUserId(user);

  assert(accessToken, 'Login did not return accessToken');
  assert(refreshToken, 'Login did not return refreshToken');
  assert(userId, 'Login did not return a user identifier');

  console.log(`[e2e] Logged in as ${userId}`);
  const profileResponse = await httpRequest('/auth/profile', { token: accessToken });
  const profileUser = profileResponse.body?.data?.user || {};
  assert(String(profileUser.email || '').toLowerCase() === email, 'Profile email did not match registered user');

  console.log('[e2e] Capturing analytics baseline');
  const baselineAnalyticsResponse = await httpRequest('/analytics/dashboard?timeRange=1h', { token: accessToken });
  const baselineAnalytics = baselineAnalyticsResponse.body?.data || {};
  const baseline = {
    manualReviews: Number(baselineAnalytics.analystImpact?.totalManualReviews || 0),
    appealsCreated: Number(baselineAnalytics.appealImpact?.appealsCreated || 0),
    reversedCount: Number(baselineAnalytics.appealImpact?.reversedCount || 0),
  };

  console.log('[e2e] Creating a high-value transaction expected to require manual review');
  const createTransactionResponse = await httpRequest('/transactions', {
    method: 'POST',
    token: accessToken,
    expectedStatuses: [201],
    body: {
      customerId: userId,
      merchantId: `e2e-merchant-${runId.slice(-8)}`,
      amount: 10000,
      currency: 'USD',
      cardNumber: '4111111111111111',
      cardType: 'visa',
      deviceId: `e2e-device-${runId.slice(-8)}`,
      location: {
        country: 'US',
        city: 'New York',
        lat: 40.7128,
        lng: -74.0060,
      },
      metadata: {
        source: 'e2e-happy-path',
        runId,
      },
    },
  });

  const transactionId = createTransactionResponse.body?.data?.transactionId;
  assert(transactionId, 'Transaction creation did not return transactionId');
  console.log(`[e2e] Transaction created: ${transactionId}`);

  const flaggedDecision = await waitForDecision(transactionId, accessToken, 'FLAGGED');
  console.log(`[e2e] Decision recorded: ${flaggedDecision.decision}`);

  await waitForTransactionStatus(transactionId, accessToken, 'FLAGGED');
  console.log('[e2e] Transaction reached FLAGGED state');

  await waitForManualReview(transactionId, accessToken);
  console.log('[e2e] Manual review record available');

  console.log('[e2e] Submitting manual decline');
  await httpRequest(`/reviews/${encodeURIComponent(transactionId)}/decision`, {
    method: 'POST',
    token: accessToken,
    body: {
      decision: 'DECLINED',
      reviewedBy: `e2e-reviewer-${runId.slice(-8)}`,
      notes: 'Declined by automated E2E test',
    },
  });

  await waitForTransactionStatus(transactionId, accessToken, 'REJECTED');
  console.log('[e2e] Transaction reached REJECTED state');

  console.log('[e2e] Creating appeal');
  const appealResponse = await httpRequest('/appeals', {
    method: 'POST',
    token: accessToken,
    expectedStatuses: [201],
    body: {
      transactionId,
      customerId: userId,
      appealReason: 'Automated E2E appeal reason for regression coverage.',
      evidence: {
        source: 'testing/e2e-happy-path.js',
        runId,
      },
    },
  });

  const appealId = appealResponse.body?.data?.appealId || appealResponse.body?.data?.appeal_id;
  assert(appealId, 'Appeal creation did not return appealId');
  console.log(`[e2e] Appeal created: ${appealId}`);

  const customerAppealsResponse = await httpRequest(`/appeals/customer/${encodeURIComponent(userId)}?limit=20`, {
    token: accessToken,
  });
  const customerAppeals = customerAppealsResponse.body?.data || [];
  assert(customerAppeals.some((appeal) => String(appeal.appealId || appeal.appeal_id) === String(appealId)), 'Appeal was not returned in customer appeal list');

  console.log('[e2e] Resolving appeal as REVERSE');
  await httpRequest(`/reviews/appeals/${encodeURIComponent(appealId)}/resolve`, {
    method: 'POST',
    token: accessToken,
    body: {
      resolution: 'REVERSE',
      reviewedBy: `e2e-analyst-${runId.slice(-8)}`,
      notes: 'Reversed by automated E2E test',
    },
  });

  await waitForTransactionStatus(transactionId, accessToken, 'APPROVED');
  console.log('[e2e] Transaction reached APPROVED state after appeal reversal');

  const analytics = await waitForAnalyticsChange(accessToken, baseline);
  console.log('[e2e] Analytics updated', {
    manualReviews: analytics.analystImpact?.totalManualReviews,
    appealsCreated: analytics.appealImpact?.appealsCreated,
    reversedCount: analytics.appealImpact?.reversedCount,
  });

  console.log('[e2e] Logging out');
  await httpRequest('/auth/logout', {
    method: 'POST',
    expectedStatuses: [200],
    body: { refreshToken },
  });

  console.log('[e2e] Happy-path flow passed');
}

main().catch((error) => {
  console.error(`[e2e] FAILED: ${error.message}`);
  process.exitCode = 1;
});
