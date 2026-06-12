import type { HousingDataset } from '../types';

export async function loadHousingData(): Promise<HousingDataset> {
  const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
  const res = await fetch(`/data/taipei-housing.json${cacheBust}`);
  if (!res.ok) {
    throw new Error('無法載入房價資料，請先執行 npm run fetch-data');
  }

  const data = (await res.json()) as HousingDataset;
  if (!data.mrtRoutes?.length) {
    throw new Error('缺少捷運路網資料，請執行 npm run fetch-data 後重新整理頁面');
  }
  return data;
}

export function filterTransactions(
  data: HousingDataset,
  options: {
    districts?: string[];
    minPrice?: number;
    maxPrice?: number;
    buildingTypes?: string[];
  },
) {
  return data.transactions.filter((t) => {
    if (options.districts?.length && !options.districts.includes(t.district)) {
      return false;
    }
    if (options.minPrice !== undefined && t.pricePerPing < options.minPrice) {
      return false;
    }
    if (options.maxPrice !== undefined && t.pricePerPing > options.maxPrice) {
      return false;
    }
    if (options.buildingTypes?.length) {
      const match = options.buildingTypes.some((bt) =>
        t.buildingType.includes(bt),
      );
      if (!match) return false;
    }
    return true;
  });
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function getPriceStats(points: { pricePerPing: number }[]) {
  if (!points.length) return { min: 0, max: 0, median: 0, count: 0 };

  const prices = points.map((p) => p.pricePerPing).sort((a, b) => a - b);
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    median: percentile(prices, 50),
    count: prices.length,
  };
}

/** 穩健色階：用 P5–P95 避免極端成交價壓縮大部分點的顏色 */
export function getRobustColorDomain(
  points: { pricePerPing: number }[],
  lowPct = 5,
  highPct = 95,
) {
  const prices = points.map((p) => p.pricePerPing).sort((a, b) => a - b);
  if (!prices.length) {
    return {
      colorMin: 0,
      colorMax: 100,
      actualMin: 0,
      actualMax: 100,
      median: 0,
      outlierCount: 0,
      isOutlier: () => false,
    };
  }

  const colorMin = percentile(prices, lowPct);
  const colorMax = percentile(prices, highPct);
  const isOutlier = (v: number) => v < colorMin || v > colorMax;

  return {
    colorMin,
    colorMax: colorMax <= colorMin ? colorMin + 1 : colorMax,
    actualMin: prices[0],
    actualMax: prices[prices.length - 1],
    median: percentile(prices, 50),
    outlierCount: prices.filter(isOutlier).length,
    isOutlier,
  };
}

export function winsorizePrice(
  price: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, price));
}

export const TAIPEI_DISTRICTS = [
  '中正區',
  '大同區',
  '中山區',
  '松山區',
  '大安區',
  '萬華區',
  '信義區',
  '士林區',
  '北投區',
  '內湖區',
  '南港區',
  '文山區',
] as const;
