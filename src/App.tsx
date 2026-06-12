import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { HousingContourMap } from './components/HousingContourMap';
import { ControlPanel } from './components/ControlPanel';
import { MapLegend } from './components/MapLegend';
import { MrtLineLegend } from './components/MrtLineLegend';
import { loadMultivariateAnalysis } from './lib/analysis';
import {
  filterTransactions,
  getPriceStats,
  loadHousingData,
} from './lib/data';
import type { AppView, DataLayer, HousingDataset, MultivariateAnalysis } from './types';
import './App.css';

export default function App() {
  const [view, setView] = useState<AppView>('map');
  const [data, setData] = useState<HousingDataset | null>(null);
  const [analysis, setAnalysis] = useState<MultivariateAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 200]);
  const [activeLayers, setActiveLayers] = useState<DataLayer[]>([
    'contour',
    'points',
    'mrt',
  ]);
  const [colorDomain, setColorDomain] = useState({
    colorMin: 0,
    colorMax: 100,
    median: 50,
    outlierCount: 0,
  });

  const handleColorDomainChange = useCallback(
    (domain: typeof colorDomain) => setColorDomain(domain),
    [],
  );

  useEffect(() => {
    Promise.all([
      loadHousingData(),
      loadMultivariateAnalysis().catch((e) => {
        setAnalysisError(e instanceof Error ? e.message : '分析資料載入失敗');
        return null;
      }),
    ])
      .then(([d, a]) => {
        setData(d);
        setAnalysis(a);
        const stats = getPriceStats(d.transactions);
        setPriceRange([Math.floor(stats.min), Math.ceil(stats.max)]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '載入失敗'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return filterTransactions(data, {
      districts: selectedDistricts.length ? selectedDistricts : undefined,
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
    });
  }, [data, selectedDistricts, priceRange]);

  const stats = useMemo(() => getPriceStats(filtered), [filtered]);
  const globalStats = useMemo(
    () => (data ? getPriceStats(data.transactions) : { min: 0, max: 200, median: 0, count: 0 }),
    [data],
  );

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="spinner" />
        <p>載入政府開放資料中…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app loading-screen">
        <p className="error">{error ?? '資料載入失敗'}</p>
        <p>請在專案根目錄執行：<code>npm run fetch-data</code></p>
      </div>
    );
  }

  return (
    <div className={`app ${view === 'analysis' ? 'app--analysis' : ''}`}>
      <nav className="view-nav">
        <button
          type="button"
          className={view === 'map' ? 'view-nav-btn active' : 'view-nav-btn'}
          onClick={() => setView('map')}
        >
          地圖
        </button>
        <button
          type="button"
          className={view === 'analysis' ? 'view-nav-btn active' : 'view-nav-btn'}
          onClick={() => setView('analysis')}
        >
          多元分析
        </button>
      </nav>
      {view === 'analysis' ? (
        <main className="analysis-wrap">
          {analysis ? (
            <AnalysisPanel data={analysis} />
          ) : (
            <div className="analysis-missing">
              <p>{analysisError ?? '尚未產生分析結果'}</p>
              <p>
                請在專案根目錄執行：<code>npm run fetch-analysis</code>
              </p>
            </div>
          )}
        </main>
      ) : (
        <>
      <ControlPanel
        selectedDistricts={selectedDistricts}
        onDistrictsChange={setSelectedDistricts}
        minPrice={Math.floor(globalStats.min)}
        maxPrice={Math.ceil(globalStats.max)}
        priceRange={priceRange}
        onPriceRangeChange={setPriceRange}
        activeLayers={activeLayers}
        onLayersChange={setActiveLayers}
        stats={stats}
        mrtRouteCount={data.mrtRoutes.length}
        updatedAt={data.updatedAt}
      />
      <main className="map-wrap">
        <HousingContourMap
          transactions={filtered}
          districtIndex={data.districtIndex}
          mrtRoutes={data.mrtRoutes ?? []}
          activeLayers={activeLayers}
          onColorDomainChange={handleColorDomainChange}
        />
        {activeLayers.includes('mrt') && <MrtLineLegend />}
        <MapLegend
          colorMin={colorDomain.colorMin}
          colorMax={colorDomain.colorMax}
          median={colorDomain.median}
          outlierCount={colorDomain.outlierCount}
        />
      </main>
        </>
      )}
    </div>
  );
}
