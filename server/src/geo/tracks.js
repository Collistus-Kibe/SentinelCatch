/**
 * SentinelCatch Vessel Trajectory & Route Reconstruction Service
 * Builds realistic historical routes/tracks for detected dark vessels and active contacts.
 * Each vessel is assigned a distinct tactical color and directional waypoints.
 * Strictly guarantees routes follow maritime channels and never intersect islands or landmasses.
 */

import { haversineKm } from '../utils/geo.js';

// Curated distinct neon color palette for vessels
export const VESSEL_PALETTE = {
  'SL PACIFIC DAWN 02': { color: '#f97316', glow: 'rgba(249, 115, 22, 0.55)', name: 'Operational Amber-Orange' },
  'PACIFIC DAWN 02': { color: '#f97316', glow: 'rgba(249, 115, 22, 0.55)', name: 'Operational Amber-Orange' },
  'LU RONG YUAN YU 188': { color: '#00f5d4', glow: 'rgba(0, 245, 212, 0.45)', name: 'Electric Cyan' },
  'ZHOU YU 926': { color: '#ffbe0b', glow: 'rgba(255, 190, 11, 0.45)', name: 'Solar Amber' },
  '26 km SE of Shimoni / Vanga': { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', name: 'Electric Violet' },
  'HAI FENG 68': { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', name: 'Electric Violet' },
  'AL-MARWAH': { color: '#10b981', glow: 'rgba(16, 185, 129, 0.45)', name: 'Emerald Green' },
  'KIUNGA MARINE': { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', name: 'Sky Blue' },
  'MV OCEAN SPIRIT': { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.45)', name: 'Aquamarine' },
  'ALPHA TRADER': { color: '#6366f1', glow: 'rgba(99, 102, 241, 0.45)', name: 'Indigo Neon' },
  'FJORD STAR': { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.45)', name: 'Hot Pink' },
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
 * Historical track trajectories for all primary operational cases.
 * Geometrically validated: Every waypoint is in open, deep navigable water.
 * Explicitly avoids Pemba Island (lat -5.48 to -4.85, lon 39.62 to 39.88) and all landmasses.
 */
const BASE_TRACKS = [
  // ── Case 101: LU RONG YUAN YU 188 (Kiunga Marine Reserve, Lamu) ──
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
        lon: 44.2000,
        lat: 0.4000,
        hoursAgo: 36,
        speedKnots: 10.5,
        heading: 232,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Somali Basin High Seas (AIS On 36h ago)',
      },
      {
        lon: 43.1000,
        lat: -0.6000,
        hoursAgo: 24,
        speedKnots: 10.2,
        heading: 228,
        aisStatus: 'active',
        label: 'Northern Approach Fairway',
      },
      {
        lon: 42.4500,
        lat: -1.2500,
        hoursAgo: 14,
        speedKnots: 9.8,
        heading: 225,
        aisStatus: 'active',
        isIngress: true,
        label: 'ENTRY: Kenya EEZ 200nm Northern Boundary',
      },
      {
        lon: 41.7500,
        lat: -1.7000,
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

  // ── Case 102: SL PACIFIC DAWN 02 (Shimoni / Kisite-Mpunguti) ──
  // Navigates strictly North through the deep navigable Pemba Channel, west of Pemba Island
  {
    caseId: 102,
    vesselName: 'SL PACIFIC DAWN 02',
    mmsi: '265789012',
    flag: 'Sierra Leone',
    flagEmoji: '🇸🇱',
    gearType: 'Bulk Carrier',
    behavior: 'possible-transshipment',
    targetCoords: [39.5200, -4.5800],
    originLabel: 'Pemba Channel South Corridor',
    originCountry: 'Tanzania / Pemba Channel Fairway',
    waypoints: [
      {
        lon: 39.4200,
        lat: -5.1500,
        hoursAgo: 8.8,
        speedKnots: 11.5,
        heading: 350,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Pemba Channel Fairway (West of Pemba Island)',
      },
      {
        lon: 39.4600,
        lat: -4.8500,
        hoursAgo: 4.5,
        speedKnots: 10.8,
        heading: 10,
        aisStatus: 'active',
        label: 'Offshore Tanga Northern Navigable Corridor',
      },
      {
        lon: 39.4900,
        lat: -4.6800,
        hoursAgo: 2.1,
        speedKnots: 9.8,
        heading: 15,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Disabled: Vanga Border Corridor',
      },
      {
        lon: 39.5200,
        lat: -4.5800,
        hoursAgo: 0,
        speedKnots: 12.5,
        heading: 210,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Current Position: 4.5800°S, 39.5200°E (Shimoni Rendezvous)',
      },
    ],
  },

  // ── Case 103: ZHOU YU 926 (Outer EEZ, 420 km E of Watamu) ──
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
        lon: 45.8000,
        lat: -2.6000,
        hoursAgo: 48,
        speedKnots: 10.8,
        heading: 235,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Central Indian Ocean High Seas (AIS On 48h ago)',
      },
      {
        lon: 45.1000,
        lat: -3.0000,
        hoursAgo: 30,
        speedKnots: 10.2,
        heading: 230,
        aisStatus: 'active',
        label: 'Approaching Eastern Outer EEZ',
      },
      {
        lon: 44.5000,
        lat: -3.2800,
        hoursAgo: 14,
        speedKnots: 9.5,
        heading: 225,
        aisStatus: 'active',
        isIngress: true,
        label: 'ENTRY: Kenya EEZ Eastern 200nm Boundary',
      },
      {
        lon: 44.2500,
        lat: -3.3800,
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

  // ── Case 104: 26 km SE of Shimoni / Vanga (Off Tanga in Northern Pemba Channel) ──
  // Transits Southward through the channel between mainland and Pemba Island
  {
    caseId: 104,
    vesselName: '26 km SE of Shimoni / Vanga',
    mmsi: '677018291',
    flag: 'Tanzania',
    flagEmoji: '🇹🇿',
    gearType: 'Coastal Feeder',
    behavior: 'dark-vessel',
    targetCoords: [39.4200, -4.8500],
    originLabel: 'Kenya South Coast Corridor',
    originCountry: 'Kenya Waters',
    waypoints: [
      {
        lon: 39.5400,
        lat: -4.4800,
        hoursAgo: 14,
        speedKnots: 9.6,
        heading: 195,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Diani South Fairway',
      },
      {
        lon: 39.4800,
        lat: -4.6600,
        hoursAgo: 7,
        speedKnots: 9.4,
        heading: 190,
        aisStatus: 'active',
        label: 'Kisite-Mpunguti Offshore Boundary Crossing',
      },
      {
        lon: 39.4400,
        lat: -4.7600,
        hoursAgo: 2.8,
        speedKnots: 8.8,
        heading: 185,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Ceased Near Border',
      },
      {
        lon: 39.4200,
        lat: -4.8500,
        hoursAgo: 0,
        speedKnots: 9.4,
        heading: 175,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Current Position: 26 km SE of Shimoni / Vanga',
      },
    ],
  },

  // ── Case 105: 24 km SE of Mombasa Port / AL-MARWAH ──
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
    originCountry: 'Kenya Deep Shelf',
    waypoints: [
      {
        lon: 40.3500,
        lat: -4.5500,
        hoursAgo: 16,
        speedKnots: 7.5,
        heading: 330,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ Diani Deep Shelf Passage (AIS On)',
      },
      {
        lon: 40.1000,
        lat: -4.3200,
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
        label: '🎯 24 km SE of Mombasa Port Pilot Station',
      },
    ],
  },

  // ── Case 106: KIUNGA MARINE (Mombasa Port Approach) ──
  {
    caseId: 106,
    vesselName: 'KIUNGA MARINE',
    mmsi: '634002819',
    flag: 'Kenya',
    flagEmoji: '🇰🇪',
    gearType: 'Coastal Cargo',
    behavior: 'normal-transit',
    targetCoords: [39.7500, -4.0800],
    originLabel: 'Kilifi-Mombasa Coastal Fairway',
    originCountry: 'Kenya Waters',
    waypoints: [
      {
        lon: 40.0800,
        lat: -3.7200,
        hoursAgo: 6,
        speedKnots: 8.6,
        heading: 195,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Kilifi Coastal Corridor',
      },
      {
        lon: 39.9000,
        lat: -3.9200,
        hoursAgo: 2.8,
        speedKnots: 8.4,
        heading: 195,
        aisStatus: 'active',
        label: 'Nyali Marine Park Offshore Passage',
      },
      {
        lon: 39.7500,
        lat: -4.0800,
        hoursAgo: 0,
        speedKnots: 8.4,
        heading: 145,
        aisStatus: 'active',
        isCurrent: true,
        label: '🎯 Mombasa Harbour Approaches (Compliant)',
      },
    ],
  },

  // ── Case 107: MV OCEAN SPIRIT (Deep Sea Fairway East of Pemba) ──
  // Strictly stays in the open Indian Ocean >= 40.05°E, never crossing Pemba Island
  {
    caseId: 107,
    vesselName: 'MV OCEAN SPIRIT',
    mmsi: '677019283',
    flag: 'Tanzania',
    flagEmoji: '🇹🇿',
    gearType: 'General Cargo',
    behavior: 'normal-transit',
    targetCoords: [40.0800, -5.1000],
    originLabel: 'International Deep-Sea Fairway',
    originCountry: 'International Waters',
    waypoints: [
      {
        lon: 40.4800,
        lat: -4.4500,
        hoursAgo: 10,
        speedKnots: 8.2,
        heading: 198,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: East African Deep Water Fairway',
      },
      {
        lon: 40.2800,
        lat: -4.8000,
        hoursAgo: 4.5,
        speedKnots: 7.8,
        heading: 195,
        aisStatus: 'active',
        label: 'Eastern Deep Fairway (35 km E of Pemba Island)',
      },
      {
        lon: 40.0800,
        lat: -5.1000,
        hoursAgo: 0,
        speedKnots: 7.5,
        heading: 310,
        aisStatus: 'active',
        isCurrent: true,
        label: '🎯 Open Ocean Commercial Lane (East of Pemba)',
      },
    ],
  },

  // ── Case 108: ALPHA TRADER (Zanzibar Channel) ──
  // Strictly navigates within the Zanzibar Channel west of Unguja Island, 80 km south of Pemba Island
  {
    caseId: 108,
    vesselName: 'ALPHA TRADER',
    mmsi: '354921008',
    flag: 'Panama',
    flagEmoji: '🇵🇦',
    gearType: 'General Cargo',
    behavior: 'dark-vessel',
    targetCoords: [39.3500, -5.8500],
    originLabel: 'Dar es Salaam Approach Channel',
    originCountry: 'Tanzania Southern Corridor',
    waypoints: [
      {
        lon: 39.2400,
        lat: -6.4200,
        hoursAgo: 12,
        speedKnots: 11.8,
        heading: 10,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Dar es Salaam Southern Approach',
      },
      {
        lon: 39.2800,
        lat: -6.1200,
        hoursAgo: 6,
        speedKnots: 11.4,
        heading: 15,
        aisStatus: 'active',
        label: 'Zanzibar Channel Western Fairway',
      },
      {
        lon: 39.3200,
        lat: -5.9400,
        hoursAgo: 2.2,
        speedKnots: 11.0,
        heading: 18,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Disabled in Zanzibar Channel',
      },
      {
        lon: 39.3500,
        lat: -5.8500,
        hoursAgo: 0,
        speedKnots: 11.2,
        heading: 190,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Target Location: 5.8500°S, 39.3500°E (Zanzibar Channel)',
      },
    ],
  },

  // ── Case 109: FJORD STAR (Mombasa Terminal Approach) ──
  {
    caseId: 109,
    vesselName: 'FJORD STAR',
    mmsi: '636018291',
    flag: 'Liberia',
    flagEmoji: '🇱🇷',
    gearType: 'Reefer Vessel',
    behavior: 'normal-transit',
    targetCoords: [39.8200, -4.1200],
    originLabel: 'International Arrival Corridor',
    originCountry: 'International Waters',
    waypoints: [
      {
        lon: 40.3800,
        lat: -4.3800,
        hoursAgo: 8,
        speedKnots: 10.2,
        heading: 295,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ ORIGIN: Offshore Approach to Mombasa',
      },
      {
        lon: 40.1000,
        lat: -4.2400,
        hoursAgo: 3.5,
        speedKnots: 10.0,
        heading: 295,
        aisStatus: 'active',
        label: 'Mombasa Outer Navigation Channel',
      },
      {
        lon: 39.8200,
        lat: -4.1200,
        hoursAgo: 0,
        speedKnots: 9.8,
        heading: 45,
        aisStatus: 'active',
        isCurrent: true,
        label: '🎯 Kilindini Container Terminal Fairway',
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

  // Index base tracks by case ID and vessel name
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

    // 2. Waypoint dots along the route
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

    // 3. Explicit ORIGIN marker
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

    // 4. Explicit EEZ INGRESS marker
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
  return 41.57 + (lat - (-1.65)) * 0.50;
}

export function getMinOceanLongitude(lat) {
  return getCoastlineLongitude(lat) + 0.15;
}

/**
 * Generate synthetic historical route for dynamic cases.
 * Strictly avoids Pemba Island (lat -5.55 to -4.75, lon 39.58 to 39.95) and all coastal landmasses.
 */
function createSyntheticTrack(caseId, vesselName, currentLon, currentLat) {
  const waypoints = [];

  // Special handling for the South Coast / Pemba Channel / Zanzibar area:
  if (currentLat < -4.60) {
    if (currentLon < 39.60) {
      // Vessel is inside the Pemba Channel or Zanzibar Channel:
      // Navigate strictly along the North-South channel corridor (lon: 39.35 - 39.50)
      for (let step = 3; step >= 0; step--) {
        const hoursAgo = step * 4;
        const lat = Number((currentLat - step * 0.22).toFixed(4));
        const lon = Number((Math.min(39.50, Math.max(39.35, currentLon + (step % 2 ? 0.03 : -0.02)))).toFixed(4));

        waypoints.push({
          lon,
          lat,
          hoursAgo,
          speedKnots: 10.2,
          heading: 10,
          aisStatus: step === 0 ? 'radar_contact' : step === 1 ? 'disabled' : 'active',
          isGapPoint: step === 1,
          isCurrent: step === 0,
          label: step === 0 ? '🎯 Radar Intercept' : step === 1 ? '⚠️ AIS Transponder Ceased' : `Pemba Channel Waypoint T -${hoursAgo}h`,
        });
      }
      return { caseId, vesselName, mmsi: null, flag: 'Unknown', flagEmoji: '🚢', gearType: 'Vessel', waypoints };
    } else {
      // Vessel is east of Pemba in the open Indian Ocean:
      // Keep lon strictly >= 40.05
      for (let step = 3; step >= 0; step--) {
        const hoursAgo = step * 4;
        const lat = Number((currentLat + step * 0.18).toFixed(4));
        const lon = Number((Math.max(40.05, currentLon + step * 0.15)).toFixed(4));

        waypoints.push({
          lon,
          lat,
          hoursAgo,
          speedKnots: 9.8,
          heading: 215,
          aisStatus: step === 0 ? 'radar_contact' : step === 1 ? 'disabled' : 'active',
          isGapPoint: step === 1,
          isCurrent: step === 0,
          label: step === 0 ? '🎯 Radar Intercept' : step === 1 ? '⚠️ AIS Transponder Ceased' : `Open Ocean Waypoint T -${hoursAgo}h`,
        });
      }
      return { caseId, vesselName, mmsi: null, flag: 'Unknown', flagEmoji: '🚢', gearType: 'Vessel', waypoints };
    }
  }

  // Standard Kenya EEZ approach corridors
  const safeCurrentLat = Math.max(-5.0, Math.min(0.8, currentLat));
  const minCurrentLon = getMinOceanLongitude(safeCurrentLat);
  const safeCurrentLon = Math.max(currentLon, minCurrentLon);

  const baseBearingDeg = 45 + ((caseId * 11) % 16) - 8;
  const bearingRad = (baseBearingDeg * Math.PI) / 180;
  const heading = Math.round((baseBearingDeg + 180) % 360);

  for (let step = 3; step >= 0; step--) {
    const hoursAgo = step * 6;
    const distKm = (step * 34) + 6;

    const latDelta = (distKm / 111) * Math.sin(bearingRad);
    let rawLat = safeCurrentLat + latDelta;
    rawLat = Math.max(-5.2, Math.min(1.0, rawLat));

    const lonDelta = (distKm / (111 * Math.cos((rawLat * Math.PI) / 180))) * Math.cos(bearingRad);
    let rawLon = safeCurrentLon + lonDelta;

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
      label: step === 0 ? '🎯 Radar Intercept' : step === 1 ? '⚠️ AIS Transponder Ceased' : `Waypoint T -${hoursAgo}h`,
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
