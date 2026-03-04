const SESSION_KEY = "northstar_demo_api_session";
const API_BASE_KEY = "northstar_demo_api_base";

const state = {
  session: null,
  user: null,
  transactions: [],
  decisionByTransaction: {},
  selectedTransactionId: null,
  poller: null,
};

const authView = document.getElementById("authView");
const dashboardView = document.getElementById("dashboardView");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const transferForm = document.getElementById("transferForm");
const profileForm = document.getElementById("profileForm");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

const apiBaseInput = document.getElementById("apiBaseInput");
const authStatus = document.getElementById("authStatus");
const apiStatus = document.getElementById("apiStatus");
const transferStatus = document.getElementById("transferStatus");
const profileStatus = document.getElementById("profileStatus");
const profileMeta = document.getElementById("profileMeta");

const welcomeText = document.getElementById("welcomeText");
const mainBalance = document.getElementById("mainBalance");
const reserveBalance = document.getElementById("reserveBalance");
const totalBalance = document.getElementById("totalBalance");

const profileFirstName = document.getElementById("profileFirstName");
const profileLastName = document.getElementById("profileLastName");
const profilePhone = document.getElementById("profilePhone");

const transactionRows = document.getElementById("transactionRows");
const explainabilityPanel = document.getElementById("explainabilityPanel");
const mailList = document.getElementById("mailList");
const mailPreview = document.getElementById("mailPreview");
const transactionSearch = document.getElementById("transactionSearch");
const emailSearch = document.getElementById("emailSearch");
const locationPresetSelect = document.getElementById("locationPreset");
const customLocationFields = document.getElementById("customLocationFields");

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getApiBase() {
  const raw = apiBaseInput.value.trim() || "http://localhost:3000/api/v1";
  return raw.replace(/\/$/, "");
}

function saveApiBase() {
  localStorage.setItem(API_BASE_KEY, getApiBase());
}

function setLineStatus(node, message, isError = false) {
  node.textContent = message || "";
  node.classList.remove("status-success", "status-error");
  node.classList.add(isError ? "status-error" : "status-success");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function normalizeUser(user) {
  return {
    id: user.user_id || user.userId,
    email: user.email,
    firstName: user.first_name || user.firstName || "",
    lastName: user.last_name || user.lastName || "",
    phone: user.phone || "",
    role: user.role || "user",
    status: user.status || "ACTIVE",
  };
}

function setSession(session) {
  state.session = session;
  saveJson(SESSION_KEY, session);
}

function clearSession() {
  state.session = null;
  state.user = null;
  state.transactions = [];
  state.decisionByTransaction = {};
  state.selectedTransactionId = null;
  localStorage.removeItem(SESSION_KEY);
}

async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const needsAuth = options.auth !== false;
  const allowRefreshRetry = options.retry !== false;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (needsAuth) {
    if (!state.session?.accessToken) {
      throw new Error("Not authenticated");
    }
    headers.Authorization = `Bearer ${state.session.accessToken}`;
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401 && needsAuth && allowRefreshRetry && state.session?.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest(path, { ...options, retry: false });
    }
  }

  if (!response.ok || payload?.success === false) {
    const msg = payload?.error?.message || payload?.message || `Request failed (${response.status})`;
    throw new Error(msg);
  }

  return payload;
}

async function refreshAccessToken() {
  if (!state.session?.refreshToken) {
    return false;
  }

  try {
    const payload = await apiRequest("/auth/refresh", {
      method: "POST",
      auth: false,
      retry: false,
      body: { refreshToken: state.session.refreshToken },
    });

    const accessToken = payload?.data?.accessToken;
    const user = payload?.data?.user;
    if (!accessToken) {
      return false;
    }

    setSession({
      ...state.session,
      accessToken,
      user: user || state.session.user,
    });

    return true;
  } catch {
    return false;
  }
}

function statusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return "approved";
  if (value === "FLAGGED") return "flagged";
  if (value === "REJECTED" || value === "DECLINED") return "rejected";
  return "pending";
}

function transactionSummary(transactions) {
  const summary = {
    totalSubmitted: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    flagged: 0,
  };

  for (const tx of transactions) {
    summary.totalSubmitted += Number(tx.amount || 0);
    const code = String(tx.status || "").toUpperCase();
    if (code === "PENDING") summary.pending += 1;
    else if (code === "APPROVED") summary.approved += 1;
    else if (code === "REJECTED" || code === "DECLINED") summary.rejected += 1;
    else if (code === "FLAGGED") summary.flagged += 1;
  }

  return summary;
}

function renderSummary(transactions) {
  const data = transactionSummary(transactions);
  mainBalance.textContent = formatMoney(data.totalSubmitted);
  reserveBalance.textContent = String(data.pending);
  totalBalance.textContent = `${data.approved} / ${data.rejected} / ${data.flagged}`;
}

function renderTransactions(transactions) {
  const searchTerm = (transactionSearch.value || "").trim().toLowerCase();
  const filtered = transactions.filter((tx) => {
    if (!searchTerm) return true;
    const date = tx.createdAt || tx.created_at;
    const merchant = tx.merchantId || tx.merchant_id || "";
    const haystack = [
      tx.id,
      merchant,
      tx.status,
      Number(tx.amount || 0).toFixed(2),
      formatDate(date),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchTerm);
  });

  if (!filtered.length) {
    transactionRows.innerHTML = "<tr><td colspan='6'>No transactions match your search.</td></tr>";
    state.selectedTransactionId = null;
    void renderExplainability(null);
    return;
  }

  transactionRows.innerHTML = filtered
    .map((tx) => {
      const date = tx.createdAt || tx.created_at;
      const merchant = tx.merchantId || tx.merchant_id || "-";
      const css = statusClass(tx.status);
      const status = String(tx.status || "").toUpperCase();
      const action = status === "FLAGGED"
        ? `<button class="inline-btn decline-btn" data-id="${tx.id}">Decline</button>`
        : "-";
      return `<tr data-tx-id="${tx.id}">
        <td>${formatDate(date)}</td>
        <td><code>${tx.id}</code></td>
        <td>${merchant}</td>
        <td>${formatMoney(Number(tx.amount || 0))}</td>
        <td><span class="status-pill status-${css}">${tx.status}</span></td>
        <td>${action}</td>
      </tr>`;
    })
    .join("");

  transactionRows.querySelectorAll(".decline-btn").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const txId = btn.dataset.id;
      try {
        btn.disabled = true;
        await apiRequest(`/reviews/${encodeURIComponent(txId)}/decision`, {
          method: "POST",
          body: {
            decision: "DECLINED",
            reviewedBy: `demo-ui-${(state.user?.id || "reviewer").slice(0, 12)}`,
            notes: "Declined from demo UI manual review action",
          },
        });
        setLineStatus(transferStatus, `Manual review submitted: ${txId} -> DECLINED.`);
        await loadTransactions();
      } catch (error) {
        setLineStatus(transferStatus, `Failed manual decline for ${txId}: ${error.message}`, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  const selectedId = filtered.some((tx) => tx.id === state.selectedTransactionId)
    ? state.selectedTransactionId
    : filtered[0].id;
  state.selectedTransactionId = selectedId;

  transactionRows.querySelectorAll("tr[data-tx-id]").forEach((row) => {
    if (row.dataset.txId === selectedId) {
      row.classList.add("tx-selected");
    }
    row.addEventListener("click", () => {
      state.selectedTransactionId = row.dataset.txId;
      transactionRows.querySelectorAll("tr[data-tx-id]").forEach((r) => r.classList.remove("tx-selected"));
      row.classList.add("tx-selected");
      void renderExplainability(row.dataset.txId);
    });
  });

  void renderExplainability(selectedId);
}

function transactionById(transactionId) {
  return state.transactions.find((tx) => tx.id === transactionId) || null;
}

function inferManualTriggerType(decision) {
  if (!decision) return "N/A";
  const overrideType = decision.override_type || decision.overrideType;
  if (overrideType) return overrideType;

  const factors = decision.decision_factors || decision.decisionFactors || {};
  if (factors.highValue) return "HIGH_VALUE";
  if (factors.geographicRisk) return "GEOGRAPHIC_RISK";
  if (factors.rulesFlagged) return "RULES_FLAGGED";
  if (factors.thresholdBased) return "THRESHOLD_BAND";
  return "N/A";
}

function reasonList(reasonText) {
  if (!reasonText) return [];
  return String(reasonText)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildExplainabilityHtml(tx, decision) {
  if (!tx) {
    return "<p class='muted'>Select a transaction row to load explainability details.</p>";
  }

  if (!decision) {
    return `
      <p class="muted">No decision metadata available yet for <code>${escapeHtml(tx.id)}</code>.</p>
      <p class="muted">Status is currently <strong>${escapeHtml(String(tx.status || "PENDING"))}</strong>.</p>
    `;
  }

  const factors = decision.decision_factors || decision.decisionFactors || {};
  const reasons = reasonList(decision.decision_reason || decision.decisionReason);
  const riskScore = decision.risk_score ?? "-";
  const mlScore = decision.ml_score ?? "-";
  const ruleScore = decision.rule_score ?? "-";
  const confidence = decision.confidence ?? "-";
  const reviewedBy = factors.manualReview?.reviewedBy || "-";
  const reviewedAt = factors.manualReview?.reviewedAt
    ? formatDate(factors.manualReview.reviewedAt)
    : "-";

  const reasonsHtml = reasons.length
    ? `<ul class="explainability-list">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
    : "<p class='value'>No explicit reasons recorded.</p>";

  return `
    <div class="explainability-grid">
      <div class="explainability-item">
        <p class="label">Transaction</p>
        <p class="value"><code>${escapeHtml(tx.id)}</code></p>
      </div>
      <div class="explainability-item">
        <p class="label">Decision</p>
        <p class="value"><strong>${escapeHtml(String(decision.decision || tx.status || "PENDING"))}</strong></p>
      </div>
      <div class="explainability-item">
        <p class="label">Scores</p>
        <p class="value">Risk: ${escapeHtml(String(riskScore))} | ML: ${escapeHtml(String(mlScore))} | Rule: ${escapeHtml(String(ruleScore))}</p>
      </div>
      <div class="explainability-item">
        <p class="label">Confidence</p>
        <p class="value">${escapeHtml(String(confidence))}</p>
      </div>
      <div class="explainability-item">
        <p class="label">Manual Review Trigger Type</p>
        <p class="value">${escapeHtml(inferManualTriggerType(decision))}</p>
      </div>
      <div class="explainability-item">
        <p class="label">Rule Hit / Flags</p>
        <p class="value">rulesFlagged=${factors.rulesFlagged ? "true" : "false"}, fraudFlagged=${decision.fraud_flagged ? "true" : "false"}</p>
      </div>
      <div class="explainability-item span-2">
        <p class="label">Top Reasons</p>
        ${reasonsHtml}
      </div>
      <div class="explainability-item">
        <p class="label">Reviewed By</p>
        <p class="value">${escapeHtml(String(reviewedBy))}</p>
      </div>
      <div class="explainability-item">
        <p class="label">Reviewed At</p>
        <p class="value">${escapeHtml(String(reviewedAt))}</p>
      </div>
    </div>
  `;
}

async function ensureDecisionLoaded(transactionId) {
  if (!transactionId || transactionId in state.decisionByTransaction) {
    return;
  }

  try {
    const payload = await apiRequest(`/decisions/${encodeURIComponent(transactionId)}`);
    state.decisionByTransaction[transactionId] = payload?.data || null;
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("not found")) {
      state.decisionByTransaction[transactionId] = null;
      return;
    }
    throw error;
  }
}

async function prefetchDecisionDetails(transactions) {
  const candidates = transactions
    .filter((tx) => String(tx.status || "").toUpperCase() !== "PENDING")
    .slice(0, 10)
    .map((tx) => tx.id)
    .filter((txId) => !(txId in state.decisionByTransaction));

  if (!candidates.length) return;
  await Promise.all(candidates.map((txId) => ensureDecisionLoaded(txId).catch(() => null)));
}

async function renderExplainability(transactionId) {
  if (!explainabilityPanel) return;

  const tx = transactionById(transactionId);
  if (!tx) {
    explainabilityPanel.innerHTML = "<p class='muted'>Select a transaction row to load explainability details.</p>";
    return;
  }

  explainabilityPanel.innerHTML = "<p class='muted'>Loading explainability...</p>";

  try {
    await ensureDecisionLoaded(transactionId);
    const decision = state.decisionByTransaction[transactionId] || null;
    explainabilityPanel.innerHTML = buildExplainabilityHtml(tx, decision);
  } catch (error) {
    explainabilityPanel.innerHTML = `<p class="status-error">Failed to load explainability: ${escapeHtml(error.message)}</p>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTemplate(template, data) {
  return template.replace(/{{(\w+)}}/g, (_, key) => escapeHtml(data[key] ?? ""));
}

function declinedCustomerTemplate() {
  return `
  <!DOCTYPE html>
  <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transaction Declined</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f3efea; margin:0; padding:28px; color:#1f1f1f; }
    .card { max-width:640px; margin:auto; background:#fffdfb; border:1px solid #ddd2c6; }
    .header { background:#1a0a0a; color:#fff; padding:24px; border-bottom:3px solid #8b1a1a; }
    .body { padding:24px; }
    .row { display:flex; justify-content:space-between; border-bottom:1px solid #eee2d8; padding:8px 0; }
    .reason { background:#fff3f3; border-left:3px solid #8b1a1a; padding:14px; margin:16px 0; }
    .foot { background:#1a1a1a; color:#d7d7d7; padding:16px 24px; font-size:12px; }
  </style></head>
  <body><div class="card">
    <div class="header"><h2>Transaction Declined</h2></div>
    <div class="body">
      <p>We declined a recent transaction on your account due to security concerns.</p>
      <div class="row"><span>Transaction ID</span><strong>{{transactionId}}</strong></div>
      <div class="row"><span>Amount</span><strong>{{amount}} {{currency}}</strong></div>
      <div class="row"><span>Merchant</span><strong>{{merchantId}}</strong></div>
      <div class="row"><span>Date & Time</span><strong>{{timestamp}}</strong></div>
      <div class="reason"><strong>Reason for decline:</strong> {{decisionReason}}</div>
      <p>Contact: fraud-support@frauddetection.com | 1-800-FRAUD-HELP</p>
    </div>
    <div class="foot">Fraud Detection Platform | Automated security notification</div>
  </div></body></html>`;
}

function declinedFraudTemplate() {
  return `
  <!DOCTYPE html>
  <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fraud Alert - Transaction Declined</title>
  <style>
    body { font-family: Arial, sans-serif; background:#0f0f0f; margin:0; padding:28px; color:#ebe7e1; }
    .card { max-width:700px; margin:auto; background:#171717; border:1px solid #2d2d2d; }
    .header { background:#8b1a1a; color:#fff; padding:24px; }
    .status { background:#1d1111; padding:10px 24px; border-bottom:1px solid #2d2d2d; }
    .body { padding:24px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .cell { border:1px solid #2d2d2d; padding:10px; background:#1f1f1f; }
    .reason { margin-top:14px; border-left:3px solid #8b1a1a; background:#1a0c0c; padding:12px; color:#fac8c8; }
    .foot { background:#0a0a0a; color:#8d8681; padding:14px 24px; font-size:12px; }
  </style></head>
  <body><div class="card">
    <div class="header"><h2>Transaction Declined</h2><p>Internal - Fraud Team Only</p></div>
    <div class="status"><strong>Decision:</strong> DECLINED | <strong>Risk:</strong> 92/100 | <strong>ML:</strong> 89/100</div>
    <div class="body">
      <div class="grid">
        <div class="cell"><small>Transaction ID</small><div>{{transactionId}}</div></div>
        <div class="cell"><small>Customer</small><div>{{customerId}}</div></div>
        <div class="cell"><small>Amount</small><div>{{amount}} {{currency}}</div></div>
        <div class="cell"><small>Merchant</small><div>{{merchantId}}</div></div>
      </div>
      <div class="reason"><strong>Decision reason:</strong> {{decisionReason}}</div>
    </div>
    <div class="foot">Internal use only | Decision Engine v1.4.2</div>
  </div></body></html>`;
}

function flaggedFraudTemplate() {
  return `
  <!DOCTYPE html>
  <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manual Review Required</title>
  <style>
    body { font-family: Arial, sans-serif; background:#11100c; margin:0; padding:28px; color:#e8e4df; }
    .card { max-width:700px; margin:auto; background:#1b1912; border:1px solid #2d291f; }
    .header { background:#7a3a13; color:#fff; padding:24px; }
    .status { background:#1a1505; padding:10px 24px; border-bottom:1px solid #2d291f; }
    .body { padding:24px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .cell { border:1px solid #2d291f; padding:10px; background:#201d12; }
    .reason { margin-top:14px; border-left:3px solid #7a3a13; background:#1a1505; padding:12px; color:#f6df9a; }
    .foot { background:#0f0d06; color:#978f70; padding:14px 24px; font-size:12px; }
  </style></head>
  <body><div class="card">
    <div class="header"><h2>Transaction Flagged</h2><p>Internal - Manual Review Required</p></div>
    <div class="status"><strong>Decision:</strong> FLAGGED | <strong>Risk:</strong> 78/100</div>
    <div class="body">
      <div class="grid">
        <div class="cell"><small>Transaction ID</small><div>{{transactionId}}</div></div>
        <div class="cell"><small>Customer</small><div>{{customerId}}</div></div>
        <div class="cell"><small>Amount</small><div>{{amount}} {{currency}}</div></div>
        <div class="cell"><small>Merchant</small><div>{{merchantId}}</div></div>
      </div>
      <div class="reason"><strong>Flag reason:</strong> {{decisionReason}}</div>
    </div>
    <div class="foot">Internal use only | Decision Engine v1.4.2</div>
  </div></body></html>`;
}

function buildEmailItems(transactions, userId) {
  const emails = [];

  for (const tx of transactions) {
    const status = String(tx.status || "").toUpperCase();
    if (status !== "REJECTED" && status !== "FLAGGED") {
      continue;
    }

    const txData = {
      transactionId: tx.id,
      amount: Number(tx.amount || 0).toFixed(2),
      currency: tx.currency || "USD",
      merchantId: tx.merchantId || tx.merchant_id || "-",
      timestamp: formatDate(tx.createdAt || tx.created_at),
      decisionReason:
        state.decisionByTransaction[tx.id]?.decision_reason ||
        state.decisionByTransaction[tx.id]?.decisionReason ||
        (status === "REJECTED"
          ? "Rule and model signals exceeded decline threshold."
          : "Risk threshold exceeded and transaction requires manual review."),
      customerId: userId,
    };

    if (status === "REJECTED") {
      emails.push({
        id: `declined-customer-${tx.id}`,
        subject: `Transaction Declined - Reference ${tx.id.substring(0, 8).toUpperCase()}`,
        type: "declined-customer",
        at: tx.createdAt || tx.created_at,
        html: renderTemplate(declinedCustomerTemplate(), txData),
      });
      emails.push({
        id: `declined-fraud-${tx.id}`,
        subject: `DECLINED - ${userId} - ${txData.amount} ${txData.currency}`,
        type: "declined-fraud-team",
        at: tx.createdAt || tx.created_at,
        html: renderTemplate(declinedFraudTemplate(), txData),
      });
    }

    if (status === "FLAGGED") {
      emails.push({
        id: `flagged-fraud-${tx.id}`,
        subject: `REVIEW REQUIRED - ${userId} - ${txData.amount} ${txData.currency}`,
        type: "flagged-fraud-team",
        at: tx.createdAt || tx.created_at,
        html: renderTemplate(flaggedFraudTemplate(), txData),
      });
    }
  }

  emails.sort((a, b) => new Date(b.at) - new Date(a.at));
  return emails;
}

function renderEmailPreview(html) {
  mailPreview.srcdoc = html || "<p>No email preview available.</p>";
}

function renderEmails(transactions, userId) {
  const emails = buildEmailItems(transactions, userId);
  const searchTerm = (emailSearch.value || "").trim().toLowerCase();
  const filteredEmails = emails.filter((email) => {
    if (!searchTerm) return true;
    return `${email.subject} ${email.type}`.toLowerCase().includes(searchTerm);
  });

  if (!emails.length) {
    mailList.innerHTML = "<div class='mail-item'><p class='subject'>No flagged/declined emails yet</p><p class='meta'>Create suspicious transfers to trigger templates.</p></div>";
    renderEmailPreview("<html><body style='font-family:Arial;padding:20px'>No flagged or declined transactions yet.</body></html>");
    return;
  }

  if (!filteredEmails.length) {
    mailList.innerHTML = "<div class='mail-item'><p class='subject'>No emails match your search.</p><p class='meta'>Try a different keyword.</p></div>";
    renderEmailPreview("<html><body style='font-family:Arial;padding:20px'>No email matches the current search filter.</body></html>");
    return;
  }

  mailList.innerHTML = filteredEmails
    .map((email, idx) => `<div class="mail-item ${idx === 0 ? "active" : ""}" data-id="${email.id}">
      <p class="subject">${email.subject}</p>
      <p class="meta">${email.type} | ${formatDate(email.at)}</p>
    </div>`)
    .join("");

  renderEmailPreview(filteredEmails[0].html);

  mailList.querySelectorAll(".mail-item").forEach((item) => {
    item.addEventListener("click", () => {
      const selected = filteredEmails.find((e) => e.id === item.dataset.id);
      if (!selected) return;

      mailList.querySelectorAll(".mail-item").forEach((x) => x.classList.remove("active"));
      item.classList.add("active");
      renderEmailPreview(selected.html);
    });
  });
}

function showAuth() {
  dashboardView.classList.add("hidden");
  authView.classList.remove("hidden");
  if (state.poller) {
    clearInterval(state.poller);
    state.poller = null;
  }
}

function showDashboard() {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
}

async function loadProfile() {
  const payload = await apiRequest("/auth/profile");
  const user = normalizeUser(payload.data.user);
  state.user = user;

  welcomeText.textContent = `Welcome, ${user.firstName || user.email}`;
  apiStatus.textContent = `User: ${user.id} | Role: ${user.role} | API: ${getApiBase()}`;
  profileFirstName.value = user.firstName;
  profileLastName.value = user.lastName;
  profilePhone.value = user.phone;
  profileMeta.textContent = `Email: ${user.email} | Status: ${user.status}`;
}

function buildLocationFromInputs(preset, customCountry, customCity, customLat, customLng) {
  const presets = {
    trusted: { country: "US", city: "New York", lat: 40.7128, lng: -74.0060 },
    travel: { country: "BR", city: "Manaus", lat: -3.1190, lng: -60.0217 },
    highrisk: { country: "NG", city: "Lagos", lat: 6.5244, lng: 3.3792 },
  };

  const base = presets[preset] || presets.trusted;
  const country = (customCountry || "").trim().toUpperCase();
  const city = (customCity || "").trim();
  const lat = Number(customLat);
  const lng = Number(customLng);

  return {
    country: country || base.country,
    city: city || base.city,
    lat: Number.isFinite(lat) ? lat : base.lat,
    lng: Number.isFinite(lng) ? lng : base.lng,
  };
}

function buildTransactionPayload(amount, recipientId, scenario, currency, location) {
  const userId = state.user.id;
  const base = {
    customerId: userId,
    merchantId: `p2p:${recipientId}`,
    amount,
    currency: currency || "USD",
    deviceId: `demo-device-${userId.slice(0, 8)}`,
    location,
    metadata: {
      transferType: "P2P_DEMO",
      recipientCustomerId: recipientId,
      scenario,
      selectedCurrency: currency || "USD",
      locationCountry: location.country,
      locationCity: location.city,
    },
  };

  if (scenario === "normal") {
    return {
      ...base,
      amount,
      cardNumber: "4111111111111111",
      cardType: "visa",
    };
  }

  if (scenario === "suspicious") {
    return {
      ...base,
      amount,
      cardNumber: "5555555555554444",
      cardType: "mastercard",
      metadata: { ...base.metadata, velocityHint: true, geoMismatchHint: true },
    };
  }

  return {
    ...base,
    amount,
    cardNumber: "378282246310005",
    cardType: "amex",
    metadata: { ...base.metadata, impossibleTravelHint: true, highRiskHint: true },
  };
}

async function loadTransactions() {
  const userId = state.user.id;
  const payload = await apiRequest(`/transactions/customer/${encodeURIComponent(userId)}?limit=60`);
  const transactions = payload.data || [];
  state.transactions = transactions;
  await prefetchDecisionDetails(transactions);
  renderSummary(transactions);
  renderTransactions(transactions);
  renderEmails(transactions, userId);
}

async function refreshDashboardData() {
  try {
    await loadProfile();
    await loadTransactions();
  } catch (error) {
    setLineStatus(apiStatus, error.message, true);
  }
}

async function refreshTransactionsOnly() {
  try {
    await loadTransactions();
  } catch (error) {
    setLineStatus(apiStatus, error.message, true);
  }
}

async function handleLoginFlow(email, password) {
  const payload = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });

  const data = payload.data;
  setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  });

  showDashboard();
  await refreshDashboardData();
  if (!state.poller) {
    // Poll transaction updates only; avoid hammering /auth routes.
    state.poller = setInterval(refreshTransactionsOnly, 5000);
  }
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLineStatus(authStatus, "", false);
  saveApiBase();

  const fd = new FormData(registerForm);
  const firstName = String(fd.get("firstName") || "").trim();
  const lastName = String(fd.get("lastName") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");

  try {
    await apiRequest("/auth/register", {
      method: "POST",
      auth: false,
      body: { firstName, lastName, email, password, role: "user" },
    });

    setLineStatus(authStatus, "Registration successful. Logging in...");
    await handleLoginFlow(email, password);
    registerForm.reset();
  } catch (error) {
    setLineStatus(authStatus, error.message, true);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLineStatus(authStatus, "", false);
  saveApiBase();

  const fd = new FormData(loginForm);
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");

  try {
    await handleLoginFlow(email, password);
    setLineStatus(authStatus, "Login successful.");
    loginForm.reset();
  } catch (error) {
    setLineStatus(authStatus, error.message, true);
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLineStatus(profileStatus, "", false);
  const submitBtn = profileForm.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const payload = await apiRequest("/auth/profile", {
      method: "PATCH",
      body: {
        firstName: profileFirstName.value.trim(),
        lastName: profileLastName.value.trim(),
        phone: profilePhone.value.trim() || undefined,
      },
    });

    const user = normalizeUser(payload.data.user);
    state.user = user;
    welcomeText.textContent = `Welcome, ${user.firstName || user.email}`;
    profileMeta.textContent = `Email: ${user.email} | Status: ${user.status}`;
    setLineStatus(profileStatus, "Profile updated.");
  } catch (error) {
    setLineStatus(profileStatus, error.message, true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

transferForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLineStatus(transferStatus, "", false);

  if (!state.user?.id) {
    setLineStatus(transferStatus, "Login required.", true);
    return;
  }

  const selectedRecipient = document.getElementById("recipientSelect").value;
  const customRecipient = document.getElementById("customRecipient").value.trim();
  const recipient = customRecipient || selectedRecipient;
  const amount = Number(document.getElementById("transferAmount").value);
  const currency = document.getElementById("currencySelect").value;
  const scenario = document.getElementById("riskScenario").value;
  const locationPreset = document.getElementById("locationPreset").value;
  const customCountry = document.getElementById("customCountry").value;
  const customCity = document.getElementById("customCity").value;
  const customLat = document.getElementById("customLat").value;
  const customLng = document.getElementById("customLng").value;

  if (!recipient) {
    setLineStatus(transferStatus, "Recipient is required.", true);
    return;
  }

  if (recipient === state.user.id) {
    setLineStatus(transferStatus, "Recipient must be different from your own account.", true);
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    setLineStatus(transferStatus, "Enter a valid amount.", true);
    return;
  }

  const location = buildLocationFromInputs(
    locationPreset,
    customCountry,
    customCity,
    customLat,
    customLng
  );

  if (customCountry && customCountry.trim().length !== 2) {
    setLineStatus(transferStatus, "Custom country must be a 2-letter ISO code (e.g., US, SG, BR).", true);
    return;
  }

  try {
    const body = buildTransactionPayload(amount, recipient, scenario, currency, location);
    const response = await apiRequest("/transactions", {
      method: "POST",
      body,
    });

    const tx = response.data;
    setLineStatus(
      transferStatus,
      `Submitted ${currency} transaction ${tx.transactionId} from ${location.country}/${location.city} with initial status ${tx.status}. Awaiting fraud decision...`
    );

    transferForm.reset();
    await loadTransactions();
  } catch (error) {
    setLineStatus(transferStatus, error.message, true);
  }
});

refreshBtn.addEventListener("click", refreshDashboardData);

logoutBtn.addEventListener("click", async () => {
  try {
    if (state.session?.refreshToken) {
      await apiRequest("/auth/logout", {
        method: "POST",
        auth: false,
        body: { refreshToken: state.session.refreshToken },
      });
    }
  } catch {
    // Ignore logout API failures for demo UX.
  }

  clearSession();
  showAuth();
});

apiBaseInput.addEventListener("change", saveApiBase);
transactionSearch.addEventListener("input", () => renderTransactions(state.transactions));
emailSearch.addEventListener("input", () => renderEmails(state.transactions, state.user?.id || ""));

locationPresetSelect.addEventListener("change", () => {
  customLocationFields.classList.toggle("hidden", locationPresetSelect.value !== "custom");
});

async function bootstrap() {
  const savedApiBase = localStorage.getItem(API_BASE_KEY);
  if (savedApiBase) {
    apiBaseInput.value = savedApiBase;
  }

  const storedSession = loadJson(SESSION_KEY, null);
  customLocationFields.classList.toggle("hidden", locationPresetSelect.value !== "custom");
  if (!storedSession?.accessToken) {
    showAuth();
    return;
  }

  state.session = storedSession;

  try {
    showDashboard();
    await refreshDashboardData();
    state.poller = setInterval(refreshTransactionsOnly, 5000);
  } catch {
    clearSession();
    showAuth();
  }
}

bootstrap();
