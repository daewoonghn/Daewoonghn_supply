const PUBLISHED_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFbe939fEC-BfJnBqWJFhAKJkEFmH8ANwF7LIos16BSajm6EZkz1_dPnO4vMC2GUl3IY5r9PcAdY1t/pubhtml";

const SHEETS = {
  safety: {
    name: "★ 안전화&방진화 신청",
    gid: "0"
  },
  clothes: {
    name: "★ 작업복 신청",
    gid: "1280118521"
  },
  nameTag: {
    name: "명찰 신청",
    gid: "1695498421"
  },
  order: {
    name: "발주",
    gid: "1007978871"
  },
  itemMaster: {
    name: "Ref. 품목마스터",
    gid: "621949629"
  }
};

function formatWon(value) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
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

  if (!match) {
    throw new Error("구글시트 게시 링크 형식이 올바르지 않습니다.");
  }

  return match[1];
}

function getGvizBaseUrl() {
  const publishedId = getPublishedId();
  return `https://docs.google.com/spreadsheets/d/e/${publishedId}/gviz/tq`;
}

function loadSheetByGid(sheetInfo, rangeA1) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "sheetCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    window[callbackName] = function(response) {
      try {
        delete window[callbackName];

        if (!response) {
          reject(new Error(sheetInfo.name + " 응답이 없습니다."));
          return;
        }

        if (response.status === "error") {
          const detail = response.errors
            ? response.errors.map(error => error.detailed_message || error.message).join(" / ")
            : "상세 오류 없음";

          reject(new Error(sheetInfo.name + " 오류: " + detail));
          return;
        }

        const rows = convertGoogleTableToRows(response.table);
        console.log(sheetInfo.name + " 불러오기 성공:", rows.length + "행");

        resolve(rows);
      } catch (error) {
        reject(new Error(sheetInfo.name + " 처리 중 오류: " + error.message));
      }
    };

    const params = new URLSearchParams();
    params.set("tqx", "out:json;responseHandler:" + callbackName);
    params.set("gid", sheetInfo.gid);

    if (rangeA1) {
      params.set("range", rangeA1);
    }

    params.set("t", Date.now());

    const script = document.createElement("script");
    script.src = getGvizBaseUrl() + "?" + params.toString();

    console.log("요청 URL:", sheetInfo.name, script.src);

    script.onerror = function() {
      delete window[callbackName];
      reject(new Error(sheetInfo.name + " 스크립트 로드 실패"));
    };

    document.body.appendChild(script);
  });
}

function convertGoogleTableToRows(table) {
  if (!table || !table.rows) return [];

  const colCount = table.cols ? table.cols.length : 0;

  return table.rows.map(row => {
    const cells = row.c || [];
    const result = [];

    for (let i = 0; i < colCount; i++) {
      const cell = cells[i];

      if (!cell) {
        result.push("");
      } else {
        result.push(cell.f ?? cell.v ?? "");
      }
    }

    return result;
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

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;

  const number = Number(cleaned);

  return isNaN(number) ? 0 : number;
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

  console.log("품목마스터:", byItem);

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
  return rows.map(row => {
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
  return rows.map(row => {
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

  renderHistoryTable(data.recentHistory || []);
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

async function loadAllSheets() {
  const requests = [
    {
      key: "safetyRows",
      label: SHEETS.safety.name,
      promise: loadSheetByGid(SHEETS.safety)
    },
    {
      key: "clothesRows",
      label: SHEETS.clothes.name,
      promise: loadSheetByGid(SHEETS.clothes)
    },
    {
      key: "nameTagRows",
      label: SHEETS.nameTag.name,
      promise: loadSheetByGid(SHEETS.nameTag)
    },
    {
      key: "orderRows",
      label: SHEETS.order.name + " A28:C29",
      promise: loadSheetByGid(SHEETS.order, "A28:C29")
    },
    {
      key: "masterRows",
      label: SHEETS.itemMaster.name,
      promise: loadSheetByGid(SHEETS.itemMaster)
    }
  ];

  const results = await Promise.allSettled(requests.map(request => request.promise));

  const loaded = {};
  const failed = [];

  results.forEach((result, index) => {
    const request = requests[index];

    if (result.status === "fulfilled") {
      loaded[request.key] = result.value;
    } else {
      failed.push(request.label + " → " + result.reason.message);
    }
  });

  if (failed.length > 0) {
    throw new Error(failed.join("\n"));
  }

  return loaded;
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
      recentHistory: []
    });

    const {
      safetyRows,
      clothesRows,
      nameTagRows,
      orderRows,
      masterRows
    } = await loadAllSheets();

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

    console.log("최종 발주 예정 데이터:", rows);

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
      recentHistory: []
    });

    alert("구글시트 연결 오류:\n" + error.message);
  }
}

loadDashboardData();
