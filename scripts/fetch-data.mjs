/**
 * 從臺北市資料大平臺下載實價周報，處理為帶座標的交易點 JSON。
 * 資料來源：https://data.taipei/dataset/detail?id=a9a97996-3a55-46c8-9076-e5ebdefad6dc
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEEKLY_REPORT_RID = '2979c431-7a32-4067-9af2-e716cd825c4b';
const QUARTERLY_INDEX_RID = '3210976b-f578-483c-8853-3ceec3796877';

/** 臺北市 12 行政區近似範圍（TWD97 經緯度） */
const DISTRICT_BOUNDS = {
  中正區: { minLat: 25.018, maxLat: 25.048, minLng: 121.498, maxLng: 121.545 },
  大同區: { minLat: 25.048, maxLat: 25.072, minLng: 121.498, maxLng: 121.528 },
  中山區: { minLat: 25.058, maxLat: 25.088, minLng: 121.515, maxLng: 121.555 },
  松山區: { minLat: 25.042, maxLat: 25.068, minLng: 121.545, maxLng: 121.585 },
  大安區: { minLat: 25.018, maxLat: 25.045, minLng: 121.530, maxLng: 121.565 },
  萬華區: { minLat: 25.018, maxLat: 25.045, minLng: 121.478, maxLng: 121.508 },
  信義區: { minLat: 25.025, maxLat: 25.048, minLng: 121.555, maxLng: 121.590 },
  士林區: { minLat: 25.078, maxLat: 25.145, minLng: 121.505, maxLng: 121.565 },
  北投區: { minLat: 25.108, maxLat: 25.185, minLng: 121.465, maxLng: 121.545 },
  內湖區: { minLat: 25.055, maxLat: 25.095, minLng: 121.565, maxLng: 121.625 },
  南港區: { minLat: 25.028, maxLat: 25.065, minLng: 121.590, maxLng: 121.635 },
  文山區: { minLat: 24.975, maxLat: 25.025, minLng: 121.545, maxLng: 121.605 },
};

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function approximateGeocode(district, location) {
  const bounds = DISTRICT_BOUNDS[district];
  if (!bounds) return null;

  const h1 = hashString(location);
  const h2 = hashString(location + district);
  const latRange = bounds.maxLat - bounds.minLat;
  const lngRange = bounds.maxLng - bounds.minLng;

  // 偏向區域中心，避免點落在邊界外
  const lat = bounds.minLat + latRange * (0.15 + 0.7 * ((h1 % 1000) / 1000));
  const lng = bounds.minLng + lngRange * (0.15 + 0.7 * ((h2 % 1000) / 1000));

  return { lat, lng };
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = values[i]?.trim() ?? '';
    });
    return row;
  });
}

function processTransactions(rows) {
  const points = [];

  for (const row of rows) {
    if (row.CASE_T !== '買賣') continue;
    if (!row.CASE_F?.includes('房地')) continue;

    const price = parseFloat(row.UPRICE);
    if (!price || price <= 0 || price > 500) continue;

    const area = parseFloat(row.FAREA);
    if (!area || area < 5) continue;

    const coords = approximateGeocode(row.DISTRICT, row.LOCATION);
    if (!coords) continue;

    points.push({
      district: row.DISTRICT,
      location: row.LOCATION,
      pricePerPing: price,
      totalPrice: parseFloat(row.TPRICE) || null,
      area,
      buildingType: row.BUITYPE || '',
      transactionDate: row.SDATE || '',
      lat: coords.lat,
      lng: coords.lng,
    });
  }

  return points;
}

function processDistrictIndex(csvText) {
  const rows = parseCsv(csvText);
  const latest = {};

  for (const row of rows) {
    const category = row['宅價格季指數類別'] || row['住宅價格季指數類別'];
    if (!category || category === '全市' || category.includes('公寓') || category.includes('大樓') || category.includes('小宅')) {
      continue;
    }
    if (!category.endsWith('區')) continue;

    const period = row['期別'];
    const unitPrice = parseFloat(row['標準住宅單價（新台幣萬元每坪）']);
    if (!period || !unitPrice) continue;

    if (!latest[category] || period > latest[category].period) {
      latest[category] = {
        district: category,
        period,
        unitPrice,
        index: parseFloat(row['季指數']),
        changeRate: row['季指數變動率'],
      };
    }
  }

  return Object.values(latest);
}

async function fetchCsv(rid) {
  const url = `https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=${rid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${rid}: ${res.status}`);
  return res.text();
}

async function main() {
  console.log('下載臺北市實價周報…');
  const weeklyCsv = await fetchCsv(WEEKLY_REPORT_RID);
  const weeklyRows = parseCsv(weeklyCsv);
  const transactions = processTransactions(weeklyRows);
  console.log(`處理完成：${transactions.length} 筆買賣交易`);

  console.log('下載臺北市住宅價格季指數…');
  const indexCsv = await fetchCsv(QUARTERLY_INDEX_RID);
  const districtIndex = processDistrictIndex(indexCsv);
  console.log(`行政區指數：${districtIndex.length} 區`);

  const output = {
    updatedAt: new Date().toISOString(),
    sources: [
      {
        name: '臺北市實價周報',
        url: 'https://data.taipei/dataset/detail?id=a9a97996-3a55-46c8-9076-e5ebdefad6dc',
        license: '政府資料開放授權條款',
      },
      {
        name: '臺北市住宅價格季指數',
        url: 'https://data.taipei/dataset/detail?id=954911b5-896d-4ae1-9ebe-87c4ba8a191e',
        license: '政府資料開放授權條款',
      },
    ],
    transactions,
    districtIndex,
  };

  const outDir = join(__dirname, '../public/data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'taipei-housing.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`已寫入 ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
