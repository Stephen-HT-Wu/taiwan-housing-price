/** Pearson correlation on paired finite observations. */
export function pearson(x: number[], y: number[]): number {
  const pairs: [number, number][] = [];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      pairs.push([x[i], y[i]]);
    }
  }
  if (pairs.length < 4) return 0;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const m = pairs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / m;
  const my = ys.reduce((s, v) => s + v, 0) / m;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < m; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : 0;
}

/**
 * Cross-correlation at `lag` months.
 * lag > 0: predictor leads target (predictor[t] vs target[t + lag]).
 * lag < 0: predictor lags target.
 */
export function crossCorrAtLag(
  predictor: number[],
  target: number[],
  lag: number,
): number {
  if (lag > 0) {
    return pearson(
      predictor.slice(0, predictor.length - lag),
      target.slice(lag),
    );
  }
  if (lag < 0) {
    const L = -lag;
    return pearson(
      predictor.slice(L),
      target.slice(0, target.length - L),
    );
  }
  return pearson(predictor, target);
}

export interface LagProfile {
  lag: number;
  correlation: number;
}

export interface LagAnalysis {
  key: string;
  label: string;
  role: IndicatorRole;
  color: string;
  profile: LagProfile[];
  bestLag: number;
  bestCorrelation: number;
  /** If true, higher predictor values associate with lower target. */
  inverse: boolean;
}

export type IndicatorRole = 'leading' | 'coincident' | 'lagging';

export interface IndicatorSpec {
  key: string;
  label: string;
  role: IndicatorRole;
  color: string;
  /** Expected direction when predictor leads housing (+1 or -1). */
  expectedSign: 1 | -1;
  /** How to de-trend before cross-correlation. */
  transform?: TransformMode;
}

export interface FindBestLagOptions {
  role?: IndicatorRole;
  expectedSign?: 1 | -1;
}

/** Pick best lag row from a profile; leading indicators search positive lags only. */
export function pickBestFromProfile(
  profile: LagProfile[],
  options?: FindBestLagOptions,
): LagProfile {
  const positiveLags = profile.filter((p) => p.lag > 0);
  let best = profile[0];

  if (options?.role === 'leading' && positiveLags.length > 0) {
    if ((options.expectedSign ?? 1) < 0) {
      return positiveLags.reduce((a, b) =>
        a.correlation < b.correlation ? a : b,
      );
    }
    return positiveLags.reduce((a, b) =>
      a.correlation > b.correlation ? a : b,
    );
  }

  for (const row of profile) {
    if (Math.abs(row.correlation) > Math.abs(best.correlation)) {
      best = row;
    }
  }
  return best;
}

export function findBestLag(
  predictor: number[],
  target: number[],
  maxLag = 12,
  options?: FindBestLagOptions,
): { lag: number; correlation: number } {
  const profile = buildLagProfile(predictor, target, maxLag);
  const best = pickBestFromProfile(profile, options);
  return { lag: best.lag, correlation: best.correlation };
}

export function buildLagProfile(
  predictor: number[],
  target: number[],
  maxLag: number,
): LagProfile[] {
  const profile: LagProfile[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    profile.push({
      lag,
      correlation: crossCorrAtLag(predictor, target, lag),
    });
  }
  return profile;
}

export function analyzeIndicatorLag(
  spec: IndicatorSpec,
  predictor: number[],
  target: number[],
  maxLag = 12,
  transform: TransformMode = 'yoy',
): LagAnalysis {
  const x = transformSeries(predictor, spec.transform ?? transform);
  const y = transformSeries(target, transform);
  const profile = buildLagProfile(x, y, maxLag);
  const best = pickBestFromProfile(profile, {
    role: spec.role,
    expectedSign: spec.expectedSign,
  });

  const inverse = best.correlation < 0;
  return {
    key: spec.key,
    label: spec.label,
    role: spec.role,
    color: spec.color,
    profile,
    bestLag: best.lag,
    bestCorrelation: best.correlation,
    inverse,
  };
}

/** Align predictor forward in time so peaks line up with target (for chart overlay). */
export function alignPredictorToTarget(
  predictor: number[],
  targetLength: number,
  lagMonths: number,
): (number | null)[] {
  const out: (number | null)[] = Array(targetLength).fill(null);
  for (let t = 0; t < targetLength; t++) {
    const src = t - lagMonths;
    if (
      src >= 0 &&
      src < predictor.length &&
      Number.isFinite(predictor[src])
    ) {
      out[t] = predictor[src];
    }
  }
  return out;
}

export function normalizeMinMax(values: number[]): number[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return values.map(() => NaN);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  return values.map((v) =>
    Number.isFinite(v) ? (v - min) / span : NaN,
  );
}

/** First index where both series have finite values (after transforms). */
export function firstValidIndex(...series: number[][]): number {
  const n = Math.min(...series.map((s) => s.length));
  for (let i = 0; i < n; i++) {
    if (series.every((s) => Number.isFinite(s[i]))) return i;
  }
  return 0;
}

/** Month-over-month percentage change (first month NaN). */
export function monthOverMonthPct(values: number[]): number[] {
  const out: number[] = values.map(() => NaN);
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (prev && Number.isFinite(prev) && Number.isFinite(values[i])) {
      out[i] = (values[i] - prev) / prev;
    }
  }
  return out;
}

/** Year-over-year percentage change (first 12 months NaN). */
export function yearOverYearPct(values: number[]): number[] {
  const out: number[] = values.map(() => NaN);
  for (let i = 12; i < values.length; i++) {
    const prev = values[i - 12];
    if (prev && Number.isFinite(prev) && Number.isFinite(values[i])) {
      out[i] = (values[i] - prev) / prev;
    }
  }
  return out;
}

export type TransformMode = 'level' | 'yoy' | 'mom';

export function transformSeries(values: number[], mode: TransformMode): number[] {
  if (mode === 'yoy') return yearOverYearPct(values);
  if (mode === 'mom') return monthOverMonthPct(values);
  return values;
}

export function zScore(values: number[]): number[] {
  const finite = values.filter((v) => Number.isFinite(v));
  const mean = finite.reduce((s, v) => s + v, 0) / finite.length;
  const variance =
    finite.reduce((s, v) => s + (v - mean) ** 2, 0) / (finite.length - 1);
  const std = Math.sqrt(variance) || 1;
  return values.map((v) => (Number.isFinite(v) ? (v - mean) / std : 0));
}
