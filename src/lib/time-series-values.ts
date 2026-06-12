import type { MultivariateAnalysis } from '../types';
import { transformSeries } from './cross-correlation';
import { getSeriesTransform } from './indicator-roles';

type TimeSeriesRow = MultivariateAnalysis['timeSeries'][number];
export type NumericSeriesKey = {
  [K in keyof TimeSeriesRow]: TimeSeriesRow[K] extends number | null ? K : never;
}[keyof TimeSeriesRow];

export function filledSeries(
  data: MultivariateAnalysis['timeSeries'],
  key: NumericSeriesKey,
): number[] {
  let last = NaN;
  return data.map((row) => {
    const v = row[key];
    if (typeof v === 'number' && !Number.isNaN(v)) last = v;
    return last;
  });
}

/** 年增率（或已是比率之序列）用於圖表與 lag 分析 */
export function seriesAsYoy(
  data: MultivariateAnalysis['timeSeries'],
  key: string,
): number[] {
  return transformSeries(
    filledSeries(data, key as NumericSeriesKey),
    getSeriesTransform(key),
  );
}
