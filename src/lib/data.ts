import type { HousingDataset } from '../types';

let cached: HousingDataset | null = null;

export async function loadHousingData(): Promise<HousingDataset> {
  if (cached) return cached;

  const res = await fetch('/data/taipei-housing.json');
  if (!res.ok) {
    throw new Error('無法載入房價資料，請先執行 npm run fetch-data');
  }

  cached = (await res.json()) as HousingDataset;
  return cached;
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

export function getPriceStats(points: { pricePerPing: number }[]) {
  if (!points.length) return { min: 0, max: 0, median: 0, count: 0 };

  const prices = points.map((p) => p.pricePerPing).sort((a, b) => a - b);
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    median: prices[Math.floor(prices.length / 2)],
    count: prices.length,
  };
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
