const reviewRows = document.getElementById('reviewRows');
const refreshBtn = document.getElementById('refreshBtn');
const reviewerInput = document.getElementById('reviewerInput');
const filterInput = document.getElementById('filterInput');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const autoRefreshInput = document.getElementById('autoRefreshInput');
const rowTemplate = document.getElementById('rowTemplate');
const statusFilterGroup = document.getElementById('statusFilterGroup');
const statusFilterButtons = statusFilterGroup ? [...statusFilterGroup.querySelectorAll('[data-queue-filter]')] : [];

const pendingCount = document.getElementById('pendingCount');
const visibleCount = document.getElementById('visibleCount');
const dataAvailability = document.getElementById('dataAvailability');
const dataHint = document.getElementById('dataHint');
const activeReviewer = document.getElementById('activeReviewer');

const API_BASE = '/api/v1/reviews';
const REFRESH_INTERVAL_MS = 15000;

let latestReviews = [];
let poller = null;
let activeQueueFilter = 'ALL';


const setStatus = (message, isError = false) => {
  if (isError) {
    console.error(message);
  }
};

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

const updateFilterUI = () => {
  const hasFilter = Boolean(filterInput.value.trim());
  clearFilterBtn.disabled = !hasFilter;
};

const updateQueueFilterUI = () => {
  statusFilterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.queueFilter === activeQueueFilter);
  });
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
    row.innerHTML = `
      <td colspan="9" class="empty-state-cell">
        <div class="status-line">Loaded ${latestReviews.length} pending item(s).</div>
        <div class="empty-line">No pending manual review items yet.</div>
      </td>
    `;
    reviewRows.appendChild(row);
    updateDataStats(latestReviews.length, 0);
    return;
  }

  reviews.forEach((review) => reviewRows.appendChild(buildRow(review)));
  updateDataStats(latestReviews.length, reviews.length);
};

const applyFilters = () => {
  const keyword = filterInput.value.trim().toLowerCase();
  updateFilterUI();
  updateQueueFilterUI();

  const filtered = latestReviews.filter((row) => {
    const mapped = mapRow(row);
    const matchesKeyword = !keyword || mapped.searchable.includes(keyword);
    const matchesStatus = activeQueueFilter === 'ALL' || mapped.queueStatus === activeQueueFilter;
    return matchesKeyword && matchesStatus;
  });

  renderRows(filtered);
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
  applyFilters();
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
  try {
    await loadPendingReviews();
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

reviewerInput.addEventListener('input', () => {
  activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
});

activeReviewer.textContent = reviewerInput.value.trim() || 'Not set';
updateFilterUI();
updateQueueFilterUI();
loadPendingReviews()
  .then(startPolling)
  .catch((error) => {
    setStatus(error.message, true);
  });
