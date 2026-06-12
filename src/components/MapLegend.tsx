interface MapLegendProps {
  min: number;
  max: number;
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

export function MapLegend({ min, max }: MapLegendProps) {
  const gradient = STOPS.map((c, i) => {
    const pct = (i / (STOPS.length - 1)) * 100;
    return `${c} ${pct}%`;
  }).join(', ');

  return (
    <div className="legend">
      <div className="legend-title">每坪單價（萬元）</div>
      <div className="legend-bar" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div className="legend-labels">
        <span>{min.toFixed(0)}</span>
        <span>{((min + max) / 2).toFixed(0)}</span>
        <span>{max.toFixed(0)}</span>
      </div>
    </div>
  );
}
