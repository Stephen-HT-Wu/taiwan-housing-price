import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MultivariateAnalysis } from '../types';
import {
  axisTicks,
  formatAxisTick,
  seriesToPath,
  valueExtent,
  valueToY,
} from '../lib/chart-axis';
import {
  alignPredictorToTarget,
  buildLagProfile,
  crossCorrAtLag,
  findBestLag,
  firstValidIndex,
} from '../lib/cross-correlation';
import {
  HOUSING_TARGET,
  LAG_EXPLORER_SERIES,
  PTI_QUARTERLY_NOTE,
  getSeriesMeta,
  getSeriesYAxisTitle,
  isHousingPtiPair,
  resolveHousingPtiLag,
} from '../lib/indicator-roles';
import { seriesAsYoy } from '../lib/time-series-values';

const MAX_LAG = 12;

function lagLabel(lag: number, aLabel: string, bLabel: string): string {
  if (lag === 0) return `${aLabel} 與 ${bLabel} 同步（0 月）`;
  if (lag > 0) return `${aLabel} 領先 ${bLabel} ${lag} 個月`;
  return `${aLabel} 落後 ${bLabel} ${-lag} 個月`;
}

interface LagExplorerProps {
  timeSeries: MultivariateAnalysis['timeSeries'];
}

export function LagExplorer({ timeSeries }: LagExplorerProps) {
  const [fromKey, setFromKey] = useState<string>('m2Yoy');
  const [toKey, setToKey] = useState<string>(HOUSING_TARGET.key);
  const [lag, setLag] = useState(6);
  const [invertA, setInvertA] = useState(false);

  const fromYoy = useMemo(
    () => seriesAsYoy(timeSeries, fromKey),
    [timeSeries, fromKey],
  );
  const toYoy = useMemo(
    () => seriesAsYoy(timeSeries, toKey),
    [timeSeries, toKey],
  );

  const fromMeta = getSeriesMeta(fromKey);
  const toMeta = getSeriesMeta(toKey);

  const bestLagOptions = useMemo(() => {
    if (fromMeta?.role === 'leading' && toKey === HOUSING_TARGET.key) {
      return { role: fromMeta.role, expectedSign: fromMeta.expectedSign };
    }
    return undefined;
  }, [fromMeta, toKey]);

  useEffect(() => {
    const raw = findBestLag(fromYoy, toYoy, MAX_LAG, bestLagOptions);
    const bestFit = resolveHousingPtiLag(fromKey, toKey, fromYoy, toYoy, raw);
    setLag(bestFit.lag);
    setInvertA(bestFit.correlation < 0);
  }, [fromKey, toKey, fromYoy, toYoy, bestLagOptions]);

  const profile = useMemo(
    () => buildLagProfile(fromYoy, toYoy, MAX_LAG),
    [fromYoy, toYoy],
  );

  const best = useMemo(() => {
    const raw = findBestLag(fromYoy, toYoy, MAX_LAG, bestLagOptions);
    return resolveHousingPtiLag(fromKey, toKey, fromYoy, toYoy, raw);
  }, [fromYoy, toYoy, bestLagOptions, fromKey, toKey]);

  const correlation = useMemo(() => {
    const base = crossCorrAtLag(fromYoy, toYoy, lag);
    return invertA ? -base : base;
  }, [fromYoy, toYoy, lag, invertA]);

  const sampleCount = useMemo(() => {
    let count = 0;
    const n = Math.min(fromYoy.length, toYoy.length);
    if (lag > 0) {
      for (let i = 0; i < n - lag; i++) {
        const a = invertA ? -fromYoy[i] : fromYoy[i];
        if (Number.isFinite(a) && Number.isFinite(toYoy[i + lag])) count++;
      }
    } else if (lag < 0) {
      const L = -lag;
      for (let i = 0; i < n - L; i++) {
        const a = invertA ? -fromYoy[i + L] : fromYoy[i + L];
        if (Number.isFinite(a) && Number.isFinite(toYoy[i])) count++;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = invertA ? -fromYoy[i] : fromYoy[i];
        if (Number.isFinite(a) && Number.isFinite(toYoy[i])) count++;
      }
    }
    return count;
  }, [fromYoy, toYoy, lag, invertA]);

  const applyBestLag = useCallback(() => {
    setLag(best.lag);
    setInvertA(best.correlation < 0);
  }, [best]);

  const swapFactors = useCallback(() => {
    setFromKey(toKey);
    setToKey(fromKey);
    setLag(-lag);
  }, [fromKey, toKey, lag]);

  const n = timeSeries.length;
  const months = timeSeries.map((r) => r.month);

  const chart = useMemo(() => {
    const w = 720;
    const h = 268;
    const pad = { l: 56, r: 56, t: 24, b: 40 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const plotTop = pad.t;
    const plotBottom = pad.t + plotH;
    const toX = (i: number) => pad.l + (i / (n - 1)) * plotW;

    const aligned = alignPredictorToTarget(fromYoy, n, lag);
    const fromPlot = aligned.map((v) => {
      if (v == null || !Number.isFinite(v)) return NaN;
      return invertA ? -v : v;
    });

    const startIdx = Math.max(
      firstValidIndex(fromYoy, toYoy),
      lag > 0 ? lag : 0,
    );

    const leftSlice = fromPlot.slice(startIdx);
    const rightSlice = toYoy.slice(startIdx);
    const [leftMin, leftMax] = valueExtent(leftSlice);
    const [rightMin, rightMax] = valueExtent(rightSlice);

    const toYLeft = (v: number) => valueToY(v, leftMin, leftMax, plotTop, plotBottom);
    const toYRight = (v: number) => valueToY(v, rightMin, rightMax, plotTop, plotBottom);

    const leftTicks = axisTicks(leftMin, leftMax);
    const rightTicks = axisTicks(rightMin, rightMax);

    const maxAbs = Math.max(...profile.map((p) => Math.abs(p.correlation)), 0.1);
    const sparkY = (r: number) =>
      plotBottom + 16 - ((r + maxAbs) / (2 * maxAbs)) * 10;

    return {
      w,
      h: h + 18,
      plotTop,
      plotBottom,
      pad,
      plotW,
      toPath: seriesToPath(toYoy, startIdx, n, toX, toYRight),
      fromPath: seriesToPath(fromPlot, startIdx, n, toX, toYLeft),
      leftTicks,
      rightTicks,
      leftMin,
      leftMax,
      rightMin,
      rightMax,
      toYLeft,
      toYRight,
      toX,
      profilePoints: profile.map((p) => ({
        lag: p.lag,
        x: pad.l + ((p.lag + MAX_LAG) / (MAX_LAG * 2)) * plotW,
        y: sparkY(p.correlation),
      })),
      lagX: pad.l + ((lag + MAX_LAG) / (MAX_LAG * 2)) * plotW,
      years: months
        .map((month, i) => ({ year: month.slice(0, 4), i }))
        .filter((t, idx, arr) => idx === 0 || t.year !== arr[idx - 1].year),
    };
  }, [n, months, fromYoy, toYoy, lag, invertA, profile]);

  if (n < 14) return null;

  const aLabel = fromMeta?.label ?? fromKey;
  const bLabel = toMeta?.label ?? toKey;
  const leftAxisTitle = getSeriesYAxisTitle(fromKey);
  const rightAxisTitle = getSeriesYAxisTitle(toKey);

  return (
    <div className="lag-explorer">
      <h3>互動 lag 探索器</h3>
      <p className="analysis-note causal-note-tight">
        兩條曲線皆為<strong>年增率（%）</strong>；左軸為因子 A、右軸為因子 B。拖動滑桿平移虛線（A），對齊波峰並觀察
        r。
      </p>

      <div className="lag-explorer-controls">
        <label className="lag-explorer-field">
          <span>因子 A · 左軸</span>
          <select value={fromKey} onChange={(e) => setFromKey(e.target.value)}>
            {LAG_EXPLORER_SERIES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="lag-explorer-swap"
          onClick={swapFactors}
          title="交換 A、B"
        >
          ⇄
        </button>

        <label className="lag-explorer-field">
          <span>因子 B · 右軸</span>
          <select value={toKey} onChange={(e) => setToKey(e.target.value)}>
            {LAG_EXPLORER_SERIES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="lag-explorer-slider-wrap">
        <div className="lag-explorer-slider-header">
          <span className="lag-explorer-status">{lagLabel(lag, aLabel, bLabel)}</span>
          <span className="lag-explorer-stats">
            r = <strong>{correlation >= 0 ? '+' : ''}{correlation.toFixed(3)}</strong>
            {' · '}
            n = {sampleCount}
            {' · '}
            <button type="button" className="lag-explorer-best-btn" onClick={applyBestLag}>
              跳到最佳 lag（{best.lag} 月，r={best.correlation.toFixed(2)}）
            </button>
          </span>
        </div>

        <div className="lag-explorer-slider-row">
          <span className="lag-explorer-slider-cap">A 落後 −{MAX_LAG}</span>
          <input
            type="range"
            className="lag-explorer-slider"
            min={-MAX_LAG}
            max={MAX_LAG}
            step={1}
            value={lag}
            onChange={(e) => setLag(Number(e.target.value))}
            aria-label="調整 A 與 B 的時間差（月）"
          />
          <span className="lag-explorer-slider-cap">A 領先 +{MAX_LAG}</span>
        </div>

        <label className="lag-explorer-invert">
          <input
            type="checkbox"
            checked={invertA}
            onChange={(e) => setInvertA(e.target.checked)}
          />
          A 反向對齊（適用利率：升息對應房價年增率下滑）
        </label>
      </div>

      <div className="lag-explorer-chart">
        <svg viewBox={`0 0 ${chart.w} ${chart.h}`} className="lag-explorer-svg" role="img">
          <title>
            {lagLabel(lag, aLabel, bLabel)}，r={correlation.toFixed(3)}
          </title>

          {chart.leftTicks.map((tick) => (
            <g key={`l-${tick}`}>
              <line
                x1={chart.pad.l}
                y1={chart.toYLeft(tick)}
                x2={chart.pad.l + chart.plotW}
                y2={chart.toYLeft(tick)}
                className="dual-axis-grid"
              />
              <text
                x={chart.pad.l - 6}
                y={chart.toYLeft(tick) + 3}
                textAnchor="end"
                className="dual-axis-tick dual-axis-tick--left"
              >
                {formatAxisTick(tick)}
              </text>
            </g>
          ))}

          {chart.rightTicks.map((tick) => (
            <g key={`r-${tick}`}>
              <text
                x={chart.w - chart.pad.r + 6}
                y={chart.toYRight(tick) + 3}
                textAnchor="start"
                className="dual-axis-tick dual-axis-tick--right"
              >
                {formatAxisTick(tick)}
              </text>
            </g>
          ))}

          <text
            x={14}
            y={(chart.plotTop + chart.plotBottom) / 2}
            transform={`rotate(-90, 14, ${(chart.plotTop + chart.plotBottom) / 2})`}
            className="dual-axis-title dual-axis-title--left"
          >
            {leftAxisTitle}
          </text>
          <text
            x={chart.w - 14}
            y={(chart.plotTop + chart.plotBottom) / 2}
            transform={`rotate(90, ${chart.w - 14}, ${(chart.plotTop + chart.plotBottom) / 2})`}
            className="dual-axis-title dual-axis-title--right"
          >
            {rightAxisTitle}
          </text>

          <path
            d={chart.toPath}
            fill="none"
            stroke={toMeta?.color ?? '#f46d43'}
            strokeWidth={3}
            opacity={0.95}
          />
          <path
            d={chart.fromPath}
            fill="none"
            stroke={fromMeta?.color ?? '#3d8bfd'}
            strokeWidth={2.5}
            strokeDasharray="7 5"
            opacity={0.85}
          />

          {chart.profilePoints.map((p) => (
            <circle
              key={p.lag}
              cx={p.x}
              cy={p.y}
              r={p.lag === lag ? 4 : 2}
              fill={p.lag === lag ? '#fbbf24' : 'rgba(139,156,179,0.7)'}
            />
          ))}
          <line
            x1={chart.lagX}
            y1={chart.h - 22}
            x2={chart.lagX}
            y2={chart.h - 10}
            stroke="#fbbf24"
            strokeWidth={2}
          />
          {chart.years.map((t) => (
            <text
              key={t.year}
              x={chart.toX(t.i)}
              y={chart.h - 4}
              className="lag-axis-label"
              textAnchor="middle"
            >
              {t.year}
            </text>
          ))}
        </svg>
        <div className="lag-explorer-legend">
          <span>
            <span
              className="aligned-swatch aligned-swatch--solid"
              style={{ background: toMeta?.color ?? '#f46d43' }}
            />
            {bLabel}（右軸）
          </span>
          <span>
            <span
              className="aligned-swatch aligned-swatch--dashed"
              style={{ borderColor: fromMeta?.color ?? '#3d8bfd' }}
            />
            {aLabel}（左軸，依滑桿對齊）
          </span>
          <span className="lag-explorer-spark-hint">底部小點：各 lag 的 r</span>
        </div>
      </div>

      {isHousingPtiPair(fromKey, toKey) ? (
        <p className="analysis-note causal-note-tight">{PTI_QUARTERLY_NOTE}</p>
      ) : null}

      <details className="lag-explorer-help">
        <summary>怎麼用滑桿？</summary>
        <ul>
          <li>
            <strong>往右拖（正數）</strong>：假設 A 更早發生。例如 +6 代表「6 個月前的
            M2 年增率對上今天的房價年增率」。
          </li>
          <li>
            <strong>往左拖（負數）</strong>：假設 A 較晚發生（A 落後 B）。
          </li>
          <li>左右軸刻度不同屬正常，請用各自單位讀數；對齊時看形狀與 r。</li>
          <li>利率類若方向相反，勾選「反向對齊」再拖動。</li>
        </ul>
      </details>
    </div>
  );
}
