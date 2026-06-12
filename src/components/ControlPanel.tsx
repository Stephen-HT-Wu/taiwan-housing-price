import type { DataLayer } from '../types';
import { TAIPEI_DISTRICTS } from '../lib/data';

interface ControlPanelProps {
  selectedDistricts: string[];
  onDistrictsChange: (districts: string[]) => void;
  minPrice: number;
  maxPrice: number;
  priceRange: [number, number];
  onPriceRangeChange: (range: [number, number]) => void;
  activeLayers: DataLayer[];
  onLayersChange: (layers: DataLayer[]) => void;
  stats: { count: number; median: number };
  mrtRouteCount: number;
  updatedAt: string;
}

export function ControlPanel({
  selectedDistricts,
  onDistrictsChange,
  minPrice,
  maxPrice,
  priceRange,
  onPriceRangeChange,
  activeLayers,
  onLayersChange,
  stats,
  mrtRouteCount,
  updatedAt,
}: ControlPanelProps) {
  const toggleDistrict = (d: string) => {
    if (selectedDistricts.includes(d)) {
      onDistrictsChange(selectedDistricts.filter((x) => x !== d));
    } else {
      onDistrictsChange([...selectedDistricts, d]);
    }
  };

  const toggleLayer = (layer: DataLayer) => {
    if (activeLayers.includes(layer)) {
      onLayersChange(activeLayers.filter((l) => l !== layer));
    } else {
      onLayersChange([...activeLayers, layer]);
    }
  };

  return (
    <aside className="panel">
      <header className="panel-header">
        <h1>台灣房價等高線圖</h1>
        <p className="panel-subtitle">
          資料來源：臺北市資料大平臺 · 實價登錄周報
        </p>
      </header>

      <section className="panel-section">
        <h2>圖層</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={activeLayers.includes('contour')}
            onChange={() => toggleLayer('contour')}
          />
          房價等高線
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={activeLayers.includes('points')}
            onChange={() => toggleLayer('points')}
          />
          交易點位
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={activeLayers.includes('district')}
            onChange={() => toggleLayer('district')}
          />
          行政區指數
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={activeLayers.includes('mrt')}
            onChange={() => toggleLayer('mrt')}
          />
          捷運路網
          {activeLayers.includes('mrt') && (
            <span className="layer-meta">（{mrtRouteCount} 段）</span>
          )}
        </label>
      </section>

      <section className="panel-section">
        <h2>單價篩選（萬元/坪）</h2>
        <div className="range-inputs">
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            value={priceRange[0]}
            onChange={(e) =>
              onPriceRangeChange([Number(e.target.value), priceRange[1]])
            }
          />
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            value={priceRange[1]}
            onChange={(e) =>
              onPriceRangeChange([priceRange[0], Number(e.target.value)])
            }
          />
        </div>
        <div className="range-label">
          {priceRange[0].toFixed(0)} — {priceRange[1].toFixed(0)} 萬/坪
        </div>
      </section>

      <section className="panel-section">
        <h2>行政區</h2>
        <div className="district-grid">
          {TAIPEI_DISTRICTS.map((d) => (
            <button
              key={d}
              type="button"
              className={`district-chip ${selectedDistricts.length === 0 || selectedDistricts.includes(d) ? 'active' : ''}`}
              onClick={() => toggleDistrict(d)}
            >
              {d.replace('區', '')}
            </button>
          ))}
        </div>
        {selectedDistricts.length > 0 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => onDistrictsChange([])}
          >
            清除篩選
          </button>
        )}
      </section>

      <section className="panel-section stats">
        <div className="stat">
          <span className="stat-value">{stats.count}</span>
          <span className="stat-label">筆交易</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.median.toFixed(0)}</span>
          <span className="stat-label">中位數（萬/坪）</span>
        </div>
      </section>

      <footer className="panel-footer">
        <small>更新：{new Date(updatedAt).toLocaleDateString('zh-TW')}</small>
        <small>座標為地址近似定位，僅供趨勢參考</small>
      </footer>
    </aside>
  );
}
