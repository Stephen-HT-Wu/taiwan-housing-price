import type { MultivariateAnalysis } from '../types';
import { formatPct } from '../lib/analysis';

interface AnalysisPanelProps {
  data: MultivariateAnalysis;
}

const CORR_LABELS: Record<string, string> = {
  housing_unit_price: '住宅單價',
  housing_index: '住宅指數',
  taiex_close: '台股指數',
  taiex_return: '台股報酬',
  rediscount_rate: '重貼現率',
  transaction_count: '成交量',
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
          調整後 R² 表示在納入台股、利率、成交量後，能解釋的房價變異比例。
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
        <TrendChart data={data.timeSeries} />
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

function TrendChart({
  data,
}: {
  data: MultivariateAnalysis['timeSeries'];
}) {
  const w = 720;
  const h = 200;
  const pad = 24;
  const n = data.length;
  if (n < 2) return null;

  const series = [
    { key: 'housingUnitPrice', label: '住宅單價', color: '#f46d43' },
    { key: 'taiexClose', label: '台股', color: '#3d8bfd' },
    { key: 'rediscountRate', label: '重貼現率', color: '#a855f7' },
    { key: 'transactionCount', label: '成交量', color: '#22c55e' },
  ] as const;

  const paths = series.map((s) => {
    const values = data.map((d) => d[s.key] as number);
    const norm = normalizeSeries(values);
    const points = norm.map((v, i) => {
      const x = pad + (i / (n - 1)) * (w - pad * 2);
      const y = h - pad - v * (h - pad * 2);
      return `${x},${y}`;
    });
    return { ...s, d: `M ${points.join(' L ')}` };
  });

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="trend-svg">
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2" />
        ))}
      </svg>
      <div className="trend-legend">
        {paths.map((p) => (
          <span key={p.key} className="trend-legend-item">
            <span className="trend-swatch" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>
      <div className="trend-range">
        <span>{data[0].month}</span>
        <span>{data[data.length - 1].month}</span>
      </div>
    </div>
  );
}
