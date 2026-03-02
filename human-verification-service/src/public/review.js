const tableBody = document.getElementById("reviewTable");
const statusText = document.getElementById("status");

async function loadReviews() {
  try {
    statusText.textContent = "Loading...";
    const res = await fetch("/api/v1/reviews");
    const json = await res.json();

    if (!json.success) {
      throw new Error("API returned failure");
    }

    const reviews = json.data.pendingReviews;

    tableBody.innerHTML = "";

    if (!reviews || reviews.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">No pending reviews</td>
        </tr>
      `;
      statusText.textContent = "";
      return;
    }

    reviews.forEach(tx => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${tx.id}</td>
        <td>${tx.userId ?? "-"}</td>
        <td>$${tx.amount ?? "-"}</td>
        <td>${tx.score ?? "-"}</td>
        <td>${tx.reason ?? "-"}</td>
        <td class="status-pending">pending</td>
        <td>
          <button class="approve" onclick="approve('${tx.id}')">Approve</button>
          <button class="reject" onclick="reject('${tx.id}')">Reject</button>
        </td>
      `;

      tableBody.appendChild(row);
    });

    statusText.textContent = "";
  } catch (err) {
    console.error(err);
    statusText.textContent = "Error loading reviews";
  }
}

async function approve(id) {
  if (!confirm("Approve this transaction?")) return;

  try {
    const res = await fetch(`/api/v1/reviews/${id}/approve`, {
      method: "POST"
    });

    const json = await res.json();
    if (!json.success) throw new Error();

    loadReviews();
  } catch (err) {
    alert("Failed to approve transaction");
  }
}

async function reject(id) {
  if (!confirm("Reject this transaction?")) return;

  try {
    const res = await fetch(`/api/v1/reviews/${id}/reject`, {
      method: "POST"
    });

    const json = await res.json();
    if (!json.success) throw new Error();

    loadReviews();
  } catch (err) {
    alert("Failed to reject transaction");
  }
}

window.onload = loadReviews;