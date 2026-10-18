/**
 * Geographic and nautical utilities for Kenya EEZ
 */

export const KENYA_PORTS = [
  { name: 'Lamu Port', lat: -2.2686, lon: 40.9020, sector: 'Lamu' },
  { name: 'Malindi', lat: -3.2200, lon: 40.1300, sector: 'Malindi-Kilifi' },
  { name: 'Kilifi', lat: -3.6333, lon: 39.8500, sector: 'Malindi-Kilifi' },
  { name: 'Mombasa (Kilindini)', lat: -4.0547, lon: 39.6644, sector: 'Mombasa' },
  { name: 'Shimoni/Vanga', lat: -4.6469, lon: 39.3814, sector: 'South Coast/Vanga' },
];

/**
 * Great-circle distance between two coordinates in kilometers (Haversine).
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Initial compass bearing from (lat1, lon1) to (lat2, lon2) in degrees (0-360).
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * (Math.PI / 180);
  const phi2 = lat2 * (Math.PI / 180);
  const lambdaDiff = (lon2 - lon1) * (Math.PI / 180);

  const y = Math.sin(lambdaDiff) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambdaDiff);
  const theta = Math.atan2(y, x);
  return (theta * (180 / Math.PI) + 360) % 360;
}

/**
 * Convert degree bearing into 8-point compass direction.
 */
export function bearingToCompass(degrees) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return points[index];
}

/**
 * Find the nearest Kenyan port and format relative distance and bearing.
 * Example: "38 km E of Lamu"
 */
export function getRelativeLocationDescription(lat, lon) {
  let minDistance = Infinity;
  let nearestPort = KENYA_PORTS[0];

  for (const port of KENYA_PORTS) {
    const dist = haversineKm(port.lat, port.lon, lat, lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestPort = port;
    }
  }

  const bearing = calculateBearing(nearestPort.lat, nearestPort.lon, lat, lon);
  const compass = bearingToCompass(bearing);
  const distKm = Math.round(minDistance);

  return {
    label: `${distKm} km ${compass} of ${nearestPort.name.replace(/ \(Kilindini\)/, '')}`,
    distanceKm: distKm,
    bearingDeg: Math.round(bearing),
    compass,
    nearestPort: nearestPort.name,
    sector: nearestPort.sector,
  };
}

/**
 * Classify coordinate into one of the 4 operational sectors.
 */
export function getSectorForLocation(lat) {
  if (lat >= -2.2) return 'Lamu';
  if (lat >= -3.8) return 'Malindi-Kilifi';
  if (lat >= -4.3) return 'Mombasa';
  return 'South Coast/Vanga';
}

/**
 * Format a Date object into EAT (Africa/Nairobi, UTC+3) string.
 */
export function formatEAT(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(d);
}

/**
 * Format a Date object into UTC string.
 */
export function formatUTC(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
