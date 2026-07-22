const PUBLISHED_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFbe939fEC-BfJnBqWJFhAKJkEFmH8ANwF7LIos16BSajm6EZkz1_dPnO4vMC2GUl3IY5r9PcAdY1t/pubhtml";

const SHEETS = {
  safety: "★ 안전화&방진화 신청",
  clothes: "★ 작업복 신청",
  nameTag: "명찰 신청",
  order: "발주",
  itemMaster: "Ref. 품목마스터"
};

function formatWon(value) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function getGvizBaseUrl() {
  const publishedMatch = PUBLISHED_SHEET_URL.match(/\/d\/e\/([^/]+)/);
  if (publishedMatch) {
    return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/gviz/tq`;
  }

  const normalMatch = PUBLISHED_SHEET_URL.match(/\/d\/([^/]+)/);
  if (normalMatch) {
    return `https://docs.google.com/spreadsheets/d/${normalMatch[1]}/gviz/tq`;
  }

  throw new Error("구글시트 게시 링크 형식이 올바르지 않습니다.");
}

function loadSheet(sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "sheetCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    window[callbackName] = function(response) {
      try {
        delete window[callbackName];

        if (!response || response.status === "error") {
          reject(response);
          return;
        }

        const rows = convertGoogleTableToRows(response.table);
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };

    const script = document.createElement("script");
    script.src =
      getGvizBaseUrl() +
      "?tqx=out:json;responseHandler:" +
      callbackName +
      "&sheet=" +
      encodeURIComponent(sheetName) +
      "&t=" +
      Date.now();

    script.onerror = function() {
      delete window[callbackName];
      reject(new Error(sheetName + " 시트를 불러오지 못했습니다."));
    };

    document.body.appendChild(script);
  });
}

function convertGoogleTableToRows(table) {
  if (!table || !table.rows) return [];

  return table.rows.map(row => {
    return row.c.map(cell => {
      if (!cell) return "";
      return cell.v ?? "";
    });
  });
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

  const number = Number(String(value).replace(/,/g, ""));
  return isNaN(number) ? 0 : number;
}

function buildItemMaster(rows) {
  const byItem = {};

  rows.forEach((row, index) => {
    if (index < 2) return;

    const category = cleanText(row[0]);
    const item = cleanText(row[1]);
    const itemCode = cleanText(row[2]);
    const unitPrice = toNumber(row[3]);

    if (!item) return;

    byItem[normalize(item)] = {
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
    if (index < 2) return null;

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

function getTopCategory(categorySummary) {
  if (!categorySummary || categorySummary.length === 0) return "-";
  return categorySummary[0].name || "-";
}

function renderDashboard(data) {
  document.getElementById("baseDate").textContent = data.baseDate || "-";
  document.getElementById("monthlyAmount").textContent = formatWon(data.monthlyAmount);
  document.getElementById("monthlyQty").textContent = formatNumber(data.monthlyQty) + "개";
  document.getElementById("monthChange").textContent = data.monthChange || "-";
  document.getElementById("topCategory").textContent = data.topCategory || "-";

  const categories = data.categories || {};

  document.getElementById("safetyQty").textContent = formatNumber(categories.safety) + "개";
  document.getElementById("clothesQty").textContent = formatNumber(categories.clothes) + "개";
  document.getElementById("nameTagQty").textContent = formatNumber(categories.nameTag) + "개";
  document.getElementById("suppliesQty").textContent = formatNumber(categories.supplies) + "개";

  renderHistoryTable(data.recentHistory || []);
}

function renderHistoryTable(rows) {
  const tbody = document.getElementById("historyTableBody");

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
      <td>${row.month || "발주예정"}</td>
      <td>${row.category || "-"}</td>
      <td>${row.department || "-"}</td>
      <td>${row.name || "-"}</td>
      <td>${row.item || "-"}</td>
      <td>${formatNumber(row.qty)}</td>
      <td>${formatWon(row.amount)}</td>
    </tr>
  `).join("");
}

async function loadDashboardData() {
  try {
    const [
      safetyRows,
      clothesRows,
      nameTagRows,
      orderRows,
      masterRows
    ] = await Promise.all([
      loadSheet(SHEETS.safety),
      loadSheet(SHEETS.clothes),
      loadSheet(SHEETS.nameTag),
      loadSheet(SHEETS.order),
      loadSheet(SHEETS.itemMaster)
    ]);

    const master = buildItemMaster(masterRows);

    let rows = [];

    rows = rows.concat(readApplicationRows(safetyRows, {
      category: "안전화/방진화",
      deptCol: 1,
      nameCol: 2,
      itemCol: 3,
      qtyCol: 4
    }, master));

    rows = rows.concat(readApplicationRows(clothesRows, {
      category: "작업복",
      deptCol: 1,
      nameCol: 2,
      itemCol: 3,
      qtyCol: 5
    }, master));

    rows = rows.concat(readApplicationRows(nameTagRows, {
      category: "명찰",
      deptCol: 1,
      nameCol: 2,
      itemCol: 3,
      qtyCol: 4
    }, master));

    rows = rows.concat(readManualSuppliesRows(orderRows, master));

    const monthlyAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const monthlyQty = rows.reduce((sum, row) => sum + row.qty, 0);

    const categories = {
      safety: 0,
      clothes: 0,
      nameTag: 0,
      supplies: 0
    };

    rows.forEach(row => {
      const key = getCategoryKey(row.category);
      categories[key] += row.qty;
    });

    const categorySummary = summarizeByCategory(rows);

    const data = {
      baseDate: new Date().toLocaleDateString("ko-KR"),
      monthlyAmount,
      monthlyQty,
      monthChange: "-",
      topCategory: getTopCategory(categorySummary),
      categories,
      recentHistory: rows.map(row => ({
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
    console.error(error);

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
      recentHistory: []
    });

    alert("구글시트 게시 데이터를 불러오지 못했습니다. 게시 링크와 시트명을 확인해주세요.");
  }
}

loadDashboardData();
