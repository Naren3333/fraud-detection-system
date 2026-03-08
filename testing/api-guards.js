const crypto = require('crypto');

const BASE_URL = String(process.env.E2E_BASE_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const AUTH_BASE_URL = String(process.env.GUARD_AUTH_BASE_URL || 'http://localhost:3002/api/v1/auth').replace(/\/+$/, '');
const PASSWORD = process.env.GUARD_TEST_PASSWORD || 'Passw0rd!123';
const REQUEST_TIMEOUT_MS = Number(process.env.GUARD_REQUEST_TIMEOUT_MS || 10000);

function makeId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function makeUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const baseUrl = options.baseUrl || BASE_URL;
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
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

    return { status: response.status, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

function authRequest(path, options = {}) {
  return request(path, {
    ...options,
    baseUrl: AUTH_BASE_URL,
  });
}

function logPass(label, status) {
  console.log(`[guards] PASS ${label} -> ${status}`);
}

function assertStatus(label, response, expectedStatuses) {
  assert(expectedStatuses.includes(response.status), `${label} expected ${expectedStatuses.join('/')} but got ${response.status}`);
  logPass(label, response.status);
}

function getUserId(user) {
  return user?.user_id || user?.userId || user?.id || null;
}

async function main() {
  const runId = makeId('guard');
  const email = `${runId}@example.com`;

  console.log(`[guards] Using ${BASE_URL}`);
  console.log(`[guards] Auth base ${AUTH_BASE_URL}`);

  const registerResponse = await authRequest('/register', {
    method: 'POST',
    body: {
      firstName: 'Guard',
      lastName: 'Tester',
      email,
      password: PASSWORD,
      role: 'user',
    },
  });
  assertStatus('register fresh user', registerResponse, [201]);

  const duplicateRegisterResponse = await authRequest('/register', {
    method: 'POST',
    body: {
      firstName: 'Guard',
      lastName: 'Tester',
      email,
      password: PASSWORD,
      role: 'user',
    },
  });
  assertStatus('reject duplicate registration', duplicateRegisterResponse, [400, 409]);

  const invalidLoginResponse = await authRequest('/login', {
    method: 'POST',
    body: { email, password: `${PASSWORD}-wrong` },
  });
  assertStatus('reject invalid password', invalidLoginResponse, [401]);

  const loginResponse = await authRequest('/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  assertStatus('login valid user', loginResponse, [200]);

  const accessToken = loginResponse.body?.data?.accessToken;
  const refreshToken = loginResponse.body?.data?.refreshToken;
  const userId = getUserId(loginResponse.body?.data?.user);

  assert(accessToken, 'Valid login did not return access token');
  assert(refreshToken, 'Valid login did not return refresh token');
  assert(userId, 'Valid login did not return user id');

  const unauthProfileResponse = await authRequest('/profile');
  assertStatus('block unauthenticated profile access', unauthProfileResponse, [401, 403]);

  const unauthTransactionResponse = await request('/transactions/customer/some-user?limit=5');
  assertStatus('block unauthenticated transaction access', unauthTransactionResponse, [401, 403]);

  const invalidTransactionResponse = await request('/transactions', {
    method: 'POST',
    token: accessToken,
    body: {
      customerId: userId,
      amount: -10,
    },
  });
  assertStatus('reject invalid transaction payload', invalidTransactionResponse, [400, 422]);

  const missingDecisionResponse = await request(`/decisions/${encodeURIComponent(makeUuid())}`, {
    token: accessToken,
  });
  assertStatus('return 404 for missing decision', missingDecisionResponse, [404]);

  const logoutResponse = await authRequest('/logout', {
    method: 'POST',
    body: { refreshToken },
  });
  assertStatus('logout valid session', logoutResponse, [200]);

  console.log('[guards] Guard suite passed');
}

main().catch((error) => {
  console.error(`[guards] FAILED: ${error.message}`);
  process.exitCode = 1;
});
