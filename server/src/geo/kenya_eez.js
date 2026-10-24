/**
 * Kenya Exclusive Economic Zone (EEZ) and Marine Protected Areas (MPAs)
 * Coordinates based on VLIZ Maritime Boundaries (v11) and Kenya Wildlife Service (KWS) data.
 */

import { haversineKm } from '../utils/geo.js';

// Kenya EEZ Bounding Box
export const KENYA_EEZ_BBOX = {
  minLat: -4.75,
  maxLat: 0.5,
  minLon: 39.0,
  maxLon: 45.5,
};

// Kenya EEZ GeoJSON Polygon coordinates [lon, lat]
export const KENYA_EEZ_POLYGON = [
  [39.22, -4.68], // Coast border with Tanzania (Vanga/Shimoni)
  [40.00, -4.75],
  [41.50, -4.50],
  [42.80, -3.80],
  [44.00, -2.50],
  [45.30, -1.00],
  [45.40, 0.00],
  [44.50, 0.50],
  [41.57, -1.65], // Ras Kamboni (Somalia/Kenya coast border)
  [41.30, -1.90], // Kiunga
  [40.90, -2.25], // Lamu archipelago
  [40.15, -3.20], // Malindi
  [39.85, -3.65], // Kilifi
  [39.67, -4.05], // Mombasa
  [39.40, -4.50], // Msambweni
  [39.22, -4.68], // Close polygon
];

// Major Kenyan Marine Protected Areas (MPAs)
export const KENYA_MPAS = [
  {
    id: 'kisite-mpunguti',
    name: 'Kisite-Mpunguti Marine National Park & Reserve',
    category: 'Marine National Park',
    sector: 'South Coast/Vanga',
    coordinates: [
      [39.30, -4.70],
      [39.42, -4.70],
      [39.42, -4.76],
      [39.30, -4.76],
      [39.30, -4.70],
    ],
  },
  {
    id: 'mombasa-marine',
    name: 'Mombasa Marine National Park & Reserve',
    category: 'Marine National Park',
    sector: 'Mombasa',
    coordinates: [
      [39.71, -3.98],
      [39.77, -3.98],
      [39.77, -4.04],
      [39.71, -4.04],
      [39.71, -3.98],
    ],
  },
  {
    id: 'malindi-marine',
    name: 'Malindi Marine National Park',
    category: 'Marine National Park',
    sector: 'Malindi-Kilifi',
    coordinates: [
      [40.12, -3.22],
      [40.18, -3.22],
      [40.18, -3.28],
      [40.12, -3.28],
      [40.12, -3.22],
    ],
  },
  {
    id: 'watamu-marine',
    name: 'Watamu Marine National Park & Reserve',
    category: 'Marine National Park',
    sector: 'Malindi-Kilifi',
    coordinates: [
      [40.00, -3.34],
      [40.06, -3.34],
      [40.06, -3.42],
      [40.00, -3.42],
      [40.00, -3.34],
    ],
  },
  {
    id: 'kiunga-marine',
    name: 'Kiunga Marine National Reserve',
    category: 'Marine National Reserve',
    sector: 'Lamu',
    coordinates: [
      [41.15, -1.75],
      [41.45, -1.75],
      [41.45, -2.10],
      [41.15, -2.10],
      [41.15, -1.75],
    ],
  },
];

/**
 * Standard ray-casting algorithm to test point in polygon.
 * @param {number} lat
 * @param {number} lon
 * @param {Array<[number, number]>} polygon - Array of [lon, lat]
 * @returns {boolean}
 */
export function isPointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a coordinate is within Kenya's EEZ.
 * Fast bounding-box check followed by polygon ray-cast.
 */
export function isInsideKenyaEEZ(lat, lon) {
  if (
    lat < KENYA_EEZ_BBOX.minLat ||
    lat > KENYA_EEZ_BBOX.maxLat ||
    lon < KENYA_EEZ_BBOX.minLon ||
    lon > KENYA_EEZ_BBOX.maxLon
  ) {
    return false;
  }
  return isPointInPolygon(lat, lon, KENYA_EEZ_POLYGON);
}

/**
 * Calculate minimum distance from a coordinate to the EEZ boundary in kilometers.
 */
export function distanceToEEZBoundaryKm(lat, lon) {
  let minDistance = Infinity;
  for (let i = 0; i < KENYA_EEZ_POLYGON.length - 1; i++) {
    const [pLon, pLat] = KENYA_EEZ_POLYGON[i];
    const dist = haversineKm(lat, lon, pLat, pLon);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return Math.round(minDistance * 10) / 10;
}

/**
 * Check if a coordinate is within or near any Kenyan Marine Protected Area.
 * Returns { inside: boolean, nearestMpa: string, distanceKm: number }
 */
export function checkMPAIntersection(lat, lon) {
  let minDistance = Infinity;
  let nearestMpa = null;
  let inside = false;

  for (const mpa of KENYA_MPAS) {
    if (isPointInPolygon(lat, lon, mpa.coordinates)) {
      return {
        inside: true,
        mpaId: mpa.id,
        mpaName: mpa.name,
        distanceKm: 0,
      };
    }
    // Calculate distance to MPA boundary points
    for (const [mLon, mLat] of mpa.coordinates) {
      const d = haversineKm(lat, lon, mLat, mLon);
      if (d < minDistance) {
        minDistance = d;
        nearestMpa = mpa;
      }
    }
  }

  return {
    inside: false,
    mpaId: nearestMpa?.id || null,
    mpaName: nearestMpa?.name || null,
    distanceKm: Math.round(minDistance * 10) / 10,
  };
}

// 12 Nautical Mile Sovereign Territorial Waters Line (approx 22.2 km offshore)
export const KENYA_TERRITORIAL_12NM_LINE = [
  [39.42, -4.75], // 12 nm off Vanga/Shimoni
  [39.60, -4.55], // 12 nm off Msambweni
  [39.88, -4.12], // 12 nm off Mombasa
  [40.06, -3.70], // 12 nm off Kilifi
  [40.36, -3.25], // 12 nm off Malindi
  [41.12, -2.32], // 12 nm off Lamu
  [41.52, -1.95], // 12 nm off Kiunga
  [41.78, -1.70], // 12 nm off Ras Kamboni (Somalia border)
];

/**
 * Generate standard GeoJSON FeatureCollection for EEZ, MPAs, and Territorial Boundary
 */
export function getGeoJsonLayers() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'kenya-eez',
        properties: {
          name: 'Kenya Exclusive Economic Zone (EEZ)',
          area: 'approx 142,400 sq km',
          type: 'EEZ',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [KENYA_EEZ_POLYGON],
        },
      },
      {
        type: 'Feature',
        id: 'kenya-territorial-12nm',
        properties: {
          name: '12 nm Territorial Sea Boundary (Sovereign Waters)',
          type: 'territorial_boundary',
        },
        geometry: {
          type: 'LineString',
          coordinates: KENYA_TERRITORIAL_12NM_LINE,
        },
      },
      ...KENYA_MPAS.map((mpa) => ({
        type: 'Feature',
        id: mpa.id,
        properties: {
          name: mpa.name,
          category: mpa.category,
          sector: mpa.sector,
          type: 'MPA',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [mpa.coordinates],
        },
      })),
    ],
  };
}
