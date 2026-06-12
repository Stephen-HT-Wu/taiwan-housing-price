import {
  crossCorrAtLag,
  type IndicatorSpec,
  type TransformMode,
} from './cross-correlation';

/** Predictors vs 全國住宅價格指數；房價所得比為落後結果變數。 */
export const HOUSING_TARGET = {
  key: 'nationalHousingIndex',
  label: '全國住宅價格指數',
  color: '#f46d43',
} as const;

export const PTI_KEY = 'priceToIncomeRatio' as const;

/** 所得比為季資料展月，與房價指數視為同步（0 月 lag）。 */
export const HOUSING_PTI_LAG = 0;

export const PTI_QUARTERLY_NOTE =
  '房價所得比為季資料（月內同值展開），與全國房價指數宜視為同步，不宜解讀為精確月 lag。';

export function isHousingPtiPair(fromKey: string, toKey: string): boolean {
  return (
    (fromKey === HOUSING_TARGET.key && toKey === PTI_KEY) ||
    (fromKey === PTI_KEY && toKey === HOUSING_TARGET.key)
  );
}

/** Lag 探索器：房價 ↔ 所得比固定同步，r 取 lag 0。 */
export function resolveHousingPtiLag(
  fromKey: string,
  toKey: string,
  fromSeries: number[],
  toSeries: number[],
  raw: { lag: number; correlation: number },
): { lag: number; correlation: number } {
  if (isHousingPtiPair(fromKey, toKey)) {
    return {
      lag: HOUSING_PTI_LAG,
      correlation: crossCorrAtLag(fromSeries, toSeries, HOUSING_PTI_LAG),
    };
  }
  return raw;
}

export const CAUSAL_INDICATORS: IndicatorSpec[] = [
  {
    key: 'fedFundsRate',
    label: '美國基準利率',
    role: 'leading',
    color: '#22c55e',
    expectedSign: -1,
  },
  {
    key: 'mortgageRate',
    label: '房貸利率',
    role: 'leading',
    color: '#a855f7',
    expectedSign: -1,
  },
  {
    key: 'm2Yoy',
    label: 'M2 年增率',
    role: 'leading',
    color: '#eab308',
    expectedSign: 1,
    transform: 'level',
  },
  {
    key: 'taiexClose',
    label: '台股加權',
    role: 'coincident',
    color: '#3d8bfd',
    expectedSign: 1,
  },
  {
    key: 'cpiInflation',
    label: '通膨率',
    role: 'coincident',
    color: '#ef4444',
    expectedSign: 1,
    transform: 'level',
  },
];

export const LAGGING_OUTCOMES: IndicatorSpec[] = [
  {
    key: 'nationalHousingIndex',
    label: '全國住宅價格指數',
    role: 'lagging',
    color: '#f46d43',
    expectedSign: 1,
  },
  {
    key: 'priceToIncomeRatio',
    label: '房價所得比',
    role: 'lagging',
    color: '#14b8a6',
    expectedSign: 1,
  },
];

export interface TransmissionLink {
  from: string;
  to: string;
  label: string;
  months: string;
}

/** Conceptual transmission chain (lags filled from data in panel). */
export const TRANSMISSION_CHAIN: Omit<TransmissionLink, 'months'>[] = [
  { from: 'fedFundsRate', to: 'mortgageRate', label: '政策傳導' },
  { from: 'mortgageRate', to: 'nationalHousingIndex', label: '融資成本' },
  { from: 'm2Yoy', to: 'nationalHousingIndex', label: '流動性' },
  { from: 'taiexClose', to: 'nationalHousingIndex', label: '財富效應' },
  { from: 'nationalHousingIndex', to: 'priceToIncomeRatio', label: '負擔惡化' },
];

export const ROLE_LABELS: Record<string, string> = {
  leading: '領先指標',
  coincident: '同步指標',
  lagging: '落後指標',
};

/** 互動 lag 探索器可選序列 */
export const LAG_EXPLORER_SERIES = [
  ...CAUSAL_INDICATORS,
  ...LAGGING_OUTCOMES,
  {
    key: 'housingUnitPrice',
    label: '臺北住宅單價',
    role: 'lagging' as const,
    color: '#fb7185',
    expectedSign: 1 as const,
  },
];

export function getSeriesTransform(key: string): TransformMode {
  const spec = LAG_EXPLORER_SERIES.find((s) => s.key === key);
  return spec?.transform ?? 'yoy';
}

export function getSeriesMeta(key: string) {
  return LAG_EXPLORER_SERIES.find((s) => s.key === key);
}

/** 雙 Y 軸標題：序列名稱＋單位 */
export function getSeriesYAxisTitle(key: string): string {
  const label = getSeriesMeta(key)?.label ?? key;
  if (key === 'cpiInflation') return `${label}（%）`;
  if (getSeriesTransform(key) === 'level') return `${label}（%）`;
  return `${label}年增率（%）`;
}

/** 時間序列趨勢圖用（皆為年增率或已是比率） */
export const TREND_CHART_SERIES = [
  { key: 'nationalHousingIndex', label: '全國房價指數年增率', color: '#f46d43' },
  { key: 'housingUnitPrice', label: '臺北住宅單價年增率', color: '#fb7185' },
  { key: 'taiexClose', label: '台股年增率', color: '#3d8bfd' },
  { key: 'm2Yoy', label: 'M2 年增率', color: '#eab308' },
  { key: 'cpiInflation', label: '通膨率', color: '#ef4444' },
  { key: 'mortgageRate', label: '房貸利率年變動', color: '#a855f7' },
  { key: 'fedFundsRate', label: '美國利率年變動', color: '#22c55e' },
  { key: 'priceToIncomeRatio', label: '房價所得比年增率', color: '#14b8a6' },
] as const;

export const ROLE_HINTS: Record<string, string> = {
  leading: '變動通常先於房價出現（政策、利率、貨幣）',
  coincident: '全國房價為對照基準；與房價同步或僅領先數月',
  lagging: '房價變動後才反映，或統計上落後於房價',
};
