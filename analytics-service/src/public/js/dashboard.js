const colors = {
  bg: '#282a36',
  currentLine: '#44475a',
  foreground: '#f8f8f2',
  comment: '#6272a4',
  cyan: '#8be9fd',
  green: '#50fa7b',
  orange: '#ffb86c',
  pink: '#ff79c6',
  purple: '#bd93f9',
  red: '#ff5555',
  yellow: '#f1fa8c',
};

let currentTimeRange = '24h';
let charts = {};
let ws = null;
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  loadDashboard();
  setInterval(() => loadDashboard(), 60000);
});
// Handles init web socket.
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    document.getElementById('ws-status').textContent = 'Connected';
    document.getElementById('ws-status').style.color = colors.green;
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    document.getElementById('ws-status').textContent = 'Error';
    document.getElementById('ws-status').style.color = colors.red;
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    document.getElementById('ws-status').textContent = 'Disconnected';
    document.getElementById('ws-status').style.color = colors.orange;
    setTimeout(initWebSocket, 5000);
  };
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}

// Handles handle web socket message.
function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'init':
      updateRealTimeStats(message.data.realTimeStats);
      break;
    case 'realtime_update':
      updateRealTimeStats(message.data);
      break;
    case 'pong':
      break;
    default:
      console.log('Unknown message type:', message.type);
  }
}

// Handles update real time stats.
function updateRealTimeStats(stats) {
  document.getElementById('rt-total').textContent = stats.totalDecisions || 0;
  document.getElementById('rt-approved').textContent = stats.approved || 0;
  document.getElementById('rt-declined').textContent = stats.declined || 0;
  document.getElementById('rt-flagged').textContent = stats.flagged || 0;
  document.getElementById('rt-avg-score').textContent = stats.avgRiskScore || 0;
}
// Handles load dashboard.
async function loadDashboard() {
  try {
    const response = await fetch(`/api/v1/analytics/dashboard?timeRange=${currentTimeRange}`);
    const data = await response.json();

    if (data.success) {
      updateOverviewStats(data.data.overview);
      updateAnalystImpact(data.data.analystImpact || {});
      updateAppealImpact(data.data.appealImpact || {});
      updateDecisionBreakdown(data.data.decisions);
      updateTimeSeriesChart(data.data.timeSeries);
      updateRiskScoreChart(data.data.riskScores);
      updateTopCustomers(data.data.topCustomers);
      updateTopMerchants(data.data.topMerchants);
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

// Handles update overview stats.
function updateOverviewStats(stats) {
  document.getElementById('total-transactions').textContent = stats.totalTransactions.toLocaleString();
  document.getElementById('approval-rate').textContent = stats.approvalRate + '%';
  document.getElementById('decline-rate').textContent = stats.declineRate + '%';
  document.getElementById('flag-rate').textContent = stats.flagRate + '%';
  
  document.getElementById('approved-count').textContent = `${stats.approved.toLocaleString()} approved`;
  document.getElementById('declined-count').textContent = `${stats.declined.toLocaleString()} declined`;
  document.getElementById('flagged-count').textContent = `${stats.flagged.toLocaleString()} flagged`;
}

// Handles update analyst impact stats.
function updateAnalystImpact(stats) {
  const total = stats.totalManualReviews || 0;
  const approvedAfterReview = stats.approvedAfterReview || 0;
  const declinedAfterReview = stats.declinedAfterReview || 0;
  const approvedRate = stats.approvedAfterReviewRate || 0;
  const declinedRate = stats.declinedAfterReviewRate || 0;
  const turnaroundMinutes = stats.avgReviewTurnaroundMinutes || 0;
  const turnaroundSeconds = stats.avgReviewTurnaroundSeconds || 0;

  document.getElementById('manual-reviews-total').textContent = total.toLocaleString();
  document.getElementById('review-approved-rate').textContent = `${approvedRate}%`;
  document.getElementById('review-declined-rate').textContent = `${declinedRate}%`;
  document.getElementById('review-turnaround-mins').textContent = `${turnaroundMinutes}m`;

  document.getElementById('review-approved-count').textContent = `${approvedAfterReview.toLocaleString()} approved`;
  document.getElementById('review-declined-count').textContent = `${declinedAfterReview.toLocaleString()} declined`;
  document.getElementById('review-turnaround-secs').textContent = `${turnaroundSeconds.toLocaleString()} seconds`;
}

// Handles update appeal impact stats.
function updateAppealImpact(stats) {
  const created = stats.appealsCreated || 0;
  const pending = stats.appealsPending || 0;
  const reversed = stats.reversedCount || 0;
  const upheld = stats.upheldCount || 0;
  const reverseRate = stats.reverseRate || 0;
  const upholdRate = stats.upholdRate || 0;

  document.getElementById('appeals-created').textContent = created.toLocaleString();
  document.getElementById('appeals-pending').textContent = pending.toLocaleString();
  document.getElementById('appeals-reversed-rate').textContent = `${reverseRate}%`;
  document.getElementById('appeals-upheld-rate').textContent = `${upholdRate}%`;
  document.getElementById('appeals-reversed-count').textContent = `${reversed.toLocaleString()} reversed`;
  document.getElementById('appeals-upheld-count').textContent = `${upheld.toLocaleString()} upheld`;
}

// Handles update decision breakdown.
function updateDecisionBreakdown(decisions) {
  const approved = decisions.find(d => d.decision === 'APPROVED');
  const declined = decisions.find(d => d.decision === 'DECLINED');
  const flagged = decisions.find(d => d.decision === 'FLAGGED');
  if (charts.decisionPie) {
    charts.decisionPie.destroy();
  }

  const ctx = document.getElementById('decisionPieChart').getContext('2d');
  charts.decisionPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Approved', 'Declined', 'Flagged'],
      datasets: [{
        data: [
          approved?.count || 0,
          declined?.count || 0,
          flagged?.count || 0,
        ],
        backgroundColor: [colors.green, colors.red, colors.orange],
        borderColor: colors.bg,
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: colors.foreground, font: { size: 14 } },
        },
      },
    },
  });
}

// Handles update time series chart.
function updateTimeSeriesChart(timeSeries) {
  if (charts.timeSeries) {
    charts.timeSeries.destroy();
  }

  const labels = timeSeries.map(ts => new Date(ts.timestamp).toLocaleString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  }));

  const ctx = document.getElementById('timeSeriesChart').getContext('2d');
  charts.timeSeries = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Approved',
          data: timeSeries.map(ts => ts.approved || 0),
          borderColor: colors.green,
          backgroundColor: colors.green + '30',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Declined',
          data: timeSeries.map(ts => ts.declined || 0),
          borderColor: colors.red,
          backgroundColor: colors.red + '30',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Flagged',
          data: timeSeries.map(ts => ts.flagged || 0),
          borderColor: colors.orange,
          backgroundColor: colors.orange + '30',
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: colors.foreground, font: { size: 12 } },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.comment },
          grid: { color: colors.currentLine },
        },
        y: {
          ticks: { color: colors.comment },
          grid: { color: colors.currentLine },
        },
      },
    },
  });
}

// Handles update risk score chart.
function updateRiskScoreChart(riskScores) {
  if (charts.riskScore) {
    charts.riskScore.destroy();
  }

  const labels = riskScores.map(rs => rs.range);
  const approved = riskScores.map(rs => rs.approved || 0);
  const declined = riskScores.map(rs => rs.declined || 0);
  const flagged = riskScores.map(rs => rs.flagged || 0);

  const ctx = document.getElementById('riskScoreChart').getContext('2d');
  charts.riskScore = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Approved',
          data: approved,
          backgroundColor: colors.green,
        },
        {
          label: 'Declined',
          data: declined,
          backgroundColor: colors.red,
        },
        {
          label: 'Flagged',
          data: flagged,
          backgroundColor: colors.orange,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: colors.foreground, font: { size: 12 } },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: colors.comment },
          grid: { color: colors.currentLine },
        },
        y: {
          stacked: true,
          ticks: { color: colors.comment },
          grid: { color: colors.currentLine },
        },
      },
    },
  });
  if (charts.performance) {
    charts.performance.destroy();
  }

  const perfCtx = document.getElementById('performanceChart').getContext('2d');
  charts.performance = new Chart(perfCtx, {
    type: 'line',
    data: {
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
      datasets: [{
        label: 'Avg Processing Time (ms)',
        data: [45, 52, 48, 55, 49, 47],
        borderColor: colors.cyan,
        backgroundColor: colors.cyan + '30',
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: colors.foreground, font: { size: 12 } },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.comment },
          grid: { color: colors.currentLine },
        },
        y: {
          ticks: { color: colors.comment },
          grid: { color: colors.currentLine },
        },
      },
    },
  });
}

// Handles update top customers.
function updateTopCustomers(customers) {
  const tbody = document.getElementById('top-customers-body');
  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No data available</td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td>${c.customerId}</td>
      <td>${c.transactionCount}</td>
      <td><span style="color: ${colors.red}">${c.declinedCount}</span></td>
      <td><span style="color: ${colors.orange}">${c.flaggedCount}</span></td>
      <td>${c.avgRiskScore}</td>
    </tr>
  `).join('');
}

// Handles update top merchants.
function updateTopMerchants(merchants) {
  const tbody = document.getElementById('top-merchants-body');
  if (merchants.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available</td></tr>';
    return;
  }

  tbody.innerHTML = merchants.map(m => `
    <tr>
      <td>${m.merchantId}</td>
      <td>${m.transactionCount}</td>
      <td><span style="color: ${colors.red}">${m.declinedCount}</span></td>
      <td>${m.avgRiskScore}</td>
    </tr>
  `).join('');
}
// Handles set time range.
function setTimeRange(range) {
  currentTimeRange = range;
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  loadDashboard();
}
