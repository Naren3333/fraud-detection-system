const reviewRows = document.getElementById('reviewRows');
const appealRows = document.getElementById('appealRows');
const refreshBtn = document.getElementById('refreshBtn');
const reviewerInput = document.getElementById('reviewerInput');
const filterInput = document.getElementById('filterInput');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const autoRefreshInput = document.getElementById('autoRefreshInput');
const rowTemplate = document.getElementById('rowTemplate');
const appealRowTemplate = document.getElementById('appealRowTemplate');
const statusFilterGroup = document.getElementById('statusFilterGroup');
const statusFilterButtons = statusFilterGroup ? [...statusFilterGroup.querySelectorAll('[data-queue-filter]')] : [];
const appealStatusFilterGroup = document.getElementById('appealStatusFilterGroup');
const appealStatusFilterButtons = appealStatusFilterGroup ? [...appealStatusFilterGroup.querySelectorAll('[data-appeal-filter]')] : [];

const pendingReviewCount = document.getElementById('pendingReviewCount');
const pendingAppealCount = document.getElementById('pendingAppealCount');
const visibleCount = document.getElementById('visibleCount');
const dataAvailability = document.getElementById('dataAvailability');
const dataHint = document.getElementById('dataHint');
const activeReviewer = document.getElementById('activeReviewer');

const API_BASE = '/api/v1/reviews';
const REFRESH_INTERVAL_MS = 15000;

let latestReviews = [];
let latestAppeals = [];
let poller = null;
let activeQueueFilter = 'ALL';
let activeAppealFilter = 'ALL';

const setStatus = (message, isError = false) => {
  if (isError) {
    console.error(message);
  }
};

const updateDataStats = (reviewCount, appealCount, visibleReviewRows) => {
  pendingReviewCount.textContent = reviewCount;
  pendingAppealCount.textContent = appealCount;
  visibleCount.textContent = visibleReviewRows;

  if (reviewCount > 0 || appealCount > 0) {
    dataAvailability.textContent = 'YES';
    dataHint.textContent = `${reviewCount} review(s), ${appealCount} appeal(s) ready`;
  } else {
    dataAvailability.textContent = 'NO';
    dataHint.textContent = 'Waiting for pending items';
  }
};

const updateFilterUI = () => {
  const hasFilter = Boolean(filterInput.value.trim());
  clearFilterBtn.disabled = !hasFilter;
};

const updateQueueFilterUI = () => {
  statusFilterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.queueFilter === activeQueueFilter);
  });
};

const updateAppealFilterUI = () => {
  appealStatusFilterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.appealFilter === activeAppealFilter);
  });
};

const normalizeStatus = (status) => String(status || '').trim().toUpperCase().replace(/\s+/g, '_');

const toTitleCase = (status) => normalizeStatus(status).split('_')
  .filter(Boolean)
  .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
  .join(' ');

const renderStatusPill = (status) => {
  const normalized = normalizeStatus(status) || 'UNKNOWN';
  const css = normalized.toLowerCase().replace(/_/g, '-');
  return `<span class="status-pill status-${css}">${toTitleCase(normalized)}</span>`;
};

const parseAmount = (row) => {
  const payload = row.payload || {};
  const amount = payload.amount ?? payload.originalTransaction?.amount ?? null;
  const currency = payload.currency || payload.originalTransaction?.currency || 'USD';

  if (amount === null || Number.isNaN(Number(amount))) {
    return '-';
  }

  return `${currency} ${Number(amount).toFixed(2)}`;
};

const mapRow = (row) => ({
  transactionId: row.transactionId,
  customerId: row.customerId || '-',
  merchantId: row.merchantId || '-',
  amount: parseAmount(row),
  riskScore: row.riskScore ?? '-',
  reason: row.decisionReason || '-',
  queueStatus: row.queueStatus || 'PENDING',
  searchable: [row.transactionId, row.customerId, row.merchantId, row.decisionReason, row.queueStatus]
    .filter(Boolean)
    .join(' ')
    .toLowerCase(),
});

const mapAppealRow = (row) => ({
  appealId: row.appealId,
  transactionId: row.transactionId || '-',
  customerId: row.customerId || '-',
  sourceTransactionStatus: row.sourceTransactionStatus || '-',
  appealReason: row.appealReason || '-',
  currentStatus: row.currentStatus || 'OPEN',
  searchable: [
    row.appealId,
    row.transactionId,
    row.customerId,
    row.sourceTransactionStatus,
    row.appealReason,
    row.currentStatus,
  ].filter(Boolean).join(' ').toLowerCase(),
});

const disableRowButtons = (row, disabled) => {
  row.querySelectorAll('[data-decision]').forEach((button) => {
    button.disabled = disabled;
  });
};

const disableAppealButtons = (row, disabled) => {
  row.querySelectorAll('[data-resolution]').forEach((button) => {
    button.disabled = disabled;
  });
};

const submitDecision = async ({ transactionId, decision, notes }) => {
  const reviewedBy = reviewerInput.value.trim();
  if (!reviewedBy) {
    setStatus('Please enter reviewer name before submitting decisions.', true);
    return;
  }

  const response = await fetch(`${API_BASE}/${encodeURIComponent(transactionId)}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision,
      reviewedBy,
      notes: notes || `Set from dashboard at ${new Date().toISOString()}`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(payload.error || `Failed with status ${response.status}`);
  }

  await refreshAllQueues();
};

const submitAppealResolution = async ({ appealId, resolution, notes }) => {
  const reviewedBy = reviewerInput.value.trim();
  if (!reviewedBy) {
    setStatus('Please enter reviewer name before resolving appeals.', true);
    return;
  }

  const response = await fetch(`${API_BASE}/appeals/${encodeURIComponent(appealId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resolution,
      reviewedBy,
      notes: notes || `Appeal resolved from dashboard at ${new Date().toISOString()}`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(payload.error || `Failed with status ${response.status}`);
  }

  await refreshAllQueues();
};

const buildRow = (review) => {
  const mapped = mapRow(review);
  const fragment = rowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('tr');

  row.querySelector('[data-col="transactionId"]').textContent = mapped.transactionId;
  row.querySelector('[data-col="customerId"]').textContent = mapped.customerId;
  row.querySelector('[data-col="merchantId"]').textContent = mapped.merchantId;
  row.querySelector('[data-col="amount"]').textContent = mapped.amount;
  row.querySelector('[data-col="riskScore"]').textContent = mapped.riskScore;
  row.querySelector('[data-col="reason"]').textContent = mapped.reason;
  row.querySelector('[data-col="queueStatus"]').innerHTML = renderStatusPill(mapped.queueStatus);

  const notesInput = row.querySelector('[data-input="notes"]');

  row.querySelectorAll('[data-decision]').forEach((button) => {
    button.addEventListener('click', async () => {
      disableRowButtons(row, true);
      try {
        await submitDecision({
          transactionId: mapped.transactionId,
          decision: button.dataset.decision,
          notes: notesInput.value.trim(),
        });
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        disableRowButtons(row, false);
      }
    });
  });

  return fragment;
};

const buildAppealRow = (appeal) => {
  const mapped = mapAppealRow(appeal);
  const fragment = appealRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('tr');

  row.querySelector('[data-col="appealId"]').textContent = mapped.appealId;
  row.querySelector('[data-col="transactionId"]').textContent = mapped.transactionId;
  row.querySelector('[data-col="customerId"]').textContent = mapped.customerId;
  row.querySelector('[data-col="sourceTransactionStatus"]').innerHTML = renderStatusPill(mapped.sourceTransactionStatus);
  row.querySelector('[data-col="appealReason"]').textContent = mapped.appealReason;
  row.querySelector('[data-col="currentStatus"]').innerHTML = renderStatusPill(mapped.currentStatus);

  const notesInput = row.querySelector('[data-input="notes"]');

  row.querySelectorAll('[data-resolution]').forEach((button) => {
    button.addEventListener('click', async () => {
      disableAppealButtons(row, true);
      try {
        await submitAppealResolution({
          appealId: mapped.appealId,
          resolution: button.dataset.resolution,
          notes: notesInput.value.trim(),
        });
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        disableAppealButtons(row, false);
      }
    });
  });

  return fragment;
};

const renderRows = (reviews) => {
  reviewRows.innerHTML = '';

  if (!reviews.length) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="9" class="empty-state-cell">
        <div class="status-line">Loaded ${latestReviews.length} pending item(s).</div>
        <div class="empty-line">No pending manual review items yet.</div>
      </td>
    `;
    reviewRows.appendChild(row);
    updateDataStats(latestReviews.length, latestAppeals.length, 0);
    return;
  }

  reviews.forEach((review) => reviewRows.appendChild(buildRow(review)));
  updateDataStats(latestReviews.length, latestAppeals.length, reviews.length);
};

const renderAppealRows = (appeals) => {
  appealRows.innerHTML = '';

  if (!appeals.length) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="8" class="empty-state-cell">
        <div class="status-line">Loaded ${latestAppeals.length} pending appeal(s).</div>
        <div class="empty-line">No pending appeals right now.</div>
      </td>
    `;
    appealRows.appendChild(row);
    return;
  }

  appeals.forEach((appeal) => appealRows.appendChild(buildAppealRow(appeal)));
};

const applyFilters = () => {
  const keyword = filterInput.value.trim().toLowerCase();
  updateFilterUI();
  updateQueueFilterUI();
  updateAppealFilterUI();

  const filteredReviews = latestReviews.filter((row) => {
    const mapped = mapRow(row);
    const matchesKeyword = !keyword || mapped.searchable.includes(keyword);
    const matchesStatus = activeQueueFilter === 'ALL' || mapped.queueStatus === activeQueueFilter;
    return matchesKeyword && matchesStatus;
  });

  const filteredAppeals = latestAppeals.filter((row) => {
    const mapped = mapAppealRow(row);
    const matchesKeyword = !keyword || mapped.searchable.includes(keyword);
    const matchesStatus = activeAppealFilter === 'ALL' || normalizeStatus(mapped.currentStatus) === activeAppealFilter;
    return matchesKeyword && matchesStatus;
  });

  renderRows(filteredReviews);
  renderAppealRows(filteredAppeals);
};

const loadPendingReviews = async () => {
  const response = await fetch(`${API_BASE}/pending?limit=50&offset=0`);

  if (!response.ok) {
    throw new Error(`Unable to load reviews (status ${response.status})`);
  }

  const payload = await response.json();
  latestReviews = payload?.data || [];
};

const loadPendingAppeals = async () => {
  const response = await fetch(`${API_BASE}/appeals/pending?limit=50&offset=0`);

  if (!response.ok) {
    throw new Error(`Unable to load appeals (status ${response.status})`);
  }

  const payload = await response.json();
  latestAppeals = payload?.data || [];
};

const refreshAllQueues = async () => {
  await Promise.all([loadPendingReviews(), loadPendingAppeals()]);
  applyFilters();
};

const startPolling = () => {
  if (poller) clearInterval(poller);
  if (!autoRefreshInput.checked) return;

  poller = setInterval(async () => {
    try {
      await refreshAllQueues();
    } catch (error) {
      setStatus(error.message, true);
    }
  }, REFRESH_INTERVAL_MS);
};

refreshBtn.addEventListener('click', async () => {
  activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
  try {
    await refreshAllQueues();
  } catch (error) {
    setStatus(error.message, true);
  }
});

filterInput.addEventListener('input', applyFilters);
clearFilterBtn.addEventListener('click', () => {
  filterInput.value = '';
  applyFilters();
  filterInput.focus();
});
autoRefreshInput.addEventListener('change', startPolling);

statusFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeQueueFilter = button.dataset.queueFilter || 'ALL';
    applyFilters();
  });
});

appealStatusFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeAppealFilter = button.dataset.appealFilter || 'ALL';
    applyFilters();
  });
});

reviewerInput.addEventListener('input', () => {
  activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
});

activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
updateFilterUI();
updateQueueFilterUI();
updateAppealFilterUI();
refreshAllQueues()
  .then(startPolling)
  .catch((error) => {
    setStatus(error.message, true);
  });
