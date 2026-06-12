import { MRT_MAIN_LINES } from '../lib/mrt-lines';

export function MrtLineLegend() {
  return (
    <div className="mrt-legend">
      <div className="mrt-legend-title">捷運路線</div>
      {MRT_MAIN_LINES.map((line) => (
        <div key={line.lineId} className="mrt-legend-row">
          <span
            className="mrt-legend-swatch"
            style={{ background: line.color }}
          />
          <span>{line.lineName}</span>
        </div>
      ))}
    </div>
  );
}
