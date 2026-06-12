import { contours } from 'd3-contour';
import { scaleLinear } from 'd3-scale';
import type { ContourFeature, MapBounds, TransactionPoint } from '../types';

const TAIPEI_BOUNDS: MapBounds = {
  minLat: 24.96,
  maxLat: 25.2,
  minLng: 121.45,
  maxLng: 121.65,
};

export function getTaipeiBounds(): MapBounds {
  return { ...TAIPEI_BOUNDS };
}

/** 反距離加權插值 (IDW) */
function idw(
  lat: number,
  lng: number,
  points: TransactionPoint[],
  power = 2,
  radius = 0.02,
): number | null {
  let weightSum = 0;
  let valueSum = 0;
  let nearest = Infinity;

  for (const p of points) {
    const dLat = lat - p.lat;
    const dLng = lng - p.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    nearest = Math.min(nearest, dist);

    if (dist < 1e-8) return p.pricePerPing;
    if (dist > radius) continue;

    const w = 1 / Math.pow(dist, power);
    weightSum += w;
    valueSum += w * p.pricePerPing;
  }

  if (weightSum === 0) {
    if (nearest < radius * 2) {
      const sorted = [...points].sort((a, b) => {
        const da = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
        const db = (b.lat - lat) ** 2 + (b.lng - lng) ** 2;
        return da - db;
      });
      return sorted[0]?.pricePerPing ?? null;
    }
    return null;
  }

  return valueSum / weightSum;
}

export interface ContourOptions {
  gridWidth?: number;
  gridHeight?: number;
  thresholdCount?: number;
  idwRadius?: number;
  bounds?: MapBounds;
}

export function buildPriceContours(
  points: TransactionPoint[],
  options: ContourOptions = {},
): ContourFeature[] {
  const {
    gridWidth = 80,
    gridHeight = 80,
    thresholdCount = 12,
    idwRadius = 0.025,
    bounds = TAIPEI_BOUNDS,
  } = options;

  if (points.length < 3) return [];

  const values = new Float64Array(gridWidth * gridHeight);
  let minVal = Infinity;
  let maxVal = -Infinity;
  let validCount = 0;

  const latScale = scaleLinear()
    .domain([0, gridHeight - 1])
    .range([bounds.maxLat, bounds.minLat]);

  const lngScale = scaleLinear()
    .domain([0, gridWidth - 1])
    .range([bounds.minLng, bounds.maxLng]);

  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const lat = latScale(j);
      const lng = lngScale(i);
      const val = idw(lat, lng, points, 2, idwRadius);

      if (val !== null) {
        values[j * gridWidth + i] = val;
        minVal = Math.min(minVal, val);
        maxVal = Math.max(maxVal, val);
        validCount++;
      } else {
        values[j * gridWidth + i] = NaN;
      }
    }
  }

  if (validCount < 10 || !isFinite(minVal) || !isFinite(maxVal)) return [];

  const pad = (maxVal - minVal) * 0.05;
  const thresholds = Array.from({ length: thresholdCount }, (_, i) =>
    minVal - pad + ((maxVal + pad - (minVal - pad)) * (i + 1)) / (thresholdCount + 1),
  );

  const contourGen = contours().size([gridWidth, gridHeight]).thresholds(thresholds);
  const rawContours = contourGen(values as unknown as number[]);

  const toLatLng = (x: number, y: number): [number, number] => [
    lngScale(x),
    latScale(y),
  ];

  return rawContours.map((c) => ({
    type: 'Feature' as const,
    properties: { value: c.value },
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: c.coordinates.map((poly) =>
        poly.map((ring) => ring.map(([x, y]) => toLatLng(x, y))),
      ),
    },
  }));
}

export function priceColorScale(min: number, max: number) {
  const colors = [
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

  return scaleLinear<string>().domain(
    colors.map((_, i) => min + ((max - min) * i) / (colors.length - 1)),
  ).range(colors);
}
