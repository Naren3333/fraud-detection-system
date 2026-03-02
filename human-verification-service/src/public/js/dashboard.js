const reviewRows = document.getElementById('reviewRows');
const refreshBtn = document.getElementById('refreshBtn');
const statusMessage = document.getElementById('statusMessage');
const reviewerInput = document.getElementById('reviewerInput');
const filterInput = document.getElementById('filterInput');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const autoRefreshInput = document.getElementById('autoRefreshInput');
const rowTemplate = document.getElementById('rowTemplate');

const pendingCount = document.getElementById('pendingCount');
const visibleCount = document.getElementById('visibleCount');
const dataAvailability = document.getElementById('dataAvailability');
const dataHint = document.getElementById('dataHint');
const activeReviewer = document.getElementById('activeReviewer');

const API_BASE = '/api/v1/reviews';
const REFRESH_INTERVAL_MS = 15000;

let latestReviews = [];
let poller = null;

const updateDataStats = (totalCount, visibleRows) => {
  pendingCount.textContent = totalCount;
  visibleCount.textContent = visibleRows;

  if (totalCount > 0) {
    dataAvailability.textContent = 'YES';
    dataHint.textContent = `${totalCount} item(s) ready for review`;
  } else {
    dataAvailability.textContent = 'NO';
    dataHint.textContent = 'Waiting for pending items';
  }
};

const setStatus = (message, isError = false) => {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#ff5555' : '#8be9fd';
};


const updateFilterUI = () => {
  const hasFilter = Boolean(filterInput.value.trim());
  clearFilterBtn.disabled = !hasFilter;
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
  searchable: [row.transactionId, row.customerId, row.merchantId, row.decisionReason].filter(Boolean).join(' ').toLowerCase(),
});

const disableRowButtons = (row, disabled) => {
  row.querySelectorAll('[data-decision]').forEach((button) => {
    button.disabled = disabled;
  });
};

const submitDecision = async ({ transactionId, decision, notes }) => {
  const reviewedBy = reviewerInput.value.trim();
  if (!reviewedBy) {
    setStatus('Please enter reviewer name before submitting decisions.', true);
    return;
  }

  setStatus(`Submitting ${decision} for ${transactionId}...`);
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

  setStatus(`Decision ${decision} submitted for ${transactionId}.`);
  await loadPendingReviews();
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
  row.querySelector('[data-col="queueStatus"]').textContent = mapped.queueStatus;

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

const renderRows = (reviews) => {
  reviewRows.innerHTML = '';

  if (!reviews.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="9">No pending manual review items yet.</td>';
    reviewRows.appendChild(row);
    updateDataStats(latestReviews.length, 0);
    return;
  }

  reviews.forEach((review) => reviewRows.appendChild(buildRow(review)));
  updateDataStats(latestReviews.length, reviews.length);
};

const filterRows = () => {
  const keyword = filterInput.value.trim().toLowerCase();
  updateFilterUI();

  if (!keyword) {
    renderRows(latestReviews);
    if (latestReviews.length) {
      setStatus(`Loaded ${latestReviews.length} pending item(s).`);
    }
    return;
  }

  const filtered = latestReviews.filter((row) => mapRow(row).searchable.includes(keyword));
  renderRows(filtered);
  setStatus(`Filter active: showing ${filtered.length} of ${latestReviews.length} pending item(s).`);
};

reviewerInput.addEventListener('input', () => {
  activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
});

const loadPendingReviews = async () => {
  const response = await fetch(`${API_BASE}/pending?limit=50&offset=0`);

  if (!response.ok) {
    throw new Error(`Unable to load reviews (status ${response.status})`);
  }

  const payload = await response.json();
  latestReviews = payload?.data || [];
  filterRows();
  setStatus(`Loaded ${latestReviews.length} pending item(s).`);
};

const startPolling = () => {
  if (poller) clearInterval(poller);
  if (!autoRefreshInput.checked) return;

  poller = setInterval(async () => {
    try {
      await loadPendingReviews();
    } catch (error) {
      setStatus(error.message, true);
    }
  }, REFRESH_INTERVAL_MS);
};

refreshBtn.addEventListener('click', async () => {
  activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
  setStatus('Loading pending manual reviews...');
  try {
    await loadPendingReviews();
  } catch (error) {
    setStatus(error.message, true);
  }
});

filterInput.addEventListener('input', filterRows);
clearFilterBtn.addEventListener('click', () => {
  filterInput.value = '';
  filterRows();
  filterInput.focus();
});
autoRefreshInput.addEventListener('change', startPolling);

activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
updateFilterUI();
setStatus('Loading pending manual reviews...');
loadPendingReviews()
  .then(startPolling)
  .catch((error) => {
    setStatus(error.message, true);
  });
