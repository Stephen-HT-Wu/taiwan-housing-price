interface MapLegendProps {
  colorMin: number;
  colorMax: number;
  median: number;
  outlierCount?: number;
}

const STOPS = [
  '#313695',
  '#4575b4',
  '#74add1',
  '#abd9e9',
  '#e0f3f8',
  '#ffffbf',
  '#fee090',
  '#fdae61',
  '#f46d43',
  '#d73027',
  '#a50026',
];

export function MapLegend({
  colorMin,
  colorMax,
  median,
  outlierCount = 0,
}: MapLegendProps) {
  const gradient = STOPS.map((c, i) => {
    const pct = (i / (STOPS.length - 1)) * 100;
    return `${c} ${pct}%`;
  }).join(', ');

  return (
    <div className="legend">
      <div className="legend-title">每坪單價（萬元）· P5–P95 色階</div>
      <div className="legend-bar" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div className="legend-labels">
        <span>{colorMin.toFixed(0)}</span>
        <span>{median.toFixed(0)}</span>
        <span>{colorMax.toFixed(0)}</span>
      </div>
      {outlierCount > 0 && (
        <div className="legend-note">
          {outlierCount} 筆極端值以紫框標示，實際單價見彈窗
        </div>
      )}
    </div>
  );
}
