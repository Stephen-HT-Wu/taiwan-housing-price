import { useMemo } from 'react';
import type { MultivariateAnalysis } from '../types';
import {
  alignPredictorToTarget,
  analyzeIndicatorLag,
  crossCorrAtLag,
  findBestLag,
  firstValidIndex,
  normalizeMinMax,
  transformSeries,
  type LagAnalysis,
} from '../lib/cross-correlation';
import { LagExplorer } from './LagExplorer';
import {
  CAUSAL_INDICATORS,
  HOUSING_TARGET,
  PTI_KEY,
  PTI_QUARTERLY_NOTE,
  HOUSING_PTI_LAG,
  LAGGING_OUTCOMES,
  ROLE_HINTS,
  ROLE_LABELS,
  TRANSMISSION_CHAIN,
  getSeriesMeta,
  getSeriesTransform,
  type TransmissionLink,
} from '../lib/indicator-roles';

type TimeSeriesRow = MultivariateAnalysis['timeSeries'][number];
type NumericKey = {
  [K in keyof TimeSeriesRow]: TimeSeriesRow[K] extends number | null ? K : never;
}[keyof TimeSeriesRow];

function filledSeries(
  data: MultivariateAnalysis['timeSeries'],
  key: NumericKey,
): number[] {
  let last = NaN;
  return data.map((row) => {
    const v = row[key];
    if (typeof v === 'number' && !Number.isNaN(v)) last = v;
    return last;
  });
}

function validSeries(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

function lagLabel(lag: number): string {
  if (lag === 0) return '同步（0 月）';
  if (lag > 0) return `領先 ${lag} 月`;
  return `落後 ${-lag} 月`;
}

/** 箭頭左為領先、右為落後；統計 lag 為負時對調節點。 */
function normalizeTransmissionLink(
  link: Omit<TransmissionLink, 'months'>,
  bestLag: number,
): TransmissionLink {
  let from = link.from;
  let to = link.to;
  let lag = bestLag;
  if (lag < 0) {
    [from, to] = [to, from];
    lag = -lag;
  }
  return {
    ...link,
    from,
    to,
    months: lagLabel(lag),
  };
}

function formatR(r: number): string {
  const sign = r >= 0 ? '+' : '';
  return `${sign}${r.toFixed(2)}`;
}

interface CausalIndicatorsPanelProps {
  timeSeries: MultivariateAnalysis['timeSeries'];
}

export function CausalIndicatorsPanel({ timeSeries }: CausalIndicatorsPanelProps) {
  const target = useMemo(
    () => validSeries(filledSeries(timeSeries, HOUSING_TARGET.key as NumericKey)),
    [timeSeries],
  );

  const predictorAnalyses = useMemo(() => {
    const tgt = filledSeries(timeSeries, HOUSING_TARGET.key as NumericKey);
    return CAUSAL_INDICATORS.map((spec) =>
      analyzeIndicatorLag(
        spec,
        filledSeries(timeSeries, spec.key as NumericKey),
        tgt,
      ),
    );
  }, [timeSeries]);

  const ptiAnalysis = useMemo(() => {
    const housing = filledSeries(timeSeries, 'nationalHousingIndex');
    const pti = filledSeries(timeSeries, 'priceToIncomeRatio');
    const spec = LAGGING_OUTCOMES[1];
    const housingYoy = transformSeries(housing, 'yoy');
    const ptiYoy = transformSeries(pti, 'yoy');
    const r0 = crossCorrAtLag(housingYoy, ptiYoy, HOUSING_PTI_LAG);
    return {
      key: spec.key,
      label: spec.label,
      role: spec.role,
      color: spec.color,
      profile: [],
      bestLag: HOUSING_PTI_LAG,
      bestCorrelation: r0,
      inverse: r0 < 0,
    };
  }, [timeSeries]);

  const transmissionLinks = useMemo((): TransmissionLink[] => {
    return TRANSMISSION_CHAIN.map((link) => {
      if (
        link.from === HOUSING_TARGET.key &&
        link.to === PTI_KEY
      ) {
        return { ...link, months: lagLabel(ptiAnalysis.bestLag) };
      }

      const fromSeries = transformSeries(
        filledSeries(timeSeries, link.from as NumericKey),
        getSeriesTransform(link.from),
      );
      const toSeries = transformSeries(
        filledSeries(timeSeries, link.to as NumericKey),
        getSeriesTransform(link.to),
      );
      const fromMeta = getSeriesMeta(link.from);
      const { lag: bestLag } = findBestLag(fromSeries, toSeries, 12, fromMeta
        ? { role: fromMeta.role, expectedSign: fromMeta.expectedSign }
        : undefined);
      return normalizeTransmissionLink(link, bestLag);
    });
  }, [timeSeries, ptiAnalysis]);

  const alignLeaders = useMemo(
    () =>
      predictorAnalyses
        .filter(
          (a) =>
            a.role === 'leading' &&
            a.bestLag > 0 &&
            Math.abs(a.bestCorrelation) >= 0.25,
        )
        .sort((a, b) => Math.abs(b.bestCorrelation) - Math.abs(a.bestCorrelation))
        .slice(0, 3),
    [predictorAnalyses],
  );

  if (target.length < 12) return null;

  return (
    <section className="analysis-section causal-section">
      <h2>領先／同步／落後：房價傳導機制</h2>
      <p className="analysis-note">
        以<strong>全國住宅價格指數</strong>為落後標的，對各序列取<strong>年增率</strong>後計算
        Pearson 交叉相關（避免長期趨勢造成假性領先）。正 lag 代表該指標變動<strong>先於</strong>
        房價出現。此為統計上的時間先後關係，不等於嚴格因果。
      </p>

      <CausalTierDiagram
        analyses={predictorAnalyses}
        ptiAnalysis={ptiAnalysis}
      />

      <TransmissionFlow links={transmissionLinks} />

      <div className="causal-grid">
        <div className="causal-grid-main">
          <h3>領先指標時間對齊（預警疊圖）</h3>
          <p className="analysis-note causal-note-tight">
            實線為全國房價指數<strong>年增率</strong>；虛線為領先指標依最佳 lag
            對齊（利率類若反向相關會先取負值再畫）。年增率前 12 個月無資料故不繪製。
          </p>
          {alignLeaders.length > 0 ? (
            <AlignedOverlayChart
              timeSeries={timeSeries}
              targetKey={HOUSING_TARGET.key as NumericKey}
              leaders={alignLeaders}
            />
          ) : (
            <p className="analysis-note">樣本內領先指標與房價年增率之相關 lag 不足，請使用下方互動 lag 探索器。</p>
          )}
        </div>
        <div className="causal-grid-side">
          <h3>最佳時間差一覽</h3>
          <LagSummaryTable analyses={predictorAnalyses} pti={ptiAnalysis} />
        </div>
      </div>

      <LagExplorer timeSeries={timeSeries} />

      <div className="causal-insight-box">
        <h3>如何解讀</h3>
        <ul>
          <li>
            <strong>領先指標</strong>（美國利率、房貸、M2）：政策與流動性先動，房價約{' '}
            {summarizeTypicalLag(predictorAnalyses.filter((a) => a.role === 'leading'))}{' '}
            後跟上。
          </li>
          <li>
            <strong>同步指標</strong>：全國住宅價格指數為對照基準；統計上與房價同步或僅領先數月的變數歸於此欄。
          </li>
          <li>
            <strong>落後指標</strong>：交叉相關顯示落後於房價者（如台股、通膨）。{PTI_QUARTERLY_NOTE}
          </li>
          <li>
            2022 升息後房貸利率領先、2024 後房價回落，符合「緊縮先、價格後修」的傳導順序。
          </li>
        </ul>
      </div>
    </section>
  );
}

function summarizeTypicalLag(analyses: LagAnalysis[]): string {
  const positive = analyses.filter((a) => a.bestLag > 0);
  if (positive.length === 0) return '數';
  const avg = Math.round(
    positive.reduce((s, a) => s + a.bestLag, 0) / positive.length,
  );
  return `${avg}–${avg + 3}`;
}

function CausalTierDiagram({
  analyses,
  ptiAnalysis,
}: {
  analyses: LagAnalysis[];
  ptiAnalysis: LagAnalysis;
}) {
  const housingRef: LagAnalysis = {
    key: HOUSING_TARGET.key,
    label: HOUSING_TARGET.label,
    color: HOUSING_TARGET.color,
    role: 'coincident',
    bestLag: 0,
    bestCorrelation: 1,
    inverse: false,
    profile: [],
  };

  const ptiItem: LagAnalysis = {
    key: PTI_KEY,
    label: '房價所得比',
    color: '#14b8a6',
    role: 'coincident',
    bestLag: ptiAnalysis.bestLag,
    bestCorrelation: ptiAnalysis.bestCorrelation,
    inverse: ptiAnalysis.inverse,
    profile: [],
  };

  const tiers = [
    { role: 'leading' as const, items: analyses.filter((a) => a.role === 'leading') },
    {
      role: 'coincident' as const,
      items: [
        housingRef,
        ptiItem,
        ...analyses.filter((a) => a.role === 'coincident' && a.bestLag >= 0),
      ],
    },
    {
      role: 'lagging' as const,
      items: analyses.filter((a) => a.role === 'coincident' && a.bestLag < 0),
    },
  ];

  return (
    <div className="causal-tier-diagram" role="img" aria-label="領先同步落後指標階層圖">
      <div className="causal-tier-flow-arrow" aria-hidden="true">
        <span>時間流向 →</span>
      </div>
      <div className="causal-tiers">
        {tiers.map((tier) => (
          <div key={tier.role} className={`causal-tier causal-tier--${tier.role}`}>
            <div className="causal-tier-header">
              <span className="causal-tier-title">{ROLE_LABELS[tier.role]}</span>
              <span className="causal-tier-hint">{ROLE_HINTS[tier.role]}</span>
            </div>
            <div className="causal-tier-cards">
              {tier.items.map((item) => (
                <div
                  key={item.key}
                  className="causal-tier-card"
                  style={{ borderColor: item.color }}
                >
                  <span
                    className="causal-tier-dot"
                    style={{ background: item.color }}
                  />
                  <span className="causal-tier-name">{item.label}</span>
                  <span className="causal-tier-lag">
                    {item.key === HOUSING_TARGET.key
                      ? '基準'
                      : item.key === PTI_KEY
                        ? `${lagLabel(item.bestLag)} · 季資料 · r=${formatR(item.bestCorrelation)}`
                        : `${lagLabel(item.bestLag)} · r=${formatR(item.bestCorrelation)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransmissionFlow({ links }: { links: TransmissionLink[] }) {
  const colorByKey: Record<string, string> = {
    fedFundsRate: '#22c55e',
    mortgageRate: '#a855f7',
    m2Yoy: '#eab308',
    taiexClose: '#3d8bfd',
    nationalHousingIndex: '#f46d43',
    priceToIncomeRatio: '#14b8a6',
  };
  const labelByKey: Record<string, string> = Object.fromEntries(
    [...CAUSAL_INDICATORS, ...LAGGING_OUTCOMES].map((s) => [s.key, s.label]),
  );

  return (
    <div className="transmission-flow">
      <h3>傳導鏈（統計時間差）</h3>
      <ul className="transmission-list">
        {links.map((link) => (
          <li key={`${link.from}-${link.to}`} className="transmission-item">
            <span
              className="transmission-pill"
              style={{ borderColor: colorByKey[link.from] }}
            >
              {labelByKey[link.from]}
            </span>
            <span className="transmission-edge">
              <span className="transmission-edge-label">{link.label}</span>
              <span className="transmission-edge-lag">{link.months}</span>
            </span>
            <span className="transmission-arrow" aria-hidden="true">
              →
            </span>
            <span
              className="transmission-pill"
              style={{ borderColor: colorByKey[link.to] }}
            >
              {labelByKey[link.to]}
            </span>
          </li>
        ))}
      </ul>
      <p className="analysis-note causal-note-tight transmission-caption">
        箭頭由<strong>領先</strong>變數指向<strong>落後</strong>變數；若統計 lag
        與概念鏈方向相反，會自動對調左右節點。各段時間差取自交叉相關最強之 lag。
        {PTI_QUARTERLY_NOTE}
      </p>
    </div>
  );
}

function LagSummaryTable({
  analyses,
  pti,
}: {
  analyses: LagAnalysis[];
  pti: LagAnalysis;
}) {
  const rows = [
    ...analyses,
    {
      ...pti,
      label: '房價 → 所得比',
      bestLag: pti.bestLag,
    },
  ];

  return (
    <table className="lag-summary-table">
      <thead>
        <tr>
          <th>指標</th>
          <th>最佳 lag</th>
          <th>r</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key + row.label}>
            <td>
              <span className="lag-summary-dot" style={{ background: row.color }} />
              {row.label}
            </td>
            <td>{lagLabel(row.bestLag)}</td>
            <td className={row.inverse ? 'lag-neg' : 'lag-pos'}>
              {formatR(row.bestCorrelation)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function seriesToPath(
  norm: number[],
  startIdx: number,
  n: number,
  toX: (i: number) => number,
  toY: (v: number) => number,
): string {
  const segments: string[] = [];
  let chunk: string[] = [];
  for (let i = startIdx; i < n; i++) {
    const v = norm[i];
    if (!Number.isFinite(v)) {
      if (chunk.length > 0) {
        segments.push(`M ${chunk.join(' L ')}`);
        chunk = [];
      }
      continue;
    }
    chunk.push(`${toX(i)},${toY(v)}`);
  }
  if (chunk.length > 0) segments.push(`M ${chunk.join(' L ')}`);
  return segments.join(' ');
}

function AlignedOverlayChart({
  timeSeries,
  targetKey,
  leaders,
}: {
  timeSeries: MultivariateAnalysis['timeSeries'];
  targetKey: NumericKey;
  leaders: LagAnalysis[];
}) {
  const w = 720;
  const h = 220;
  const pad = { l: 36, r: 16, t: 16, b: 32 };
  const n = timeSeries.length;
  if (n < 2 || leaders.length === 0) return null;

  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const toX = (i: number) => pad.l + (i / (n - 1)) * plotW;
  const toY = (v: number) => pad.t + (1 - v) * plotH;

  const targetRaw = transformSeries(
    filledSeries(timeSeries, targetKey),
    'yoy',
  );
  const targetNorm = normalizeMinMax(targetRaw);
  const startIdx = firstValidIndex(targetRaw);

  const targetPath = seriesToPath(targetNorm, startIdx, n, toX, toY);

  const leaderPaths = leaders.map((leader) => {
    const raw = transformSeries(
      filledSeries(timeSeries, leader.key as NumericKey),
      getSeriesTransform(leader.key),
    );
    const aligned = alignPredictorToTarget(raw, n, leader.bestLag);
    const signed = aligned.map((v) => {
      if (v == null || !Number.isFinite(v)) return NaN;
      return leader.inverse ? -v : v;
    });
    const norm = normalizeMinMax(signed);
    const leaderStart = Math.max(startIdx, leader.bestLag);
    return {
      leader,
      d: seriesToPath(norm, leaderStart, n, toX, toY),
    };
  });

  const years = timeSeries
    .map((r, i) => ({ year: r.month.slice(0, 4), i }))
    .filter((t, idx, arr) => idx === 0 || t.year !== arr[idx - 1].year);

  return (
    <div className="aligned-overlay-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="aligned-svg">
        <title>領先指標時間對齊疊圖</title>
        {leaderPaths.map(({ leader, d }) => (
          <path
            key={leader.key}
            d={d}
            fill="none"
            stroke={leader.color}
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.75}
          />
        ))}
        <path
          d={targetPath}
          fill="none"
          stroke={HOUSING_TARGET.color}
          strokeWidth={3}
          opacity={0.95}
        />
        {years.map((t) => (
          <text
            key={t.year}
            x={toX(t.i)}
            y={h - 8}
            className="lag-axis-label"
            textAnchor="middle"
          >
            {t.year}
          </text>
        ))}
      </svg>
      <div className="aligned-legend">
        <span className="aligned-legend-item">
          <span className="aligned-swatch aligned-swatch--solid" style={{ background: HOUSING_TARGET.color }} />
          {HOUSING_TARGET.label}
        </span>
        {leaders.map((l) => (
          <span key={l.key} className="aligned-legend-item">
            <span
              className="aligned-swatch aligned-swatch--dashed"
              style={{ borderColor: l.color }}
            />
            {l.label}（{lagLabel(l.bestLag)}
            {l.inverse ? '，反向對齊' : ''}）
          </span>
        ))}
      </div>
    </div>
  );
}
