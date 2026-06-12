/**
 * 抓取時間序列、執行多元迴歸，輸出解釋力分析結果。
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOUSING_INDEX_RID = '02c7bb70-2113-4daf-81d3-5c14b9ae26df';
const CBC_RATE_URL = 'https://www.cbc.gov.tw/Public/Data/opendata/webF1.csv';

// --- matrix helpers (mirror src/lib/regression.ts) ---
function transpose(m) {
  return m[0].map((_, i) => m.map((row) => row[i]));
}
function matMul(a, b) {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const out = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      for (let j = 0; j < cols; j++) out[i][j] += a[i][k] * b[k][j];
    }
  }
  return out;
}
function invertMatrix(matrix) {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) return null;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}
function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function std(arr) {
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v) || 1;
}
function olsRegression(y, X, variableNames) {
  const n = y.length;
  const p = X[0]?.length ?? 0;
  if (n < p + 2) return null;
  const design = X.map((row) => [1, ...row]);
  const yCol = y.map((v) => [v]);
  const xtxInv = invertMatrix(matMul(transpose(design), design));
  if (!xtxInv) return null;
  const beta = matMul(xtxInv, matMul(transpose(design), yCol)).map((r) => r[0]);
  const yHat = design.map((row) => row.reduce((s, v, i) => s + v * beta[i], 0));
  const yBar = mean(y);
  const ssRes = y.reduce((s, yi, i) => s + (yi - yHat[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yBar) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return {
    coefficients: beta,
    r2,
    adjR2: 1 - ((1 - r2) * (n - 1)) / (n - p - 1),
    n,
    variableNames: ['const', ...variableNames],
  };
}
function correlationMatrix(columns) {
  const keys = Object.keys(columns);
  const out = {};
  for (const a of keys) {
    out[a] = {};
    for (const b of keys) {
      const xs = columns[a];
      const ys = columns[b];
      const mx = mean(xs);
      const my = mean(ys);
      let num = 0;
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < xs.length; i++) {
        const vx = xs[i] - mx;
        const vy = ys[i] - my;
        num += vx * vy;
        dx += vx * vx;
        dy += vy * vy;
      }
      out[a][b] = dx && dy ? num / Math.sqrt(dx * dy) : 0;
    }
  }
  return out;
}
function analyzeExplanatoryPower(y, X, variableIds, variableLabels) {
  const full = olsRegression(y, X, variableIds);
  if (!full) return null;
  const yStd = std(y);
  const importance = variableIds.map((id, j) => {
    const reducedX = X.map((row) => row.filter((_, idx) => idx !== j));
    const reducedIds = variableIds.filter((_, idx) => idx !== j);
    const reduced = olsRegression(y, reducedX, reducedIds);
    const partialR2 =
      reduced && reduced.r2 < full.r2
        ? (full.r2 - reduced.r2) / (1 - reduced.r2)
        : 0;
    return {
      id,
      label: variableLabels[j],
      coefficient: full.coefficients[j + 1],
      stdCoefficient: (full.coefficients[j + 1] * std(X.map((r) => r[j]))) / yStd,
      partialR2: Math.max(0, partialR2),
    };
  });
  return { model: full, importance };
}

// --- data fetch ---
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) {
        values.push(cur);
        cur = '';
      } else cur += ch;
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = values[i]?.trim() ?? '';
    });
    return row;
  });
}

function parseGovDate(dateStr) {
  const [y, m, d] = dateStr.split('/').map((x) => parseInt(x, 10));
  const year = y < 1000 ? y + 1911 : y;
  return `${year}-${String(m).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`;
}

function rocMonthToIso(period) {
  const [y, m] = period.split('/');
  return `${parseInt(y, 10) + 1911}-${m.padStart(2, '0')}`;
}

async function fetchHousingMonthlyIndex() {
  const url = `https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=${HOUSING_INDEX_RID}`;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = iconv.decode(buf, 'big5');
  const rows = parseCsv(text);
  const priceKey = '標準住宅單價（新台幣萬元每坪）';
  const indexKey = '月指數';
  const catKey = '住宅價格月指數類別';
  const periodKey = '期別';

  const byMonth = {};
  for (const row of rows) {
    if (row[catKey] !== '全市') continue;
    const month = rocMonthToIso(row[periodKey]);
    const unitPrice = parseFloat(row[priceKey]);
    const index = parseFloat(row[indexKey]);
    if (!unitPrice) continue;
    byMonth[month] = { unitPrice, index };
  }
  return byMonth;
}

async function fetchCbcRates() {
  const res = await fetch(CBC_RATE_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = iconv.decode(buf, 'big5');
  const rows = parseCsv(text);
  return rows
    .map((r) => ({
      date: parseGovDate(r['調整日期']),
      rediscount: parseFloat(r['重貼現率']),
      secured: parseFloat(r['擔保放款融通利率']),
    }))
    .filter((r) => r.date && !Number.isNaN(r.rediscount))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function expandRatesToMonths(rateChanges, months) {
  const out = {};
  let idx = 0;
  for (const month of months) {
    const monthEnd = `${month}-31`;
    while (
      idx + 1 < rateChanges.length &&
      rateChanges[idx + 1].date <= monthEnd
    ) {
      idx++;
    }
    out[month] = {
      rediscount: rateChanges[idx].rediscount,
      secured: rateChanges[idx].secured,
    };
  }
  return out;
}

const TAIEX_CACHE = join(__dirname, '../public/data/taiex-monthly.json');

async function fetchTaiexMonthly(startYear = 2018, endYear = 2026) {
  let byMonth = {};
  try {
    byMonth = JSON.parse(readFileSync(TAIEX_CACHE, 'utf8'));
    console.log(`  載入台股快取 ${Object.keys(byMonth).length} 個月`);
  } catch {
    /* no cache */
  }

  for (let year = startYear; year <= endYear; year++) {
    for (let month = 1; month <= 12; month++) {
      const date = `${year}${String(month).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=json&date=${date}`;
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.stat !== 'OK' || !json.data?.length) continue;
        const closes = json.data
          .map((row) => parseFloat(String(row[4]).replace(/,/g, '')))
          .filter((v) => !Number.isNaN(v));
        if (!closes.length) continue;
        const isoMonth = `${year}-${String(month).padStart(2, '0')}`;
        if (byMonth[isoMonth]) continue;
        byMonth[isoMonth] = {
          closeAvg: closes.reduce((a, b) => a + b, 0) / closes.length,
          closeEnd: closes[closes.length - 1],
        };
        process.stdout.write(`  台股 ${isoMonth}\r`);
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        /* skip */
      }
    }
  }
  mkdirSync(dirname(TAIEX_CACHE), { recursive: true });
  writeFileSync(TAIEX_CACHE, JSON.stringify(byMonth, null, 2));
  console.log(`  台股快取已更新（${Object.keys(byMonth).length} 個月）`);
  return byMonth;
}

function aggregateTransactionsByMonth() {
  const path = join(__dirname, '../public/data/taipei-housing.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const byMonth = {};
  for (const t of data.transactions) {
    const s = t.transactionDate;
    if (!s || s.length < 5) continue;
    const rocYear = parseInt(s.slice(0, 3), 10) + 1911;
    const month = `${rocYear}-${s.slice(3, 5)}`;
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(t.pricePerPing);
  }
  const stats = {};
  for (const [month, prices] of Object.entries(byMonth)) {
    prices.sort((a, b) => a - b);
    stats[month] = {
      count: prices.length,
      median: prices[Math.floor(prices.length / 2)],
    };
  }
  return stats;
}

function mergeSeries(housing, taiex, rates, txStats) {
  const months = Object.keys(housing).sort();
  const rows = [];
  let prevTaiex = null;

  for (const month of months) {
    const h = housing[month];
    const t = taiex[month];
    const r = rates[month];
    const tx = txStats[month];
    if (!h || !t || !r) continue;

    const taiexReturn =
      prevTaiex && prevTaiex > 0
        ? (t.closeEnd - prevTaiex) / prevTaiex
        : 0;
    prevTaiex = t.closeEnd;

    rows.push({
      month,
      housingUnitPrice: h.unitPrice,
      housingIndex: h.index,
      taiexClose: t.closeEnd,
      taiexReturn,
      rediscountRate: r.rediscount,
      securedRate: r.secured,
      transactionCount: tx?.count ?? 0,
      transactionMedian: tx?.median ?? null,
    });
  }
  return rows;
}

async function main() {
  console.log('下載臺北市住宅價格月指數…');
  const housing = await fetchHousingMonthlyIndex();

  console.log('下載央行重貼現率…');
  const rateChanges = await fetchCbcRates();
  const months = Object.keys(housing).sort();
  const rates = expandRatesToMonths(rateChanges, months);

  console.log('下載台股加權指數（逐月，需數分鐘）…');
  const taiex = await fetchTaiexMonthly(2018, 2026);

  console.log('聚合實價登錄成交量…');
  const txStats = aggregateTransactionsByMonth();

  const series = mergeSeries(housing, taiex, rates, txStats);
  const recent = series.filter((r) => r.month >= '2018-01');
  console.log(`合併後樣本：${recent.length} 個月（2018–至今）`);

  const y = recent.map((r) => r.housingUnitPrice);
  const variableIds = [
    'taiex_close',
    'taiex_return',
    'rediscount_rate',
    'log_transaction_count',
  ];
  const variableLabels = [
    '加權指數（收盤）',
    '加權指數月報酬率',
    '央行重貼現率',
    '實價登錄成交量（log）',
  ];
  const X = recent.map((r) => [
    r.taiexClose,
    r.taiexReturn,
    r.rediscountRate,
    Math.log1p(r.transactionCount),
  ]);

  const analysis = analyzeExplanatoryPower(y, X, variableIds, variableLabels);
  if (!analysis) throw new Error('樣本數不足，無法估計迴歸');

  const corrCols = {
    housing_unit_price: recent.map((r) => r.housingUnitPrice),
    housing_index: recent.map((r) => r.housingIndex),
    taiex_close: recent.map((r) => r.taiexClose),
    taiex_return: recent.map((r) => r.taiexReturn),
    rediscount_rate: recent.map((r) => r.rediscountRate),
    transaction_count: recent.map((r) => r.transactionCount),
  };

  const output = {
    updatedAt: new Date().toISOString(),
    description:
      '以臺北市標準住宅單價（萬元/坪）為應變數之多元線性迴歸；partial R² 為該變數的邊際解釋力。',
    period: { start: recent[0].month, end: recent[recent.length - 1].month },
    observations: recent.length,
    dependentVariable: {
      id: 'housing_unit_price',
      label: '臺北市標準住宅單價（萬元/坪）',
    },
    model: {
      r2: analysis.model.r2,
      adjR2: analysis.model.adjR2,
      intercept: analysis.model.coefficients[0],
    },
    variables: analysis.importance.sort(
      (a, b) => b.partialR2 - a.partialR2,
    ),
    correlation: correlationMatrix(corrCols),
    timeSeries: recent,
    sources: [
      {
        name: '臺北市住宅價格月指數',
        url: 'https://data.taipei/dataset/detail?id=ce4ea2c6-6334-44f8-945a-5705492b187d',
      },
      {
        name: '加權股價指數',
        url: 'https://www.twse.com.tw/zh/indices/taiex/mi-5min-hist.html',
      },
      {
        name: '央行貼放利率',
        url: 'https://data.gov.tw/dataset/6022',
      },
      {
        name: '臺北市實價周報（成交量）',
        url: 'https://data.taipei/dataset/detail?id=a9a97996-3a55-46c8-9076-e5ebdefad6dc',
      },
    ],
    caveats: [
      '相關性不等於因果；總經變數與房價可能存在落後／領先關係。',
      '實價周報成交量僅涵蓋部分臺北交易，與官方指數時間定義不同。',
      '未納入國際事件、建照量等變數；可於 events 與營建統計擴充後重跑。',
    ],
  };

  const outDir = join(__dirname, '../public/data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'multivariate-analysis.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`已寫入 ${outPath}`);
  console.log(`R² = ${(analysis.model.r2 * 100).toFixed(1)}%`);
  for (const v of output.variables) {
    console.log(
      `  ${v.label}: partial R² = ${(v.partialR2 * 100).toFixed(1)}%`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
