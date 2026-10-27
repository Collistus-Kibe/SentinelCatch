/**
 * SentinelCatch Vessel Trajectory & Route Reconstruction Service
 * Builds realistic historical routes/tracks for detected dark vessels and active contacts.
 * Each vessel is assigned a distinct tactical color and directional waypoints.
 */

import { haversineKm } from '../utils/geo.js';

// Curated distinct neon color palette for vessels
export const VESSEL_PALETTE = {
  'SL PACIFIC DAWN 02': { color: '#f97316', glow: 'rgba(249, 115, 22, 0.55)', name: 'Operational Amber-Orange' },
  'PACIFIC DAWN 02': { color: '#f97316', glow: 'rgba(249, 115, 22, 0.55)', name: 'Operational Amber-Orange' },
  'LU RONG YUAN YU 188': { color: '#00f5d4', glow: 'rgba(0, 245, 212, 0.45)', name: 'Electric Cyan' },
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
    targetCoords: [41.3200, -1.9500],
    originLabel: 'Somali Basin High Seas',
    originCountry: 'Somalia Basin / High Seas',
    waypoints: [
      {
        lon: 44.20,
        lat: 0.40,
        hoursAgo: 36,
        speedKnots: 10.5,
        heading: 232,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Somali Basin High Seas (AIS On 36h ago)',
      },
      {
        lon: 43.10,
        lat: -0.60,
        hoursAgo: 24,
        speedKnots: 10.2,
        heading: 228,
        aisStatus: 'active',
        label: 'Northern Approach Fairway',
      },
      {
        lon: 42.45,
        lat: -1.25,
        hoursAgo: 14,
        speedKnots: 9.8,
        heading: 225,
        aisStatus: 'active',
        isIngress: true,
        label: 'ENTRY: Kenya EEZ 200nm Northern Boundary',
      },
      {
        lon: 41.75,
        lat: -1.70,
        hoursAgo: 2.5,
        speedKnots: 9.2,
        heading: 220,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ AIS Transponder Ceased (Went Dark 2.5h ago)',
      },
      {
        lon: 41.3200,
        lat: -1.9500,
        hoursAgo: 0,
        speedKnots: 3.2,
        heading: 210,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 SAR Radar Centroid (Inside Kiunga Marine Reserve)',
      },
    ],
  },
  {
    caseId: 102,
    vesselName: 'SL PACIFIC DAWN 02',
    mmsi: '265789012',
    flag: 'Unknown',
    flagEmoji: '🚢',
    gearType: 'Bulk Carrier',
    behavior: 'possible-transshipment',
    targetCoords: [39.5200, -4.5800],
    originLabel: 'Pemba Channel South Corridor',
    originCountry: 'Tanzania / Pemba Channel Fairway',
    waypoints: [
      {
        lon: 39.4320,
        lat: -4.8301,
        hoursAgo: 8.8,
        speedKnots: 11.5,
        heading: 325,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ Previous Position: 4.8301°S, 39.4320°E (06:10 UTC)',
      },
      {
        lon: 39.7610,
        lat: -4.6120,
        hoursAgo: 3.6,
        speedKnots: 9.8,
        heading: 315,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Intermediate Position: 4.6120°S, 39.7610°E (11:22 UTC)',
      },
      {
        lon: 39.5200,
        lat: -4.5800,
        hoursAgo: 0,
        speedKnots: 12.5,
        heading: 210,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Current Position: 4.5800°S, 39.5200°E (14:58 UTC)',
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
    originLabel: 'Central Indian Ocean High Seas',
    originCountry: 'Central Indian Ocean Pelagic Waters',
    waypoints: [
      {
        lon: 45.80,
        lat: -2.60,
        hoursAgo: 48,
        speedKnots: 10.8,
        heading: 235,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Central Indian Ocean High Seas (AIS On 48h ago)',
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
        isIngress: true,
        label: 'ENTRY: Kenya EEZ Eastern 200nm Boundary',
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
        label: '🎯 SAR Radar Centroid: Pelagic Squid Fairway',
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
    targetCoords: [40.7500, -3.4500],
    originLabel: 'Offshore Shelf Fairway',
    waypoints: [
      {
        lon: 42.20,
        lat: -3.00,
        hoursAgo: 22,
        speedKnots: 9.5,
        heading: 245,
        aisStatus: 'active',
        label: 'Offshore Shelf Fairway (AIS On)',
      },
      {
        lon: 41.50,
        lat: -3.22,
        hoursAgo: 11,
        speedKnots: 8.8,
        heading: 240,
        aisStatus: 'active',
        label: 'Malindi Deep Channel',
      },
      {
        lon: 41.05,
        lat: -3.36,
        hoursAgo: 3.8,
        speedKnots: 6.2,
        heading: 238,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ AIS Off Near Malindi Bank',
      },
      {
        lon: 40.7500,
        lat: -3.4500,
        hoursAgo: 0,
        speedKnots: 4.8,
        heading: 235,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Suspected Bottom Trawling Zone',
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
    targetCoords: [39.9200, -4.1800],
    originLabel: 'Diani Deep Shelf Passage',
    waypoints: [
      {
        lon: 40.35,
        lat: -4.55,
        hoursAgo: 16,
        speedKnots: 7.5,
        heading: 330,
        aisStatus: 'active',
        label: 'Diani Deep Shelf Passage (AIS On)',
      },
      {
        lon: 40.10,
        lat: -4.32,
        hoursAgo: 8,
        speedKnots: 6.8,
        heading: 330,
        aisStatus: 'active',
        label: 'Outer Mombasa Pilot Fairway',
      },
      {
        lon: 39.9200,
        lat: -4.1800,
        hoursAgo: 0,
        speedKnots: 3.5,
        heading: 325,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Offshore Pilot Corridor Contact',
      },
    ],
  },
];

/**
 * Generate complete GeoJSON FeatureCollection containing vessel routes,
 * directional lines, waypoint events, and explicit origin markers for MapLibre.
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
    const originWp = track.waypoints[0];
    const destWp = track.waypoints[track.waypoints.length - 1];

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
        originName: originWp?.label || track.originLabel || 'First Contact',
        originCountry: track.originCountry || 'International Waters',
        destName: destWp?.label || 'Current Radar Centroid',
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });

    // 2. Waypoint dots along the route (Intermediate waypoints only)
    // Avoids drawing redundant duplicate dots directly over origin or destination
    track.waypoints.forEach((wp, index) => {
      const isOrigin = index === 0;
      const isCurrent = index === track.waypoints.length - 1;
      pointFeatures.push({
        type: 'Feature',
        id: `wp-${track.caseId}-${index}`,
        properties: {
          type: 'vessel_track_waypoint',
          caseId: track.caseId,
          vesselName: track.vesselName,
          waypointIndex: index,
          isOrigin,
          isIngress: Boolean(wp.isIngress),
          isGapPoint: Boolean(wp.isGapPoint),
          isCurrent,
          hoursAgo: wp.hoursAgo,
          speedKnots: wp.speedKnots,
          heading: wp.heading,
          aisStatus: wp.aisStatus,
          label: wp.label,
          color: wp.isGapPoint ? '#ef4444' : isCurrent ? '#f97316' : wp.isIngress ? '#38bdf8' : palette.color,
        },
        geometry: {
          type: 'Point',
          coordinates: [wp.lon, wp.lat],
        },
      });
    });

    // 3. Explicit ORIGIN marker (▶ FIRST CONTACT point where track starts in international waters)
    if (originWp) {
      pointFeatures.push({
        type: 'Feature',
        id: `origin-${track.caseId}`,
        properties: {
          type: 'track_origin',
          caseId: track.caseId,
          vesselName: track.vesselName,
          label: originWp.label || track.originLabel || 'First Contact',
          originCountry: track.originCountry || 'High Seas',
          hoursAgo: originWp.hoursAgo,
          speedKnots: originWp.speedKnots,
          heading: originWp.heading,
          color: palette.color,
        },
        geometry: {
          type: 'Point',
          coordinates: [originWp.lon, originWp.lat],
        },
      });
    }

    // 4. Explicit EEZ INGRESS marker (Crossed 200nm Kenya EEZ boundary)
    const ingressWp = track.waypoints.find((wp) => wp.isIngress);
    if (ingressWp) {
      pointFeatures.push({
        type: 'Feature',
        id: `ingress-${track.caseId}`,
        properties: {
          type: 'track_ingress',
          caseId: track.caseId,
          vesselName: track.vesselName,
          label: ingressWp.label || 'ENTRY: Kenya EEZ 200nm Line',
          hoursAgo: ingressWp.hoursAgo,
          speedKnots: ingressWp.speedKnots,
          heading: ingressWp.heading,
          color: '#38bdf8',
        },
        geometry: {
          type: 'Point',
          coordinates: [ingressWp.lon, ingressWp.lat],
        },
      });
    }
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
 * Returns minimum oceanic longitude including maritime territorial buffer (>= 35 km offshore)
 * to guarantee that trajectories remain safely in deep navigable waters at all zoom levels.
 */
export function getMinOceanLongitude(lat) {
  return getCoastlineLongitude(lat) + 0.35;
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
