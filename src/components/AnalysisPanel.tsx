import { useMemo, useState } from 'react';
import type { MultivariateAnalysis } from '../types';
import { formatPct } from '../lib/analysis';
import { MACRO_TIMELINE_EVENTS, type TimelineEvent } from '../lib/timeline-events';

interface AnalysisPanelProps {
  data: MultivariateAnalysis;
}

const CORR_LABELS: Record<string, string> = {
  housing_unit_price: '住宅單價',
  housing_index: '住宅指數',
  taiex_close: '台股指數',
  taiex_return: '台股報酬',
  rediscount_rate: '重貼現率',
  mortgage_rate: '房貸利率',
  m2_level: 'M2 總數',
  m2_log: 'log(M2)',
  m2_yoy: 'M2 年增率',
  usd_twd: '美元／台幣',
  fed_funds_rate: '美國基準利率',
  fed_assets_bn: 'Fed 資產(Bn)',
  cpi_index: 'CPI 指數',
  cpi_inflation: '通膨率',
  price_to_income_ratio: '房價所得比（全國）',
  national_housing_index: '全國住宅價格指數',
};

export function AnalysisPanel({ data }: AnalysisPanelProps) {
  const maxPartial = Math.max(...data.variables.map((v) => v.partialR2), 0.01);

  return (
    <div className="analysis">
      <header className="analysis-header">
        <h1>多元變量分析</h1>
        <p className="analysis-subtitle">{data.description}</p>
        <p className="analysis-meta">
          樣本期間：{data.period.start} — {data.period.end}（{data.observations} 個月）
          <br />
          應變數：{data.dependentVariable.label}
        </p>
      </header>

      <section className="analysis-section model-summary">
        <h2>模型解釋力</h2>
        <div className="model-stats">
          <div className="model-stat">
            <span className="model-stat-value">{formatPct(data.model.r2)}</span>
            <span className="model-stat-label">R²</span>
          </div>
          <div className="model-stat">
            <span className="model-stat-value">{formatPct(data.model.adjR2)}</span>
            <span className="model-stat-label">調整後 R²</span>
          </div>
        </div>
        <p className="analysis-note">
          調整後 R² 表示在納入台股、房貸利率、M2 與美國利率後，能解釋的房價變異比例。
        </p>
      </section>

      <section className="analysis-section">
        <h2>各變數邊際解釋力（Partial R²）</h2>
        <p className="analysis-note">
          數值越高，代表在控制其他變數後，該因素對房價仍有較高解釋力。
        </p>
        <div className="importance-list">
          {data.variables.map((v) => (
            <div key={v.id} className="importance-row">
              <div className="importance-label">{v.label}</div>
              <div className="importance-bar-wrap">
                <div
                  className="importance-bar"
                  style={{ width: `${(v.partialR2 / maxPartial) * 100}%` }}
                />
              </div>
              <div className="importance-pct">{formatPct(v.partialR2)}</div>
              <div className="importance-coef">
                β={v.coefficient.toFixed(4)}
                {' · '}
                標準化 {v.stdCoefficient.toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="analysis-section">
        <h2>相關係數矩陣</h2>
        <div className="corr-wrap">
          <table className="corr-table">
            <thead>
              <tr>
                <th />
                {Object.keys(CORR_LABELS).map((k) => (
                  <th key={k}>{CORR_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(CORR_LABELS).map(([rowKey, rowLabel]) => (
                <tr key={rowKey}>
                  <th>{rowLabel}</th>
                  {Object.keys(CORR_LABELS).map((colKey) => {
                    const r = data.correlation[rowKey]?.[colKey] ?? 0;
                    const intensity = Math.abs(r);
                    return (
                      <td
                        key={colKey}
                        style={{
                          background: `rgba(61, 139, 253, ${intensity * 0.55})`,
                          color: intensity > 0.5 ? '#fff' : 'inherit',
                        }}
                      >
                        {r.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analysis-section">
        <h2>時間序列（標準化趨勢）</h2>
        <p className="analysis-note">
          各指標為標準化趨勢（半透明線條）；可勾選圖例顯示或隱藏。垂直虛線為重大事件。
          全國住宅價格指數（105年＝100）與房價所得比為內政部季資料，季內月份取同值；臺北住宅單價為北市月指數。
        </p>
        <TrendChart data={data.timeSeries} events={MACRO_TIMELINE_EVENTS} />
      </section>

      <section className="analysis-section caveats">
        <h2>注意事項</h2>
        <ul>
          {data.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <h3>資料來源</h3>
        <ul className="source-list">
          {data.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function normalizeSeries(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v) => (v - min) / span);
}

type TimeSeriesRow = MultivariateAnalysis['timeSeries'][number];
type NumericSeriesKey = {
  [K in keyof TimeSeriesRow]: TimeSeriesRow[K] extends number | null ? K : never;
}[keyof TimeSeriesRow];

function filledSeries(data: MultivariateAnalysis['timeSeries'], key: NumericSeriesKey): number[] {
  let last = 0;
  return data.map((row) => {
    const v = row[key];
    if (typeof v === 'number' && !Number.isNaN(v)) last = v;
    return last;
  });
}

function monthToX(
  month: string,
  months: string[],
  plotLeft: number,
  plotWidth: number,
): number | null {
  const idx = months.indexOf(month);
  if (idx < 0 || months.length < 2) return null;
  return plotLeft + (idx / (months.length - 1)) * plotWidth;
}

function getYearAxisTicks(
  months: string[],
  plotLeft: number,
  plotWidth: number,
): { year: string; x: number }[] {
  if (months.length < 2) return [];

  const ticks: { year: string; x: number }[] = [];
  let lastYear = '';

  months.forEach((month, i) => {
    const year = month.slice(0, 4);
    if (year === lastYear) return;
    lastYear = year;
    ticks.push({
      year,
      x: plotLeft + (i / (months.length - 1)) * plotWidth,
    });
  });

  return ticks;
}

const TREND_SERIES = [
  { key: 'nationalHousingIndex', label: '全國住宅價格指數', color: '#f46d43' },
  { key: 'housingUnitPrice', label: '臺北住宅單價', color: '#fb7185' },
  { key: 'taiexClose', label: '台股', color: '#3d8bfd' },
  { key: 'm2Level', label: 'M2 總數', color: '#f472b6' },
  { key: 'm2Log', label: 'log(M2)', color: '#fb923c' },
  { key: 'm2Yoy', label: 'M2 年增率', color: '#eab308' },
  { key: 'cpiInflation', label: '通膨率', color: '#ef4444' },
  { key: 'cpiIndex', label: 'CPI 指數', color: '#f87171' },
  { key: 'mortgageRate', label: '房貸利率', color: '#a855f7' },
  { key: 'fedFundsRate', label: '美國基準利率', color: '#22c55e' },
  { key: 'priceToIncomeRatio', label: '房價所得比（全國）', color: '#14b8a6' },
] as const;

type TrendSeriesKey = (typeof TREND_SERIES)[number]['key'];

const DEFAULT_VISIBLE: Record<TrendSeriesKey, boolean> = {
  nationalHousingIndex: true,
  housingUnitPrice: false,
  taiexClose: true,
  m2Level: false,
  m2Log: false,
  m2Yoy: true,
  cpiInflation: true,
  cpiIndex: false,
  mortgageRate: true,
  fedFundsRate: true,
  priceToIncomeRatio: true,
};

function TrendChart({
  data,
  events,
}: {
  data: MultivariateAnalysis['timeSeries'];
  events: TimelineEvent[];
}) {
  const w = 720;
  const eventBandH = 56;
  const plotH = 200;
  const axisH = 28;
  const totalH = eventBandH + plotH + axisH;
  const padX = 28;
  const padY = 20;
  const n = data.length;
  if (n < 2) return null;

  const months = data.map((d) => d.month);
  const plotLeft = padX;
  const plotWidth = w - padX * 2;
  const plotTop = eventBandH;
  const plotBottom = plotTop + plotH - padY;
  const axisY = plotTop + plotH;
  const yearTicks = getYearAxisTicks(months, plotLeft, plotWidth);
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);

  const paths = useMemo(
    () =>
      TREND_SERIES.map((s) => {
        const values = filledSeries(data, s.key);
        const norm = normalizeSeries(values);
        const points = norm.map((v, i) => {
          const x = plotLeft + (i / (n - 1)) * plotWidth;
          const y = plotBottom - v * (plotBottom - plotTop - padY);
          return `${x},${y}`;
        });
        return { ...s, d: `M ${points.join(' L ')}` };
      }),
    [data, n, plotBottom, plotLeft, plotTop, plotWidth],
  );

  const toggleSeries = (key: TrendSeriesKey) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const placedEvents = events
    .map((event, i) => {
      const x = monthToX(event.month, months, plotLeft, plotWidth);
      if (x === null) return null;
      return { ...event, x, lane: i % 2 };
    })
    .filter((e): e is TimelineEvent & { x: number; lane: number } => e !== null);

  return (
    <div className="trend-chart">
      <div className="trend-chart-plot">
        <svg viewBox={`0 0 ${w} ${totalH}`} className="trend-svg" role="img">
          <title>2018–2026 全國房價指數、台股、M2、房貸與美國利率標準化趨勢</title>
          {paths.map((p) =>
            visible[p.key] ? (
              <path
                key={p.key}
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth="2.5"
                strokeOpacity={0.72}
                className="trend-series-path"
              />
            ) : null,
          )}
          {placedEvents.map((event) => (
            <g key={event.month} className="trend-event" aria-hidden="true">
              <line
                x1={event.x}
                y1={plotTop}
                x2={event.x}
                y2={plotBottom}
                className="trend-event-line"
              />
              <circle
                cx={event.x}
                cy={plotTop}
                r={4}
                className="trend-event-dot"
              />
              <text
                x={event.x}
                y={event.lane === 0 ? 14 : 34}
                textAnchor="middle"
                className="trend-event-label"
              >
                {event.shortLabel}
              </text>
            </g>
          ))}
          <g className="trend-axis" aria-hidden="true">
            <line
              x1={plotLeft}
              y1={axisY}
              x2={plotLeft + plotWidth}
              y2={axisY}
              className="trend-axis-line"
            />
            {yearTicks.map((tick, i) => {
              const anchor =
                i === 0
                  ? 'start'
                  : i === yearTicks.length - 1
                    ? 'end'
                    : 'middle';
              return (
                <g key={tick.year}>
                  <line
                    x1={tick.x}
                    y1={plotBottom}
                    x2={tick.x}
                    y2={axisY}
                    className="trend-axis-grid"
                  />
                  <line
                    x1={tick.x}
                    y1={axisY}
                    x2={tick.x}
                    y2={axisY + 5}
                    className="trend-axis-tick"
                  />
                  <text
                    x={tick.x}
                    y={axisY + 18}
                    textAnchor={anchor}
                    className="trend-axis-label"
                  >
                    {tick.year}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="trend-event-layer">
          {placedEvents.map((event) => (
            <button
              key={event.month}
              type="button"
              className="trend-event-hit"
              style={{ left: `${(event.x / w) * 100}%` }}
              aria-label={`${event.month}：${event.label}`}
            >
              <span className="trend-event-tip">
                <strong>{event.month}</strong> {event.label}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="trend-legend">
        {TREND_SERIES.map((s) => (
          <label
            key={s.key}
            className={`trend-legend-item trend-legend-toggle${visible[s.key] ? '' : ' trend-legend-item--off'}`}
          >
            <input
              type="checkbox"
              checked={visible[s.key]}
              onChange={() => toggleSeries(s.key)}
            />
            <span
              className="trend-swatch"
              style={{
                background: s.color,
                opacity: visible[s.key] ? 0.72 : 0.35,
              }}
            />
            {s.label}
          </label>
        ))}
        <span className="trend-legend-item trend-legend-events">
          <span className="trend-swatch trend-event-swatch" />
          大事件
        </span>
      </div>
      <ul className="trend-event-list">
        {placedEvents.map((event) => (
          <li key={event.month}>
            <span className="trend-event-list-date">{event.month}</span>
            <span className="trend-event-list-label">{event.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
