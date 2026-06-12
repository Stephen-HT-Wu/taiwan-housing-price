import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';
import type { ContourFeature, DataLayer, DistrictIndex, TransactionPoint } from '../types';
import { buildPriceContours, priceColorScale } from '../lib/contour';

interface HousingContourMapProps {
  transactions: TransactionPoint[];
  districtIndex: DistrictIndex[];
  activeLayers: DataLayer[];
}

function FitBounds({ points }: { points: TransactionPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [40, 40] },
    );
  }, [map, points]);

  return null;
}

export function HousingContourMap({
  transactions,
  districtIndex,
  activeLayers,
}: HousingContourMapProps) {
  const priceMin = useMemo(
    () => (transactions.length ? Math.min(...transactions.map((t) => t.pricePerPing)) : 0),
    [transactions],
  );
  const priceMax = useMemo(
    () => (transactions.length ? Math.max(...transactions.map((t) => t.pricePerPing)) : 100),
    [transactions],
  );

  const colorScale = useMemo(
    () => priceColorScale(priceMin, priceMax),
    [priceMin, priceMax],
  );

  const contours = useMemo(
    () => (activeLayers.includes('contour') ? buildPriceContours(transactions) : []),
    [transactions, activeLayers],
  );

  const districtCentroids: Record<string, [number, number]> = useMemo(() => {
    const acc: Record<string, { lat: number; lng: number; n: number }> = {};
    for (const t of transactions) {
      if (!acc[t.district]) acc[t.district] = { lat: 0, lng: 0, n: 0 };
      acc[t.district].lat += t.lat;
      acc[t.district].lng += t.lng;
      acc[t.district].n += 1;
    }
    const result: Record<string, [number, number]> = {};
    for (const [d, v] of Object.entries(acc)) {
      result[d] = [v.lat / v.n, v.lng / v.n];
    }
    return result;
  }, [transactions]);

  const contourStyle = (feature?: ContourFeature): PathOptions => {
    const value = feature?.properties.value ?? priceMin;
    return {
      fillColor: colorScale(value),
      fillOpacity: 0.55,
      color: colorScale(value),
      weight: 0.5,
      opacity: 0.3,
    };
  };

  const onEachContour = (feature: ContourFeature, layer: Layer) => {
    layer.bindPopup(
      `<strong>約 ${feature.properties.value.toFixed(1)} 萬元/坪</strong><br/>（IDW 插值估算）`,
    );
  };

  return (
    <MapContainer
      center={[25.033, 121.565]}
      zoom={12}
      className="map"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={transactions} />

      {activeLayers.includes('contour') &&
        contours.map((feature, i) => (
          <GeoJSON
            key={`contour-${i}-${feature.properties.value}`}
            data={feature}
            style={() => contourStyle(feature)}
            onEachFeature={onEachContour as never}
          />
        ))}

      {activeLayers.includes('points') &&
        transactions.map((t, i) => (
          <CircleMarker
            key={`${t.location}-${i}`}
            center={[t.lat, t.lng]}
            radius={4}
            pathOptions={{
              fillColor: colorScale(t.pricePerPing),
              fillOpacity: 0.85,
              color: '#fff',
              weight: 1,
            }}
          >
            <Popup>
              <strong>{t.district}</strong>
              <br />
              {t.location}
              <br />
              <strong>{t.pricePerPing.toFixed(1)}</strong> 萬元/坪
              <br />
              總價 {t.totalPrice?.toLocaleString() ?? '—'} 萬 · {t.area.toFixed(1)} 坪
              <br />
              <small>{t.buildingType}</small>
            </Popup>
          </CircleMarker>
        ))}

      {activeLayers.includes('district') &&
        districtIndex.map((d) => {
          const center = districtCentroids[d.district];
          if (!center) return null;
          return (
            <CircleMarker
              key={d.district}
              center={center}
              radius={18}
              pathOptions={{
                fillColor: colorScale(d.unitPrice),
                fillOpacity: 0.9,
                color: '#1a1a2e',
                weight: 2,
              }}
            >
              <Popup>
                <strong>{d.district}</strong>
                <br />
                標準住宅單價：<strong>{d.unitPrice.toFixed(1)}</strong> 萬/坪
                <br />
                季指數：{d.index}（{d.period}）
                <br />
                變動率：{d.changeRate}
              </Popup>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
