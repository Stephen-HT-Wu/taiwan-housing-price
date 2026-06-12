export interface TransactionPoint {
  district: string;
  location: string;
  pricePerPing: number;
  totalPrice: number | null;
  area: number;
  buildingType: string;
  transactionDate: string;
  lat: number;
  lng: number;
}

export interface DistrictIndex {
  district: string;
  period: string;
  unitPrice: number;
  index: number;
  changeRate: string;
}

export interface MrtStation {
  id: string;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  address: string;
  source: string;
}

export interface MrtRouteFeature {
  type: 'Feature';
  properties: {
    routeName: string;
    lineId: string;
    lineName: string;
    color: string;
  };
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
}

export interface HousingDataset {
  updatedAt: string;
  mrtBufferRadiusM: number;
  sources: { name: string; url: string; license: string }[];
  transactions: TransactionPoint[];
  districtIndex: DistrictIndex[];
  mrtStations: MrtStation[];
  mrtRoutes: MrtRouteFeature[];
}

export interface ContourFeature {
  type: 'Feature';
  properties: { value: number };
  geometry: {
    type: 'MultiPolygon';
    coordinates: number[][][][];
  };
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export type DataLayer = 'contour' | 'points' | 'district' | 'mrt';
