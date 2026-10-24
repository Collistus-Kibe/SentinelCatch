/**
 * SentinelCatch Vessel Trajectory & Route Reconstruction Service
 * Builds realistic historical routes/tracks for detected dark vessels and active contacts.
 * Each vessel is assigned a distinct tactical color and directional waypoints.
 */

import { haversineKm } from '../utils/geo.js';

// Curated distinct neon color palette for vessels
export const VESSEL_PALETTE = {
  'LU RONG YUAN YU 188': { color: '#00f5d4', glow: 'rgba(0, 245, 212, 0.45)', name: 'Electric Cyan' },
  'PACIFIC DAWN 02': { color: '#f72585', glow: 'rgba(247, 37, 133, 0.45)', name: 'Radiant Fuchsia' },
  'ZHOU YU 926': { color: '#ffbe0b', glow: 'rgba(255, 190, 11, 0.45)', name: 'Solar Amber' },
  'HAI FENG 68': { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', name: 'Electric Violet' },
  'AL-MARWAH': { color: '#10b981', glow: 'rgba(16, 185, 129, 0.45)', name: 'Emerald Green' },
  'TAI YUAN 227': { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', name: 'Sky Blue' },
  'SEA LION 8': { color: '#fb923c', glow: 'rgba(251, 146, 60, 0.45)', name: 'Flame Coral' },
  'OCEAN DRAGON 9': { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.45)', name: 'Hot Pink' },
  'MV AL-HILAL': { color: '#84cc16', glow: 'rgba(132, 204, 22, 0.45)', name: 'Lime Neon' },
  'BARAKA 04': { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.45)', name: 'Aquamarine' },
};

const DYNAMIC_COLORS = [
  '#00f5d4', '#f72585', '#ffbe0b', '#a855f7', '#10b981',
  '#38bdf8', '#fb923c', '#ec4899', '#84cc16', '#6366f1',
];

/**
 * Get deterministic distinct color for any vessel
 */
export function getVesselColor(vesselName = '', caseId = 0) {
  const norm = (vesselName || '').toUpperCase();
  for (const [key, val] of Object.entries(VESSEL_PALETTE)) {
    if (norm.includes(key)) return val;
  }
  const idx = Math.abs((caseId || 0) + hashString(vesselName)) % DYNAMIC_COLORS.length;
  const col = DYNAMIC_COLORS[idx];
  return { color: col, glow: `${col}66`, name: 'Tactical Track' };
}

function hashString(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Historical track trajectories for primary cases
 */
const BASE_TRACKS = [
  {
    caseId: 101,
    vesselName: 'LU RONG YUAN YU 188',
    mmsi: '412349012',
    flag: 'China',
    flagEmoji: '🇨🇳',
    gearType: 'Tuna Longliner',
    behavior: 'dark-incursion',
    targetCoords: [41.2500, -2.0500],
    waypoints: [
      {
        lon: 44.20,
        lat: 0.20,
        hoursAgo: 36,
        speedKnots: 10.5,
        heading: 232,
        aisStatus: 'active',
        label: 'Somali Basin High Seas (AIS On)',
      },
      {
        lon: 43.10,
        lat: -0.65,
        hoursAgo: 26,
        speedKnots: 10.2,
        heading: 228,
        aisStatus: 'active',
        label: 'Entering Northern Kenya EEZ',
      },
      {
        lon: 42.15,
        lat: -1.35,
        hoursAgo: 14,
        speedKnots: 9.8,
        heading: 225,
        aisStatus: 'active',
        label: 'Lamu Offshore Corridor',
      },
      {
        lon: 41.65,
        lat: -1.85,
        hoursAgo: 3.5,
        speedKnots: 9.2,
        heading: 220,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ AIS Transponder Ceased (Went Dark)',
      },
      {
        lon: 41.40,
        lat: -1.98,
        hoursAgo: 1.5,
        speedKnots: 7.8,
        heading: 215,
        aisStatus: 'dark',
        label: 'Crossed Kiunga MPA Boundary (Dark)',
      },
      {
        lon: 41.2500,
        lat: -2.0500,
        hoursAgo: 0,
        speedKnots: 3.2,
        heading: 210,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Current SAR Radar Centroid (Loitering)',
      },
    ],
  },
  {
    caseId: 102,
    vesselName: 'PACIFIC DAWN 02',
    mmsi: '667001421',
    flag: 'Sierra Leone',
    flagEmoji: '🇸🇱',
    gearType: 'Reefer / Cargo Carrier',
    behavior: 'possible-transshipment',
    targetCoords: [39.4200, -4.7200],
    waypoints: [
      {
        lon: 39.85,
        lat: -5.45,
        hoursAgo: 28,
        speedKnots: 12.0,
        heading: 345,
        aisStatus: 'active',
        label: 'Pemba Channel South Approach',
      },
      {
        lon: 39.72,
        lat: -5.10,
        hoursAgo: 18,
        speedKnots: 11.5,
        heading: 340,
        aisStatus: 'active',
        label: 'Zanzibar-Kenya Transit Corridor',
      },
      {
        lon: 39.58,
        lat: -4.85,
        hoursAgo: 7,
        speedKnots: 10.8,
        heading: 335,
        aisStatus: 'active',
        label: 'Kenya-Tanzania Border Approach',
      },
      {
        lon: 39.48,
        lat: -4.76,
        hoursAgo: 2.5,
        speedKnots: 6.5,
        heading: 310,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ AIS Disabled 12 km off Shimoni',
      },
      {
        lon: 39.4200,
        lat: -4.7200,
        hoursAgo: 0,
        speedKnots: 0.8,
        heading: 290,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Stationary Rendezvous / Transshipment',
      },
    ],
  },
  {
    caseId: 103,
    vesselName: 'ZHOU YU 926',
    mmsi: '413398102',
    flag: 'China',
    flagEmoji: '🇨🇳',
    gearType: 'Squid Jigger / Longliner',
    behavior: 'dark-vessel',
    targetCoords: [44.1000, -3.4500],
    waypoints: [
      {
        lon: 45.80,
        lat: -2.60,
        hoursAgo: 48,
        speedKnots: 10.8,
        heading: 235,
        aisStatus: 'active',
        label: 'Central Indian Ocean High Seas',
      },
      {
        lon: 45.10,
        lat: -3.00,
        hoursAgo: 30,
        speedKnots: 10.2,
        heading: 230,
        aisStatus: 'active',
        label: 'Approaching Eastern Outer EEZ',
      },
      {
        lon: 44.50,
        lat: -3.28,
        hoursAgo: 14,
        speedKnots: 9.5,
        heading: 225,
        aisStatus: 'active',
        label: 'Incursion across 200 nm Boundary',
      },
      {
        lon: 44.25,
        lat: -3.38,
        hoursAgo: 4.2,
        speedKnots: 7.8,
        heading: 220,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Shut Off in Outer EEZ',
      },
      {
        lon: 44.1000,
        lat: -3.4500,
        hoursAgo: 0,
        speedKnots: 2.1,
        heading: 215,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Slow Drift / Suspected Deep-Sea Longlining',
      },
    ],
  },
  {
    caseId: 104,
    vesselName: 'HAI FENG 68',
    mmsi: '352001928',
    flag: 'Panama',
    flagEmoji: '🇵🇦',
    gearType: 'Industrial Trawler',
    behavior: 'dark-vessel',
    targetCoords: [40.5000, -3.3500],
    waypoints: [
      {
        lon: 41.60,
        lat: -3.05,
        hoursAgo: 22,
        speedKnots: 9.5,
        heading: 250,
        aisStatus: 'active',
        label: 'Offshore Shelf Passage',
      },
      {
        lon: 41.05,
        lat: -3.20,
        hoursAgo: 11,
        speedKnots: 8.8,
        heading: 245,
        aisStatus: 'active',
        label: 'Malindi Deep Channel',
      },
      {
        lon: 40.75,
        lat: -3.28,
        hoursAgo: 3.8,
        speedKnots: 6.2,
        heading: 240,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ AIS Off Near Malindi Bank',
      },
      {
        lon: 40.5000,
        lat: -3.3500,
        hoursAgo: 0,
        speedKnots: 4.8,
        heading: 235,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Radar Return - Trawling Transit',
      },
    ],
  },
  {
    caseId: 105,
    vesselName: 'AL-MARWAH',
    mmsi: '518100823',
    flag: 'Cook Islands',
    flagEmoji: '🇨🇰',
    gearType: 'Inshore Craft',
    behavior: 'dark-vessel',
    targetCoords: [39.7100, -4.0600],
    waypoints: [
      {
        lon: 39.66,
        lat: -4.38,
        hoursAgo: 16,
        speedKnots: 7.5,
        heading: 45,
        aisStatus: 'active',
        label: 'Diani Coastal Shelf',
      },
      {
        lon: 39.72,
        lat: -4.20,
        hoursAgo: 8,
        speedKnots: 6.8,
        heading: 40,
        aisStatus: 'active',
        label: 'Likoni Outer Approach',
      },
      {
        lon: 39.76,
        lat: -4.0600,
        hoursAgo: 0,
        speedKnots: 3.5,
        heading: 35,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Kilindini Harbour Pilot Corridor',
      },
    ],
  },
];

/**
 * Generate complete GeoJSON FeatureCollection containing vessel routes,
 * directional lines, and waypoint events for MapLibre.
 */
export function generateVesselTracksGeoJson(cases = []) {
  const lineFeatures = [];
  const pointFeatures = [];

  // Merge base tracks with any dynamic cases
  const trackMap = new Map();
  for (const bt of BASE_TRACKS) {
    trackMap.set(bt.caseId, bt);
  }

  // Handle any other cases passed dynamically
  for (const c of cases) {
    const cId = Number(c.id);
    if (!trackMap.has(cId)) {
      const lat = Number(c.features?.lat ?? c.lat);
      const lon = Number(c.features?.lon ?? c.lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || {};
        const vName = candidate.vesselName || `Contact #${cId}`;
        const synthetic = createSyntheticTrack(cId, vName, lon, lat);
        trackMap.set(cId, synthetic);
      }
    }
  }

  for (const track of trackMap.values()) {
    const palette = getVesselColor(track.vesselName, track.caseId);
    const coordinates = track.waypoints.map((wp) => [wp.lon, wp.lat]);

    // Calculate total track distance in nautical miles
    let totalNm = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const dKm = haversineKm(coordinates[i][1], coordinates[i][0], coordinates[i + 1][1], coordinates[i + 1][0]);
      totalNm += dKm / 1.852;
    }

    const gapWp = track.waypoints.find((wp) => wp.isGapPoint) || null;

    // 1. Line feature for ship's path
    lineFeatures.push({
      type: 'Feature',
      id: `track-line-${track.caseId}`,
      properties: {
        type: 'vessel_track',
        caseId: track.caseId,
        vesselName: track.vesselName,
        mmsi: track.mmsi,
        flag: track.flag || 'Unknown',
        flagEmoji: track.flagEmoji || '🚢',
        gearType: track.gearType || 'Vessel',
        color: palette.color,
        glowColor: palette.glow,
        colorName: palette.name,
        totalDistanceNm: Math.round(totalNm),
        totalDurationHours: track.waypoints[0]?.hoursAgo || 24,
        aisGapHoursAgo: gapWp?.hoursAgo || null,
        waypointCount: track.waypoints.length,
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });

    // 2. Waypoint dots along the route
    track.waypoints.forEach((wp, index) => {
      pointFeatures.push({
        type: 'Feature',
        id: `wp-${track.caseId}-${index}`,
        properties: {
          type: 'vessel_track_waypoint',
          caseId: track.caseId,
          vesselName: track.vesselName,
          waypointIndex: index,
          isOrigin: index === 0,
          isGapPoint: Boolean(wp.isGapPoint),
          isCurrent: Boolean(wp.isCurrent),
          hoursAgo: wp.hoursAgo,
          speedKnots: wp.speedKnots,
          heading: wp.heading,
          aisStatus: wp.aisStatus,
          label: wp.label,
          color: wp.isGapPoint ? '#ef4444' : wp.isCurrent ? '#f97316' : palette.color,
        },
        geometry: {
          type: 'Point',
          coordinates: [wp.lon, wp.lat],
        },
      });
    });
  }

  return {
    type: 'FeatureCollection',
    features: [...lineFeatures, ...pointFeatures],
  };
}

/**
 * Calculate the westernmost (coastal) longitude for Kenya's maritime boundary at a given latitude.
 * Anything west of this longitude is land (Kenya / Tanzania mainland).
 */
export function getCoastlineLongitude(lat) {
  if (lat <= -4.68) {
    return 39.22;
  }
  if (lat <= -4.50) {
    const t = (lat - (-4.68)) / (-4.50 - (-4.68));
    return 39.22 + t * (39.40 - 39.22);
  }
  if (lat <= -4.05) {
    const t = (lat - (-4.50)) / (-4.05 - (-4.50));
    return 39.40 + t * (39.67 - 39.40);
  }
  if (lat <= -3.65) {
    const t = (lat - (-4.05)) / (-3.65 - (-4.05));
    return 39.67 + t * (39.85 - 39.67);
  }
  if (lat <= -3.20) {
    const t = (lat - (-3.65)) / (-3.20 - (-3.65));
    return 39.85 + t * (40.15 - 39.85);
  }
  if (lat <= -2.25) {
    const t = (lat - (-3.20)) / (-2.25 - (-3.20));
    return 40.15 + t * (40.90 - 40.15);
  }
  if (lat <= -1.90) {
    const t = (lat - (-2.25)) / (-1.90 - (-2.25));
    return 40.90 + t * (41.30 - 40.90);
  }
  if (lat <= -1.65) {
    const t = (lat - (-1.90)) / (-1.65 - (-1.90));
    return 41.30 + t * (41.57 - 41.30);
  }
  // Slanting northeast along Somali coast
  return 41.57 + (lat - (-1.65)) * 0.50;
}

/**
 * Returns minimum oceanic longitude including maritime territorial buffer (>= 12 km offshore)
 */
export function getMinOceanLongitude(lat) {
  return getCoastlineLongitude(lat) + 0.12;
}

/**
 * Generate synthetic historical route for dynamic cases.
 * Strictly guarantees that all waypoints and trajectories remain in the Indian Ocean / EEZ,
 * approaching along real maritime shipping corridors, never over Kenya's landmass.
 */
function createSyntheticTrack(caseId, vesselName, currentLon, currentLat) {
  const palette = getVesselColor(vesselName, caseId);

  // 1. Ensure current radar location is offshore in navigable water
  const safeCurrentLat = Math.max(-5.0, Math.min(0.8, currentLat));
  const minCurrentLon = getMinOceanLongitude(safeCurrentLat);
  const safeCurrentLon = Math.max(currentLon, minCurrentLon);

  // 2. Select one of 3 realistic oceanic approach corridors:
  //    Corridor 0: Somali Basin / Northeast approach (bearing back in time ~ 35°-55° into high seas)
  //    Corridor 1: Eastern High Seas incursion (bearing back in time ~ 75°-95° into pelagic waters)
  //    Corridor 2: Southern Channel transit (bearing back in time ~ 135°-155° off Pemba/Zanzibar)
  const corridorType = Math.abs(caseId) % 3;
  let baseBearingDeg;
  if (corridorType === 0) {
    baseBearingDeg = 45 + ((caseId * 11) % 16) - 8;
  } else if (corridorType === 1) {
    baseBearingDeg = 85 + ((caseId * 13) % 18) - 9;
  } else {
    baseBearingDeg = 145 + ((caseId * 17) % 16) - 8;
  }

  const bearingRad = (baseBearingDeg * Math.PI) / 180;
  const heading = Math.round((baseBearingDeg + 180) % 360); // Inbound heading
  const waypoints = [];

  // Generate 4 historical steps leading up to the current radar position (step 0)
  for (let step = 3; step >= 0; step--) {
    const hoursAgo = step * 6;
    const distKm = (step * 34) + 6;

    // Project backward along the oceanic bearing
    const latDelta = (distKm / 111) * Math.sin(bearingRad);
    let rawLat = safeCurrentLat + latDelta;
    rawLat = Math.max(-5.2, Math.min(1.0, rawLat));

    const lonDelta = (distKm / (111 * Math.cos((rawLat * Math.PI) / 180))) * Math.cos(bearingRad);
    let rawLon = safeCurrentLon + lonDelta;

    // Hard constraint: Longitude must be strictly offshore (east of coastline + buffer) and within EEZ/high seas
    const minSafeLon = getMinOceanLongitude(rawLat);
    const finalLon = Number(Math.min(45.4, Math.max(rawLon, minSafeLon)).toFixed(4));
    const finalLat = Number(rawLat.toFixed(4));

    waypoints.push({
      lon: finalLon,
      lat: finalLat,
      hoursAgo,
      speedKnots: Number((9.2 + (step % 3) * 0.7).toFixed(1)),
      heading,
      aisStatus: step === 0 ? 'radar_contact' : step === 1 ? 'disabled' : 'active',
      isGapPoint: step === 1,
      isCurrent: step === 0,
      label:
        step === 0
          ? '🎯 Radar Contact Intercept'
          : step === 1
          ? '⚠️ AIS Transponder Ceased'
          : `Waypoint T -${hoursAgo}h (${corridorType === 0 ? 'Somali Basin' : corridorType === 1 ? 'High Seas' : 'Southern Channel'})`,
    });
  }

  return {
    caseId,
    vesselName,
    mmsi: null,
    flag: 'Unknown',
    flagEmoji: '🚢',
    gearType: 'Commercial Contact',
    waypoints,
  };
}

/**
 * Get track details for a specific case
 */
export function getTrackByCaseId(caseId) {
  const cId = Number(caseId);
  const found = BASE_TRACKS.find((t) => t.caseId === cId);
  if (found) {
    const palette = getVesselColor(found.vesselName, found.caseId);
    return { ...found, palette };
  }
  return null;
}
