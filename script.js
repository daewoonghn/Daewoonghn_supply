const PUBLISHED_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFbe939fEC-BfJnBqWJFhAKJkEFmH8ANwF7LIos16BSajm6EZkz1_dPnO4vMC2GUl3IY5r9PcAdY1t/pubhtml";

const ANNUAL_BUDGET = 55620000;

const SHEETS = {
  safety: { name: "★ 안전화&방진화 신청", gid: "0" },
  clothes: { name: "★ 작업복 신청", gid: "1280118521" },
  nameTag: { name: "명찰 신청", gid: "1695498421" },
  order: { name: "발주", gid: "1007978871" },
  itemMaster: { name: "Ref. 품목마스터", gid: "621949629" },
  history: { name: "신청 이력", gid: "741585765" }
};

function formatWon(value) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatPercent(value) {
  return Number(value || 0).toFixed(1) + "%";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPublishedId() {
  const match = PUBLISHED_SHEET_URL.match(/\/d\/e\/([^/]+)/);
  if (!match) throw new Error("구글시트 게시 링크 형식이 올바르지 않습니다.");
  return match[1];
}

function getCsvUrl(gid) {
  return (
    "https://docs.google.com/spreadsheets/d/e/" +
    getPublishedId() +
    "/pub?gid=" +
    encodeURIComponent(gid) +
    "&single=true&output=csv&t=" +
    Date.now()
  );
}

async function loadCsvSheet(sheetInfo) {
  const response = await fetch(getCsvUrl(sheetInfo.gid), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(sheetInfo.name + " CSV 요청 실패: " + response.status);
  }

  const text = await response.text();

  if (!text || text.trim() === "") return [];

  if (text.includes("<html") || text.includes("<!DOCTYPE")) {
    throw new Error(sheetInfo.name + " CSV가 아니라 HTML이 반환되었습니다.");
  }

  return parseCsv(text);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows;
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;

  const number = Number(cleaned);
  return isNaN(number) ? 0 : number;
}

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  const match = text.match(/(\d{4})[.\-\/년\s]*(\d{1,2})[.\-\/월\s]*(\d{1,2})?/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] || 1);

  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) return null;

  return date;
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return year + "-" + month;
}

function getMonthLabel(date) {
  return date.getFullYear() + "." + String(date.getMonth() + 1).padStart(2, "0");
}

function buildItemMaster(rows) {
  const byItem = {};

  rows.forEach(row => {
    const category = cleanText(row[0]);
    const item = cleanText(row[1]);
    const itemCode = cleanText(row[2]);
    const unitPrice = toNumber(row[3]);

    const normalizedCategory = normalize(category);
    const normalizedItem = normalize(item);

    if (!item) return;
    if (normalizedCategory === "구분") return;

    if (
      normalizedItem === "품목명" ||
      normalizedItem === "소모품" ||
      normalizedItem === "소모품명" ||
      normalizedItem === "품목"
    ) {
      return;
    }

    byItem[normalizedItem] = {
      category,
      item,
      itemCode,
      unitPrice
    };
  });

  return byItem;
}

function getMasterData(master, item) {
  return master[normalize(item)] || {
    category: "",
    item,
    itemCode: "",
    unitPrice: 0
  };
}

function readApplicationRows(rows, config, master) {
  return rows.map((row, index) => {
    const sheetRowNumber = index + 1;
    if (sheetRowNumber < 3) return null;

    const department = cleanText(row[config.deptCol - 1]);
    const name = cleanText(row[config.nameCol - 1]);
    const rawItem = cleanText(row[config.itemCol - 1]);
    const qty = toNumber(row[config.qtyCol - 1]);

    const item = config.fixedItem || rawItem;

    if (!item || qty <= 0) return null;

    const masterData = getMasterData(master, item);
    const unitPrice = toNumber(masterData.unitPrice);
    const amount = qty * unitPrice;

    const displayCategory = config.forceCategory
      ? config.category
      : masterData.category || config.category;

    return {
      category: displayCategory,
      department: department || "-",
      name: name || "-",
      item,
      itemCode: masterData.itemCode || "",
      qty,
      unitPrice,
      amount
    };
  }).filter(Boolean);
}
  return rows.map((row, index) => {
    const sheetRowNumber = index + 1;
    if (sheetRowNumber < 3) return null;

    const department = cleanText(row[config.deptCol - 1]);
    const name = cleanText(row[config.nameCol - 1]);
    const item = cleanText(row[config.itemCol - 1]);
    const qty = toNumber(row[config.qtyCol - 1]);

    if (!item || qty <= 0) return null;

    const masterData = getMasterData(master, item);
    const unitPrice = toNumber(masterData.unitPrice);
    const amount = qty * unitPrice;

    return {
      category: masterData.category || config.category,
      department: department || "-",
      name: name || "-",
      item,
      itemCode: masterData.itemCode || "",
      qty,
      unitPrice,
      amount
    };
  }).filter(Boolean);
}

function readManualSuppliesRows(rows, master) {
  return rows.map((row, index) => {
    const sheetRowNumber = index + 1;

    if (sheetRowNumber < 28 || sheetRowNumber > 29) return null;

    const item = cleanText(row[0]);
    const qty = toNumber(row[2]);

    if (!item || qty <= 0) return null;

    const masterData = getMasterData(master, item);
    const unitPrice = toNumber(masterData.unitPrice);
    const amount = qty * unitPrice;

    return {
      category: masterData.category || "소모품",
      department: "공통",
      name: "수동입력",
      item,
      itemCode: masterData.itemCode || "",
      qty,
      unitPrice,
      amount
    };
  }).filter(Boolean);
}

function readHistoryRows(rows, master) {
  return rows.map((row, index) => {
    const sheetRowNumber = index + 1;
    if (sheetRowNumber < 3) return null;

    const category = cleanText(row[0]);
    const department = cleanText(row[1]);
    const name = cleanText(row[2]);
    const item = cleanText(row[3]);
    const qty = toNumber(row[4]);
    const orderDate = parseDate(row[5]);

    if (!item || qty <= 0 || !orderDate) return null;

    const masterData = getMasterData(master, item);
    const unitPrice = toNumber(masterData.unitPrice);
    const amount = qty * unitPrice;

    return {
      monthKey: getMonthKey(orderDate),
      monthLabel: getMonthLabel(orderDate),
      category: masterData.category || category || "-",
      department: department || "-",
      name: name || "-",
      item,
      qty,
      unitPrice,
      amount,
      date: orderDate,
      source: "신청 이력"
    };
  }).filter(Boolean);
}

function getCategoryKey(category) {
  const text = String(category || "");

  if (text.includes("안전화") || text.includes("방진화")) return "safety";
  if (text.includes("작업복")) return "clothes";
  if (text.includes("명찰")) return "nameTag";

  return "supplies";
}

function summarizeByCategory(rows) {
  const map = {};

  rows.forEach(row => {
    const key = row.category || "-";

    if (!map[key]) {
      map[key] = {
        name: key,
        qty: 0,
        amount: 0
      };
    }

    map[key].qty += row.qty;
    map[key].amount += row.amount;
  });

  return Object.values(map).sort((a, b) => b.amount - a.amount);
}

function summarizeMonthly(rows) {
  const map = {};

  rows.forEach(row => {
    const key = row.monthKey;
    if (!key) return;

    if (!map[key]) {
      map[key] = {
        monthKey: key,
        monthLabel: row.monthLabel,
        qty: 0,
        amount: 0
      };
    }

    map[key].qty += row.qty;
    map[key].amount += row.amount;
  });

  return Object.values(map).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function summarizeDepartmentMonthly(rows) {
  const map = {};

  rows.forEach(row => {
    const key = row.monthKey + "|" + row.department;

    if (!map[key]) {
      map[key] = {
        monthKey: row.monthKey,
        monthLabel: row.monthLabel,
        department: row.department || "-",
        qty: 0,
        amount: 0
      };
    }

    map[key].qty += row.qty;
    map[key].amount += row.amount;
  });

  return Object.values(map).sort((a, b) => {
    const monthCompare = b.monthKey.localeCompare(a.monthKey);
    if (monthCompare !== 0) return monthCompare;
    return b.amount - a.amount;
  });
}

function getTopCategory(categorySummary) {
  if (!categorySummary || categorySummary.length === 0) return "-";
  return categorySummary[0].name || "-";
}

function getMonthChange(monthlyTrend) {
  if (!monthlyTrend || monthlyTrend.length < 2) return "-";

  const latest = monthlyTrend[monthlyTrend.length - 1];
  const previous = monthlyTrend[monthlyTrend.length - 2];

  if (!previous.amount && !latest.amount) return "-";
  if (!previous.amount && latest.amount) return "신규";

  const rate = ((latest.amount - previous.amount) / previous.amount) * 100;
  const sign = rate >= 0 ? "+" : "";

  return sign + rate.toFixed(1) + "%";
}

function renderDashboard(data) {
  setText("baseDate", data.baseDate || "-");
  setText("monthlyAmount", formatWon(data.monthlyAmount));
  setText("monthlyQty", formatNumber(data.monthlyQty) + "개");
  setText("monthChange", data.monthChange || "-");
  setText("topCategory", data.topCategory || "-");

  const categories = data.categories || {};

  setText("safetyQty", formatNumber(categories.safety) + "개");
  setText("clothesQty", formatNumber(categories.clothes) + "개");
  setText("nameTagQty", formatNumber(categories.nameTag) + "개");
  setText("suppliesQty", formatNumber(categories.supplies) + "개");

  const budget = data.budget || {};

  setText("annualBudget", formatWon(budget.annualBudget));
  setText("usedAmount", formatWon(budget.usedAmount));
  setText("budgetUsageRate", formatPercent(budget.usageRate));
  setText("remainingBudget", formatWon(budget.remainingBudget));

  renderMonthlyTrend(data.monthlyTrend || []);
  renderDepartmentMonthly(data.departmentMonthly || []);
  renderHistoryTable(data.recentHistory || []);
}

function renderMonthlyTrend(rows) {
  const container = document.getElementById("monthlyTrendChart");
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = "월별 사용금액 데이터가 없습니다.";
    return;
  }

  const visibleRows = rows.slice(-12);
  const maxAmount = Math.max(...visibleRows.map(row => row.amount), 1);

  container.innerHTML = visibleRows.map(row => {
    const width = Math.max((row.amount / maxAmount) * 100, 2);

    return `
      <div class="trend-row">
        <div>${escapeHtml(row.monthLabel)}</div>
        <div class="trend-bar-wrap">
          <div class="trend-bar" style="width:${width}%"></div>
        </div>
        <div class="trend-amount">${formatWon(row.amount)}</div>
      </div>
    `;
  }).join("");
}

function renderDepartmentMonthly(rows) {
  const tbody = document.getElementById("departmentMonthlyBody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">부서별 월별 사용금액 데이터가 없습니다.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.slice(0, 30).map(row => `
    <tr>
      <td>${escapeHtml(row.monthLabel)}</td>
      <td>${escapeHtml(row.department)}</td>
      <td>${formatNumber(row.qty)}</td>
      <td>${formatWon(row.amount)}</td>
    </tr>
  `).join("");
}

function renderHistoryTable(rows) {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">현재 발주 예정 데이터가 없습니다.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.month || "발주예정")}</td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td>${escapeHtml(row.department || "-")}</td>
      <td>${escapeHtml(row.name || "-")}</td>
      <td>${escapeHtml(row.item || "-")}</td>
      <td>${formatNumber(row.qty)}</td>
      <td>${formatWon(row.amount)}</td>
    </tr>
  `).join("");
}

async function loadDashboardData() {
  try {
    renderDashboard({
      baseDate: "불러오는 중",
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
      budget: {
        annualBudget: ANNUAL_BUDGET,
        usedAmount: 0,
        usageRate: 0,
        remainingBudget: ANNUAL_BUDGET
      },
      monthlyTrend: [],
      departmentMonthly: [],
      recentHistory: []
    });

    const [
      safetyRows,
      clothesRows,
      nameTagRows,
      orderRows,
      masterRows,
      historyRows
    ] = await Promise.all([
      loadCsvSheet(SHEETS.safety),
      loadCsvSheet(SHEETS.clothes),
      loadCsvSheet(SHEETS.nameTag),
      loadCsvSheet(SHEETS.order),
      loadCsvSheet(SHEETS.itemMaster),
      loadCsvSheet(SHEETS.history)
    ]);

    const master = buildItemMaster(masterRows);

    let currentOrderRows = [];

    currentOrderRows = currentOrderRows.concat(readApplicationRows(safetyRows, {
      category: "안전화/방진화",
      deptCol: 1,
      nameCol: 2,
      itemCol: 3,
      qtyCol: 4
    }, master));

    currentOrderRows = currentOrderRows.concat(readApplicationRows(clothesRows, {
      category: "작업복",
      deptCol: 1,
      nameCol: 2,
      itemCol: 3,
      qtyCol: 5
    }, master));

    currentOrderRows = currentOrderRows.concat(readApplicationRows(nameTagRows, {
  category: "명찰",
  deptCol: 1,
  nameCol: 2,
  itemCol: 3,
  qtyCol: 4,
  forceCategory: true,
  fixedItem: "명찰(향남공장클립집게명찰)"
}, master));

    currentOrderRows = currentOrderRows.concat(readManualSuppliesRows(orderRows, master));

    const historyRecords = readHistoryRows(historyRows, master);

    const today = new Date();
    const currentMonthKey = getMonthKey(today);
    const currentMonthLabel = getMonthLabel(today);

    const currentOrderRecords = currentOrderRows.map(row => ({
      ...row,
      monthKey: currentMonthKey,
      monthLabel: currentMonthLabel,
      date: today,
      source: "발주예정"
    }));

    const allUsageRecords = historyRecords.concat(currentOrderRecords);

    const historyAmount = historyRecords.reduce((sum, row) => sum + row.amount, 0);
    const currentOrderAmount = currentOrderRows.reduce((sum, row) => sum + row.amount, 0);
    const usedAmount = historyAmount + currentOrderAmount;
    const remainingBudget = ANNUAL_BUDGET - usedAmount;
    const usageRate = ANNUAL_BUDGET > 0 ? (usedAmount / ANNUAL_BUDGET) * 100 : 0;

    const monthlyTrend = summarizeMonthly(allUsageRecords);
    const departmentMonthly = summarizeDepartmentMonthly(allUsageRecords);

    const currentMonthRows = allUsageRecords.filter(row => row.monthKey === currentMonthKey);
    const monthlyAmount = currentMonthRows.reduce((sum, row) => sum + row.amount, 0);
    const monthlyQty = currentMonthRows.reduce((sum, row) => sum + row.qty, 0);

    const categories = {
      safety: 0,
      clothes: 0,
      nameTag: 0,
      supplies: 0
    };

    currentOrderRows.forEach(row => {
      const key = getCategoryKey(row.category);
      categories[key] += row.qty;
    });

    const categorySummary = summarizeByCategory(currentOrderRows);

    const data = {
      baseDate: new Date().toLocaleDateString("ko-KR"),
      monthlyAmount,
      monthlyQty,
      monthChange: getMonthChange(monthlyTrend),
      topCategory: getTopCategory(categorySummary),
      categories,
      budget: {
        annualBudget: ANNUAL_BUDGET,
        historyAmount,
        currentOrderAmount,
        usedAmount,
        remainingBudget,
        usageRate
      },
      monthlyTrend,
      departmentMonthly,
      recentHistory: currentOrderRows.map(row => ({
        month: "발주예정",
        category: row.category,
        department: row.department,
        name: row.name,
        item: row.item,
        qty: row.qty,
        amount: row.amount
      }))
    };

    renderDashboard(data);
  } catch (error) {
    console.error("구글시트 연결 오류:", error);

    renderDashboard({
      baseDate: "-",
      monthlyAmount: 0,
      monthlyQty: 0,
      monthChange: "-",
      topCategory: "연결 오류",
      categories: {
        safety: 0,
        clothes: 0,
        nameTag: 0,
        supplies: 0
      },
      budget: {
        annualBudget: ANNUAL_BUDGET,
        usedAmount: 0,
        usageRate: 0,
        remainingBudget: ANNUAL_BUDGET
      },
      monthlyTrend: [],
      departmentMonthly: [],
      recentHistory: []
    });

    alert("구글시트 연결 오류:\n" + error.message);
  }
}

loadDashboardData();
