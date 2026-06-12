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

export interface HousingDataset {
  updatedAt: string;
  sources: { name: string; url: string; license: string }[];
  transactions: TransactionPoint[];
  districtIndex: DistrictIndex[];
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

export type DataLayer = 'contour' | 'points' | 'district';
