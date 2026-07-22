const demoData = {
  baseDate: "2026. 7. 22",
  monthlyAmount: 0,
  monthlyQty: 0,
  monthChange: "-",
  topCategory: "-",
  categories: {
    safety: 0,
    clothes: 0,
    nameTag: 0,
    supplies: 0
  },
  recentHistory: []
};

function formatWon(value) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function renderDashboard(data) {
  document.getElementById("baseDate").textContent = data.baseDate;
  document.getElementById("monthlyAmount").textContent = formatWon(data.monthlyAmount);
  document.getElementById("monthlyQty").textContent = formatNumber(data.monthlyQty) + "개";
  document.getElementById("monthChange").textContent = data.monthChange;
  document.getElementById("topCategory").textContent = data.topCategory;

  document.getElementById("safetyQty").textContent = formatNumber(data.categories.safety) + "개";
  document.getElementById("clothesQty").textContent = formatNumber(data.categories.clothes) + "개";
  document.getElementById("nameTagQty").textContent = formatNumber(data.categories.nameTag) + "개";
  document.getElementById("suppliesQty").textContent = formatNumber(data.categories.supplies) + "개";

  renderHistoryTable(data.recentHistory);
}

function renderHistoryTable(rows) {
  const tbody = document.getElementById("historyTableBody");

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">아직 표시할 신청 이력이 없습니다.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.month}</td>
      <td>${row.category}</td>
      <td>${row.department}</td>
      <td>${row.name}</td>
      <td>${row.item}</td>
      <td>${formatNumber(row.qty)}</td>
      <td>${formatWon(row.amount)}</td>
    </tr>
  `).join("");
}

renderDashboard(demoData);
