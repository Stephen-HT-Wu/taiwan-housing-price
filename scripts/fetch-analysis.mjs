/**
 * 抓取時間序列、執行多元迴歸，輸出解釋力分析結果。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOUSING_INDEX_RID = '02c7bb70-2113-4daf-81d3-5c14b9ae26df';
const CBC_RATE_URL = 'https://www.cbc.gov.tw/Public/Data/opendata/webF1.csv';
const CBC_API = 'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=';
const CPI_XML_URL =
  'https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230555/pr0101a1m.xml';
const FRED_CACHE = join(__dirname, '../public/data/fred-monthly.json');
const AFFORDABILITY_CACHE = join(
  __dirname,
  '../public/data/housing-affordability.json',
);
const NATIONAL_INDEX_CACHE = join(
  __dirname,
  '../public/data/national-housing-price-index.json',
);
const MOI_AFFORDABILITY_URL =
  'https://pip.moi.gov.tw/Publicize/Info/E1050';
const MOI_HOUSING_INDEX_URL =
  'https://pip.moi.gov.tw/Publicize/Info/E1060';
const MOI_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

const M2_METRIC_INDEX = 14;
const MORTGAGE_RATE_INDEX = 2;
const USD_TWD_INDEX = 1;

loadEnv();

function loadEnv() {
  const envPath = join(__dirname, '../.env');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

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

function cbcMonthToIso(period) {
  const m = String(period).match(/^(\d{4})M(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

async function fetchCbcDataSets(fileName) {
  const res = await fetch(`${CBC_API}${fileName}`);
  if (!res.ok) throw new Error(`央行 API 失敗 ${fileName}: ${res.status}`);
  const json = await res.json();
  return json.data?.dataSets ?? [];
}

async function downloadCpiXml() {
  try {
    const res = await fetch(CPI_XML_URL);
    if (res.ok) return res.text();
  } catch {
    /* Node TLS 對 ws.dgbas.gov.tw 可能失敗，改以 curl 下載 */
  }
  return execFileSync('curl', ['-fsSL', CPI_XML_URL], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function fetchTaiwanCpiMonthly() {
  const text = await downloadCpiXml();
  const byMonth = {};

  for (const block of text.match(/<Obs>[\s\S]*?<\/Obs>/g) ?? []) {
    const item = block.match(/<Item>([^<]*)<\/Item>/)?.[1] ?? '';
    if (!item.startsWith('總指數')) continue;

    const period = block.match(/<TIME_PERIOD>([^<]*)<\/TIME_PERIOD>/)?.[1];
    const type = block.match(/<TYPE>([^<]*)<\/TYPE>/)?.[1];
    const rawValue = block.match(/<Item_VALUE>([^<]*)<\/Item_VALUE>/)?.[1]?.trim();
    const m = period?.match(/^(\d{4})M(\d{2})$/);
    if (!m || !rawValue) continue;

    const month = `${m[1]}-${m[2]}`;
    if (!byMonth[month]) byMonth[month] = {};
    const value = parseFloat(rawValue);
    if (Number.isNaN(value)) continue;

    if (type === '原始值') byMonth[month].index = value;
    if (type === '年增率(%)') byMonth[month].inflation = value;
  }

  for (const [month, row] of Object.entries(byMonth)) {
    if (row.inflation != null || row.index == null) continue;
    const [y, mo] = month.split('-').map(Number);
    const prevKey = `${y - 1}-${String(mo).padStart(2, '0')}`;
    const prev = byMonth[prevKey]?.index;
    if (prev) row.inflation = ((row.index - prev) / prev) * 100;
  }

  return byMonth;
}

async function fetchM2Monthly() {
  const rows = await fetchCbcDataSets('EF15M01');
  const byMonth = {};
  for (const row of rows) {
    const month = cbcMonthToIso(row[0]);
    if (!month) continue;
    const levelIdx = 1 + M2_METRIC_INDEX * 2;
    const yoyIdx = levelIdx + 1;
    const level = parseFloat(row[levelIdx]);
    const yoy = parseFloat(row[yoyIdx]);
    if (Number.isNaN(yoy)) continue;
    byMonth[month] = {
      level: Number.isNaN(level) ? null : level,
      yoy,
    };
  }
  return byMonth;
}

async function fetchMortgageRates() {
  const rows = await fetchCbcDataSets('EH45M01');
  const byMonth = {};
  for (const row of rows) {
    const month = cbcMonthToIso(row[0]);
    if (!month) continue;
    const rate = parseFloat(row[MORTGAGE_RATE_INDEX]);
    if (!Number.isNaN(rate)) byMonth[month] = rate;
  }
  return byMonth;
}

async function fetchUsdTwdMonthly() {
  const rows = await fetchCbcDataSets('BP01D01');
  const buckets = {};
  for (const row of rows) {
    const date = String(row[0]);
    if (date.length < 6) continue;
    const month = `${date.slice(0, 4)}-${date.slice(4, 6)}`;
    const rate = parseFloat(row[USD_TWD_INDEX]);
    if (Number.isNaN(rate)) continue;
    if (!buckets[month]) buckets[month] = [];
    buckets[month].push(rate);
  }
  const byMonth = {};
  for (const [month, rates] of Object.entries(buckets)) {
    byMonth[month] =
      rates.reduce((sum, v) => sum + v, 0) / rates.length;
  }
  return byMonth;
}

async function fetchFredSeries(seriesId, startDate = '2018-01-01') {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error(
      '請在專案根目錄建立 .env 並設定 FRED_API_KEY（可參考 .env.example）',
    );
  }
  const url = new URL(
    'https://api.stlouisfed.org/fred/series/observations',
  );
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('observation_start', startDate);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${seriesId} 失敗: ${res.status}`);
  const json = await res.json();
  if (json.error_message) {
    throw new Error(`FRED ${seriesId}: ${json.error_message}`);
  }

  const byMonth = {};
  for (const obs of json.observations ?? []) {
    if (!obs.date || obs.value === '.') continue;
    const month = obs.date.slice(0, 7);
    const value = parseFloat(obs.value);
    if (!Number.isNaN(value)) byMonth[month] = value;
  }
  return byMonth;
}

async function fetchFredBundle() {
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(FRED_CACHE, 'utf8'));
  } catch {
    /* no cache */
  }

  const needsFetch =
    !cache.fedFunds ||
    !cache.fedAssets ||
    Object.keys(cache.fedFunds ?? {}).length < 12;

  if (needsFetch) {
    console.log('  下載 FRED（FEDFUNDS、WALCL）…');
    cache = {
      updatedAt: new Date().toISOString(),
      fedFunds: await fetchFredSeries('FEDFUNDS'),
      fedAssets: await fetchFredSeries('WALCL'),
    };
    mkdirSync(dirname(FRED_CACHE), { recursive: true });
    writeFileSync(FRED_CACHE, JSON.stringify(cache, null, 2));
  } else {
    console.log('  載入 FRED 快取');
  }

  return cache;
}

function monthToQuarter(month) {
  const [y, m] = month.split('-').map(Number);
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

async function scrapeMoiNationalHousingIndex() {
  const res = await fetch(MOI_HOUSING_INDEX_URL, { headers: MOI_FETCH_HEADERS });
  if (!res.ok) {
    console.warn(`  內政部住宅價格指數頁面失敗: ${res.status}`);
    return null;
  }
  const html = await res.text();
  const periodMatch = html.match(/表1\s*(\d{3})年\s*第\s*(\d)\s*季/);
  const indexMatch = html.match(
    /<tr><td>全國<\/td><td[^>]*>([\d.]+)<\/td>/,
  );
  if (!periodMatch || !indexMatch) return null;

  const rocYear = parseInt(periodMatch[1], 10);
  const quarter = parseInt(periodMatch[2], 10);
  const westernYear = rocYear + 1911;
  return {
    quarter: `${westernYear}-Q${quarter}`,
    index: parseFloat(indexMatch[1]),
  };
}

async function loadNationalHousingPriceIndex() {
  let data;
  try {
    data = JSON.parse(readFileSync(NATIONAL_INDEX_CACHE, 'utf8'));
  } catch {
    data = { quarterly: [] };
  }

  const latest = await scrapeMoiNationalHousingIndex();
  if (latest && !Number.isNaN(latest.index)) {
    const idx = data.quarterly.findIndex((r) => r.quarter === latest.quarter);
    if (idx >= 0) {
      data.quarterly[idx].index = latest.index;
    } else {
      data.quarterly.push(latest);
    }
    data.quarterly.sort((a, b) => a.quarter.localeCompare(b.quarter));
    data.updatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(NATIONAL_INDEX_CACHE, JSON.stringify(data, null, 2));
    console.log(
      `  更新全國住宅價格指數：${latest.quarter} = ${latest.index}`,
    );
  } else {
    console.log('  載入全國住宅價格指數快取（內政部頁面未更新）');
  }

  const byQuarter = {};
  for (const row of data.quarterly ?? []) {
    byQuarter[row.quarter] = row.index;
  }
  return byQuarter;
}

async function scrapeMoiNationalAffordability() {
  const res = await fetch(MOI_AFFORDABILITY_URL, { headers: MOI_FETCH_HEADERS });
  if (!res.ok) {
    console.warn(`  內政部房價負擔頁面失敗: ${res.status}`);
    return null;
  }
  const html = await res.text();
  const ratioMatch = html.match(
    /<td headers="t1c1">全國<\/td>[\s\S]*?<td headers="t1c4 t1c41">([\d.]+)<\/td>/,
  );
  const periodMatch = html.match(/(\d{3})\s*年\s*第\s*(\d)\s*季/);
  if (!ratioMatch || !periodMatch) return null;

  const rocYear = parseInt(periodMatch[1], 10);
  const quarter = parseInt(periodMatch[2], 10);
  const westernYear = rocYear + 1911;
  return {
    quarter: `${westernYear}-Q${quarter}`,
    priceToIncome: parseFloat(ratioMatch[1]),
  };
}

async function loadHousingAffordability() {
  let data;
  try {
    data = JSON.parse(readFileSync(AFFORDABILITY_CACHE, 'utf8'));
  } catch {
    data = { quarterly: [] };
  }

  const latest = await scrapeMoiNationalAffordability();
  if (latest && !Number.isNaN(latest.priceToIncome)) {
    const idx = data.quarterly.findIndex((r) => r.quarter === latest.quarter);
    if (idx >= 0) {
      data.quarterly[idx].priceToIncome = latest.priceToIncome;
    } else {
      data.quarterly.push(latest);
    }
    data.quarterly.sort((a, b) => a.quarter.localeCompare(b.quarter));
    data.updatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(AFFORDABILITY_CACHE, JSON.stringify(data, null, 2));
    console.log(
      `  更新全國房價所得比：${latest.quarter} = ${latest.priceToIncome} 倍`,
    );
  } else {
    console.log('  載入房價所得比快取（內政部頁面未更新）');
  }

  const byQuarter = {};
  for (const row of data.quarterly ?? []) {
    byQuarter[row.quarter] = row.priceToIncome;
  }
  return byQuarter;
}

function mergeSeries(
  housing,
  taiex,
  rates,
  m2,
  mortgage,
  usdTwd,
  fred,
  cpi,
  affordabilityByQuarter,
  nationalIndexByQuarter,
) {
  const months = Object.keys(housing).sort();
  const rows = [];
  let prevTaiex = null;

  for (const month of months) {
    const h = housing[month];
    const t = taiex[month];
    const r = rates[month];
    const m2Row = m2[month];
    const mort = mortgage[month];
    const fx = usdTwd[month];
    const fedFunds = fred.fedFunds?.[month];
    const fedAssets = fred.fedAssets?.[month];
    const cpiRow = cpi[month];
    if (!h || !t || !r || !m2Row || mort == null || fedFunds == null) {
      continue;
    }

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
      mortgageRate: mort,
      m2Level: m2Row.level,
      m2Log: m2Row.level != null ? Math.log(m2Row.level) : null,
      m2Yoy: m2Row.yoy,
      usdTwd: fx ?? null,
      fedFundsRate: fedFunds,
      fedAssetsBn: fedAssets != null ? fedAssets / 1000 : null,
      cpiIndex: cpiRow?.index ?? null,
      cpiInflation: cpiRow?.inflation ?? null,
      priceToIncomeRatio:
        affordabilityByQuarter[monthToQuarter(month)] ?? null,
      nationalHousingIndex:
        nationalIndexByQuarter[monthToQuarter(month)] ?? null,
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

  console.log('下載央行 M2、房貸利率、匯率…');
  console.log('下載主計處 CPI／通膨率…');
  const [m2, mortgage, usdTwd, cpi] = await Promise.all([
    fetchM2Monthly(),
    fetchMortgageRates(),
    fetchUsdTwdMonthly(),
    fetchTaiwanCpiMonthly(),
  ]);

  console.log('下載美國 FRED 總經資料…');
  const fred = await fetchFredBundle();

  console.log('載入全國房價所得比（內政部）…');
  const affordabilityByQuarter = await loadHousingAffordability();

  console.log('載入全國住宅價格指數（內政部）…');
  const nationalIndexByQuarter = await loadNationalHousingPriceIndex();

  const series = mergeSeries(
    housing,
    taiex,
    rates,
    m2,
    mortgage,
    usdTwd,
    fred,
    cpi,
    affordabilityByQuarter,
    nationalIndexByQuarter,
  );
  const recent = series.filter((r) => r.month >= '2018-01');
  console.log(`合併後樣本：${recent.length} 個月（2018–至今）`);

  const y = recent.map((r) => r.housingUnitPrice);
  const variableIds = [
    'taiex_close',
    'mortgage_rate',
    'm2_yoy',
    'fed_funds_rate',
  ];
  const variableLabels = [
    '加權指數（收盤）',
    '五大銀行新承作房貸利率',
    'M2 年增率',
    '美國聯邦基金利率',
  ];
  const X = recent.map((r) => [
    r.taiexClose,
    r.mortgageRate,
    r.m2Yoy,
    r.fedFundsRate,
  ]);

  const analysis = analyzeExplanatoryPower(y, X, variableIds, variableLabels);
  if (!analysis) throw new Error('樣本數不足，無法估計迴歸');

  const corrCols = {
    housing_unit_price: recent.map((r) => r.housingUnitPrice),
    housing_index: recent.map((r) => r.housingIndex),
    taiex_close: recent.map((r) => r.taiexClose),
    taiex_return: recent.map((r) => r.taiexReturn),
    rediscount_rate: recent.map((r) => r.rediscountRate),
    mortgage_rate: recent.map((r) => r.mortgageRate),
    m2_level: recent.map((r) => r.m2Level ?? 0),
    m2_log: recent.map((r) => r.m2Log ?? 0),
    m2_yoy: recent.map((r) => r.m2Yoy),
    usd_twd: recent.map((r) => r.usdTwd ?? 0),
    fed_funds_rate: recent.map((r) => r.fedFundsRate),
    fed_assets_bn: recent.map((r) => r.fedAssetsBn ?? 0),
    cpi_index: recent.map((r) => r.cpiIndex ?? 0),
    cpi_inflation: recent.map((r) => r.cpiInflation ?? 0),
    price_to_income_ratio: recent.map((r) => r.priceToIncomeRatio ?? 0),
  };

  const output = {
    updatedAt: new Date().toISOString(),
    description:
      '以臺北市標準住宅單價（萬元/坪）為應變數之多元線性迴歸；納入台股、房貸利率、M2 與美國聯邦基金利率。',
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
        name: '央行貨幣總計數 M2',
        url: 'https://cpx.cbc.gov.tw/Data/ExportToAPIInfo',
      },
      {
        name: '五大銀行新承作放款利率',
        url: 'https://cpx.cbc.gov.tw/Data/ExportToAPIInfo',
      },
      {
        name: 'FRED（FEDFUNDS、WALCL）',
        url: 'https://fred.stlouisfed.org/',
      },
      {
        name: '消費者物價基本分類指數（主計總處）',
        url: 'https://data.gov.tw/dataset/6019',
      },
      {
        name: '房價負擔能力指標（內政部不動產資訊平台）',
        url: 'https://pip.moi.gov.tw/Publicize/Info/E1050',
      },
      {
        name: '全國住宅價格指數（內政部不動產資訊平台）',
        url: 'https://pip.moi.gov.tw/Publicize/Info/E1060',
      },
    ],
    caveats: [
      '相關性不等於因果；總經變數與房價可能存在落後／領先關係。',
      'Fed 資產負債表（WALCL）作為 QE 代理指標，僅呈現於時間序列與相關矩陣。',
      '房貸利率與 M2 來自央行統計；美國利率透過 FRED API 取得。',
      '房價所得比為全國中位數住宅／家戶所得（季資料），與臺北市住宅單價口徑不同；圖上以季內各月填補同一值。',
      '全國住宅價格指數（105年＝100）為內政部季指數，與臺北市月單價口徑不同；圖上以季內各月填補同一值。',
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
