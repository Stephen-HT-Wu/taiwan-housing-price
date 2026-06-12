import type { MultivariateAnalysis } from '../types';

export async function loadMultivariateAnalysis(): Promise<MultivariateAnalysis> {
  const cacheBust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
  const res = await fetch(`/data/multivariate-analysis.json${cacheBust}`);
  if (!res.ok) {
    throw new Error('缺少多元分析結果，請執行 npm run fetch-analysis');
  }
  return res.json() as Promise<MultivariateAnalysis>;
}

export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
