/**
 * 從臺北市資料大平臺下載實價周報，處理為帶座標的交易點 JSON。
 * 資料來源：https://data.taipei/dataset/detail?id=a9a97996-3a55-46c8-9076-e5ebdefad6dc
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEEKLY_REPORT_RID = '2979c431-7a32-4067-9af2-e716cd825c4b';
const QUARTERLY_INDEX_RID = '3210976b-f578-483c-8853-3ceec3796877';
const MRT_STATION_RID = 'c77e91bf-067c-475e-917b-545ff62b7d76';
const MRT_ROUTE_RID = '1139b06e-8128-4a07-8148-f27f038bd8b4';

const TWD97_TM2 =
  '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';

const MRT_LINE_STYLES = {
  木柵線: { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  內湖線: { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  南港線: { lineId: 'BR', lineName: '文湖線', color: '#C48C31' },
  淡水線: { lineId: 'R', lineName: '淡水信義線', color: '#E3002C' },
  信義線: { lineId: 'R', lineName: '淡水信義線', color: '#E3002C' },
  松山線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  新店線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  小南門線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  碧潭支線: { lineId: 'G', lineName: '松山新店線', color: '#008659' },
  中和線: { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  蘆洲線: { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  新莊線: { lineId: 'O', lineName: '中和新蘆線', color: '#F8B61C' },
  板橋線: { lineId: 'BL', lineName: '板南線', color: '#0070BD' },
  環狀線: { lineId: 'Y', lineName: '環狀線', color: '#FFDB00' },
};

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

function parseQuotedField(value) {
  const trimmed = value.trim();
  const inner = trimmed.replace(/^'+|'+$/g, '');
  if (inner.startsWith('{') && inner.endsWith('}')) {
    return inner.slice(1, -1);
  }
  return inner;
}

function processMrtStations(rows) {
  const byId = new Map();

  for (const row of rows) {
    const id = parseQuotedField(row.StationID || '');
    if (!id || byId.has(id)) continue;

    const nameParts = parseQuotedField(row.StationName || '').split(',');
    const posParts = parseQuotedField(row.StationPosition || '').split(',');
    const lng = parseFloat(posParts[0]);
    const lat = parseFloat(posParts[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    byId.set(id, {
      id,
      name: nameParts[0]?.trim() || id,
      nameEn: nameParts[1]?.trim() || '',
      lat,
      lng,
      address: (row.StationAddress || '').replace(/^'+|'+$/g, ''),
      source: 'data.taipei',
    });
  }

  return Array.from(byId.values());
}

async function fetchTdxToken() {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(
    'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );
  if (!res.ok) throw new Error(`TDX auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchMrtFromTdx() {
  const token = await fetchTdxToken();
  if (!token) return null;

  const res = await fetch(
    'https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/Station/TRTC?$format=JSON',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`TDX station fetch failed: ${res.status}`);

  const stations = await res.json();
  const byId = new Map();

  for (const s of stations) {
    const id = s.StationID;
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: s.StationName?.Zh_tw || id,
      nameEn: s.StationName?.En || '',
      lat: s.StationPosition?.PositionLat,
      lng: s.StationPosition?.PositionLon,
      address: s.StationAddress || '',
      source: 'TDX',
    });
  }

  return Array.from(byId.values());
}

function transformCoord([x, y]) {
  const [lng, lat] = proj4(TWD97_TM2, 'WGS84', [x, y]);
  return [lng, lat];
}

function transformGeometry(geometry) {
  if (geometry.type === 'LineString') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(transformCoord),
    };
  }
  if (geometry.type === 'MultiLineString') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((line) =>
        line.map(transformCoord),
      ),
    };
  }
  return geometry;
}

function processMrtRoutes(geojson) {
  return geojson.features
    .map((feature) => {
      const routeName = feature.properties?.RouteName;
      const style = MRT_LINE_STYLES[routeName];
      if (!style) return null;

      return {
        type: 'Feature',
        properties: {
          routeName,
          lineId: style.lineId,
          lineName: style.lineName,
          color: style.color,
        },
        geometry: transformGeometry(feature.geometry),
      };
    })
    .filter(Boolean);
}

async function fetchCsv(rid) {
  const url = `https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=${rid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${rid}: ${res.status}`);
  return res.text();
}

async function fetchJson(rid) {
  const url = `https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=${rid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${rid}: ${res.status}`);
  return res.json();
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

  let mrtStations = null;
  try {
    mrtStations = await fetchMrtFromTdx();
    if (mrtStations) {
      console.log(`捷運站（TDX）：${mrtStations.length} 站`);
    }
  } catch (err) {
    console.warn('TDX 捷運站下載失敗，改用臺北市資料大平臺：', err.message);
  }

  if (!mrtStations) {
    console.log('下載臺北捷運車站資料…');
    const mrtCsv = await fetchCsv(MRT_STATION_RID);
    mrtStations = processMrtStations(parseCsv(mrtCsv));
    console.log(`捷運站（data.taipei）：${mrtStations.length} 站`);
  }

  console.log('下載臺北都會區捷運路網圖資…');
  const mrtRouteGeojson = await fetchJson(MRT_ROUTE_RID);
  const mrtRoutes = processMrtRoutes(mrtRouteGeojson);
  console.log(`捷運路網：${mrtRoutes.length} 段`);

  const output = {
    updatedAt: new Date().toISOString(),
    mrtBufferRadiusM: 800,
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
      {
        name: '臺北捷運車站（TDX / 臺北市資料大平臺）',
        url: 'https://data.taipei/dataset/detail?id=1eefa68d-7c8d-491b-8e75-66a161947426',
        license: '政府資料開放授權條款',
      },
      {
        name: '臺北都會區大眾捷運系統路網圖',
        url: 'https://data.taipei/dataset/detail?id=afccd2ac-75b1-4362-9099-45983e332776',
        license: '政府資料開放授權條款',
      },
    ],
    transactions,
    districtIndex,
    mrtStations,
    mrtRoutes,
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
