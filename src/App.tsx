import { useEffect, useMemo, useState } from 'react';
import { HousingContourMap } from './components/HousingContourMap';
import { ControlPanel } from './components/ControlPanel';
import { MapLegend } from './components/MapLegend';
import {
  filterTransactions,
  getPriceStats,
  loadHousingData,
} from './lib/data';
import type { DataLayer, HousingDataset } from './types';
import './App.css';

export default function App() {
  const [data, setData] = useState<HousingDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 200]);
  const [activeLayers, setActiveLayers] = useState<DataLayer[]>([
    'contour',
    'points',
  ]);

  useEffect(() => {
    loadHousingData()
      .then((d) => {
        setData(d);
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
    <div className="app">
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
        updatedAt={data.updatedAt}
      />
      <main className="map-wrap">
        <HousingContourMap
          transactions={filtered}
          districtIndex={data.districtIndex}
          activeLayers={activeLayers}
        />
        <MapLegend min={stats.min || globalStats.min} max={stats.max || globalStats.max} />
      </main>
    </div>
  );
}
