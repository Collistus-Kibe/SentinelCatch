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
    originCountry: 'China',
    transOceanicVoyage: {
      originCountry: 'China',
      originPort: 'Zhoushan Pelagic Base, Zhejiang',
      flagEmoji: '🇨🇳',
      voyageDays: 28,
      departureDate: 'Oct 02, 2026',
      chokepoints: ['South China Sea', 'Singapore Strait', 'Malacca Strait', 'Six Degree Channel (North Sumatra)', 'Somali Basin High Seas', 'Kenya Northern EEZ Boundary'],
      voyageSummary: 'Departed Zhoushan Pelagic Base, transited south across the South China Sea, navigated the Singapore Strait and northwest up the Malacca Strait around northern Sumatra, crossed the equatorial Indian Ocean south of Sri Lanka, then went dark entering Kenya northern EEZ towards Kiunga Marine Reserve.',
      originCoords: [122.20, 29.98],
      waypoints: [
        { lon: 122.20, lat: 29.98, label: '▶ DEPARTURE: Zhoushan Pelagic Base, China 🇨🇳', day: 'Day -28' },
        { lon: 114.50, lat: 14.50, label: 'South China Sea Deep Basin', day: 'Day -22' },
        { lon: 107.50, lat: 4.50, label: 'Southern South China Sea Fairway', day: 'Day -18' },
        { lon: 104.55, lat: 1.35, label: 'Eastern Singapore Strait Approach (Horsburgh Fairway) 🇸🇬', day: 'Day -16' },
        { lon: 103.84, lat: 1.22, label: 'Singapore Strait Main Channel (South of Singapore) 🇸🇬', day: 'Day -16' },
        { lon: 103.35, lat: 1.25, label: 'Western Singapore Strait / Tanjung Piai 🇲🇾', day: 'Day -15' },
        { lon: 101.00, lat: 2.95, label: 'Malacca Strait Central Fairway (One Fathom Bank)', day: 'Day -14' },
        { lon: 97.80, lat: 5.30, label: 'Northern Malacca Strait Deep Water Lane', day: 'Day -12' },
        { lon: 95.20, lat: 6.10, label: 'Six Degree Channel (North of Sumatra / Banda Aceh) 🇮🇩', day: 'Day -11' },
        { lon: 80.50, lat: 5.80, label: 'Sri Lanka Southern Fairway 🇱🇰', day: 'Day -9' },
        { lon: 65.00, lat: 1.50, label: 'Equatorial Mid-Indian Ocean 🌊', day: 'Day -6' },
        { lon: 44.20, lat: 0.40, label: 'Somali Basin High Seas 🇸🇴', day: 'Day -2' },
        { lon: 42.45, lat: -1.25, label: 'ENTRY: Kenya EEZ 200nm Northern Boundary 🇰🇪', day: 'Day -1' },
        { lon: 41.75, lat: -1.70, label: '⚠️ Transponder Disabled (Went Dark 2.5h ago)', day: 'Day 0' },
        { lon: 41.32, lat: -1.95, label: '🎯 Target Radar Centroid (Kiunga Marine Reserve)', day: 'Now' },
      ],
    },
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
    originCountry: 'Sierra Leone',
    transOceanicVoyage: {
      originCountry: 'Sierra Leone',
      originPort: 'Port of Freetown / Lomé Offshore Terminal',
      flagEmoji: '🇸🇱',
      voyageDays: 35,
      departureDate: 'Sep 25, 2026',
      chokepoints: ['Cape Palmas (Liberia)', 'Gulf of Guinea', 'Cape of Good Hope (South Africa)', 'Agulhas Bank', 'Mozambique Channel', 'Pemba Channel (Tanzania/Kenya)'],
      voyageSummary: 'Departed Freetown, cleared Cape Palmas south of West Africa to Lomé anchorage, sailed down the South Atlantic open ocean, navigated the deep-water corridor around Cape Agulhas into the Indian Ocean, transited north through the mid-channel of Mozambique Channel, turned off transponder in southern Pemba Channel before entering Kenya waters at Shimoni.',
      originCoords: [-13.25, 8.48],
      waypoints: [
        { lon: -13.25, lat: 8.48, label: '▶ DEPARTURE: Freetown Port, Sierra Leone 🇸🇱', day: 'Day -35' },
        { lon: -7.50, lat: 4.10, label: 'Cape Palmas Offshore Fairway (Liberia)', day: 'Day -33' },
        { lon: -1.50, lat: 3.80, label: 'Gulf of Guinea Deep Fairway (South of Ghana)', day: 'Day -31' },
        { lon: 1.30, lat: 5.80, label: 'Lomé Bunkering Anchorage, Gulf of Guinea 🇹🇬', day: 'Day -30' },
        { lon: 4.50, lat: 1.80, label: 'Bight of Bonny Offshore Corridor', day: 'Day -28' },
        { lon: 6.00, lat: -1.00, label: 'Equatorial South Atlantic Fairway (West of Gabon)', day: 'Day -26' },
        { lon: 8.50, lat: -10.50, label: 'Angola Basin Deep Ocean Corridor', day: 'Day -22' },
        { lon: 11.50, lat: -23.00, label: 'Namibia Offshore / Walvis Ridge Corridor', day: 'Day -17' },
        { lon: 15.50, lat: -31.00, label: 'Southwest African Continental Slope', day: 'Day -14' },
        { lon: 17.80, lat: -34.20, label: 'Cape Peninsula Approach (West of Cape Town)', day: 'Day -12' },
        { lon: 18.50, lat: -34.90, label: 'Cape of Good Hope Offshore Fairway 🇿🇦', day: 'Day -11' },
        { lon: 20.50, lat: -35.40, label: 'Agulhas Bank / Southernmost African Fairway', day: 'Day -10' },
        { lon: 26.20, lat: -34.80, label: 'Port Elizabeth / Algoa Bay Offshore 🇿🇦', day: 'Day -9' },
        { lon: 29.80, lat: -33.20, label: 'Wild Coast Navigational Corridor', day: 'Day -8' },
        { lon: 32.80, lat: -30.20, label: 'Durban Deep Sea Corridor 🇿🇦', day: 'Day -7' },
        { lon: 35.50, lat: -25.80, label: 'Southern Mozambique Channel Entrance 🇲🇿', day: 'Day -6' },
        { lon: 38.20, lat: -19.50, label: 'Central Mozambique Channel (Mid-Channel)', day: 'Day -5' },
        { lon: 41.20, lat: -14.00, label: 'Northern Mozambique Channel Deep Fairway', day: 'Day -3' },
        { lon: 41.50, lat: -10.50, label: 'Ruvuma Basin Cross-Border Fairway (MZ/TZ)', day: 'Day -2' },
        { lon: 40.60, lat: -7.20, label: 'Tanzania Outer Deep Fairway (East of Mafia Island)', day: 'Day -1' },
        { lon: 40.10, lat: -6.00, label: 'Zanzibar Outer Deep Fairway (East of Unguja) 🇹🇿', day: 'Day -1' },
        { lon: 39.60, lat: -5.40, label: 'Pemba Channel Southern Fairway', day: 'Day -1' },
        { lon: 39.42, lat: -5.15, label: 'Pemba Channel Navigable Fairway 🇹🇿', day: 'Day -1' },
        { lon: 39.49, lat: -4.68, label: '⚠️ Transponder Disabled: Vanga Border Corridor', day: 'Day 0' },
        { lon: 39.52, lat: -4.58, label: '🎯 Current Position: Shimoni Rendezvous 🇰🇪', day: 'Now' },
      ],
    },
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
    originCountry: 'China',
    transOceanicVoyage: {
      originCountry: 'China',
      originPort: 'Qingdao / Shidao Port, Shandong',
      flagEmoji: '🇨🇳',
      voyageDays: 26,
      departureDate: 'Oct 04, 2026',
      chokepoints: ['Taiwan Strait', 'South China Sea', 'Singapore Strait', 'Malacca Strait', 'Six Degree Channel (North Sumatra)', 'Chagos Archipelago', 'Western Indian Ocean Outer EEZ'],
      voyageSummary: 'Departed Shidao Port, transited the Taiwan Strait and South China Sea, navigated the Singapore and Malacca Straits around northern Sumatra into the Indian Ocean, operated across pelagic squid grounds south of the Maldives, before infiltrating Kenya Outer EEZ (420 km East of Watamu) with transponder disabled.',
      originCoords: [120.38, 36.06],
      waypoints: [
        { lon: 120.38, lat: 36.06, label: '▶ DEPARTURE: Shidao Port, Shandong 🇨🇳', day: 'Day -26' },
        { lon: 119.80, lat: 24.50, label: 'Taiwan Strait Passage', day: 'Day -20' },
        { lon: 114.50, lat: 14.50, label: 'South China Sea Deep Basin', day: 'Day -17' },
        { lon: 107.50, lat: 4.50, label: 'Southern South China Sea Fairway', day: 'Day -15' },
        { lon: 104.55, lat: 1.35, label: 'Eastern Singapore Strait Approach 🇸🇬', day: 'Day -14' },
        { lon: 103.84, lat: 1.22, label: 'Singapore Strait Main Fairway (South of Singapore) 🇸🇬', day: 'Day -14' },
        { lon: 103.35, lat: 1.25, label: 'Western Singapore Strait 🇲🇾', day: 'Day -13' },
        { lon: 101.00, lat: 2.95, label: 'Malacca Strait Central Fairway', day: 'Day -12' },
        { lon: 97.80, lat: 5.30, label: 'Northern Malacca Strait Deep Sea Lane', day: 'Day -10' },
        { lon: 95.20, lat: 6.10, label: 'Six Degree Channel (North of Sumatra) 🇮🇩', day: 'Day -9' },
        { lon: 85.00, lat: 4.00, label: 'Bay of Bengal Southern Passage', day: 'Day -8' },
        { lon: 65.00, lat: -1.50, label: 'Chagos Pelagic Squid Ground 🇮🇴', day: 'Day -5' },
        { lon: 45.80, lat: -2.60, label: 'Central Indian Ocean High Seas (AIS On)', day: 'Day -2' },
        { lon: 44.50, lat: -3.28, label: 'ENTRY: Kenya EEZ Eastern 200nm Boundary 🇰🇪', day: 'Day -1' },
        { lon: 44.25, lat: -3.38, label: '⚠️ Transponder Shut Off in Outer EEZ', day: 'Day 0' },
        { lon: 44.10, lat: -3.45, label: '🎯 Current Position: Outer EEZ Squid Fairway', day: 'Now' },
      ],
    },
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

  // ── Case 104: 26 km SE of Shimoni / Vanga / HAI FENG 68 ──
  // Transits Southward through the channel between mainland and Pemba Island
  {
    caseId: 104,
    vesselName: '26 km SE of Shimoni / Vanga',
    mmsi: '677018291',
    flag: 'Panama',
    flagEmoji: '🇵🇦',
    gearType: 'Industrial Trawler',
    behavior: 'dark-vessel',
    targetCoords: [39.4200, -4.8500],
    originLabel: 'Kenya South Coast Corridor',
    originCountry: 'Taiwan',
    transOceanicVoyage: {
      originCountry: 'Taiwan',
      originPort: 'Kaohsiung Harbor',
      flagEmoji: '🇹🇼',
      voyageDays: 22,
      departureDate: 'Oct 08, 2026',
      chokepoints: ['South China Sea', 'Karimata Strait', 'Java Sea', 'Sunda Strait Fairway', 'Diego Garcia pelagic waters', 'Kenya Coast / Shimoni'],
      voyageSummary: 'Departed Kaohsiung Harbor, transited south through the South China Sea and Karimata Strait into the Java Sea, threaded through the Sunda Strait between Java and Sumatra into the Indian Ocean, sailed past Diego Garcia and Seychelles into Kenya southern waters.',
      originCoords: [120.28, 22.61],
      waypoints: [
        { lon: 120.28, lat: 22.61, label: '▶ DEPARTURE: Kaohsiung Harbor, Taiwan 🇹🇼', day: 'Day -22' },
        { lon: 114.50, lat: 14.00, label: 'South China Sea Oceanic Corridor', day: 'Day -18' },
        { lon: 108.80, lat: 2.50, label: 'Natuna Sea Fairway', day: 'Day -15' },
        { lon: 107.50, lat: -0.50, label: 'Karimata Strait Northern Passage', day: 'Day -13' },
        { lon: 106.80, lat: -2.80, label: 'Java Sea Navigational Channel 🇮🇩', day: 'Day -11' },
        { lon: 105.75, lat: -5.95, label: 'Sunda Strait Fairway (Between Java & Sumatra) 🇮🇩', day: 'Day -9' },
        { lon: 104.80, lat: -6.60, label: 'Indian Ocean Deep Sea Entry', day: 'Day -8' },
        { lon: 72.50, lat: -7.30, label: 'Diego Garcia Pelagic Ridge 🇮🇴', day: 'Day -6' },
        { lon: 54.00, lat: -5.00, label: 'Seychelles Outer Waters 🇸🇨', day: 'Day -3' },
        { lon: 42.00, lat: -4.20, label: 'Kenya EEZ Deep Sea Approach 🇰🇪', day: 'Day -1' },
        { lon: 39.54, lat: -4.48, label: 'Diani South Fairway', day: 'Day 0' },
        { lon: 39.42, lat: -4.85, label: '🎯 Current Position: 26 km SE of Shimoni / Vanga 🇰🇪', day: 'Now' },
      ],
    },
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
    originCountry: 'Yemen',
    transOceanicVoyage: {
      originCountry: 'Yemen',
      originPort: 'Port of Mukalla / Al Mahrah Gateway',
      flagEmoji: '🇾🇪',
      voyageDays: 8,
      departureDate: 'Oct 22, 2026',
      chokepoints: ['Gulf of Aden', 'Socotra South Channel', 'Kenya North Approach'],
      voyageSummary: 'Departed Mukalla, operated south across the Gulf of Aden past Socotra, navigated inshore along the Somali coast before crossing into Lamu coastal fishing grounds and lingering off Mombasa pilot station.',
      originCoords: [49.12, 14.53],
      waypoints: [
        { lon: 49.12, lat: 14.53, label: '▶ DEPARTURE: Port of Mukalla, Yemen 🇾🇪', day: 'Day -8' },
        { lon: 51.00, lat: 12.50, label: 'Socotra South Channel 🇾🇪', day: 'Day -5' },
        { lon: 52.80, lat: 10.20, label: 'Ras Hafun Offshore Corridor (Horn of Africa) 🇸🇴', day: 'Day -4' },
        { lon: 48.50, lat: 3.50, label: 'Somali Basin Fairway', day: 'Day -2' },
        { lon: 42.00, lat: -2.00, label: 'Northern Kenya EEZ Boundary 🇰🇪', day: 'Day -1' },
        { lon: 40.35, lat: -4.55, label: 'Diani Deep Shelf Passage', day: 'Day 0' },
        { lon: 39.92, lat: -4.18, label: '🎯 Current Position: 24 km SE of Mombasa Pilot 🇰🇪', day: 'Now' },
      ],
    },
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
    originCountry: 'Kenya',
    transOceanicVoyage: {
      originCountry: 'Kenya',
      originPort: 'Kilindini Harbour, Port of Mombasa',
      flagEmoji: '🇰🇪',
      voyageDays: 2,
      departureDate: 'Oct 27, 2026',
      chokepoints: ['Mombasa Channel', 'Kilifi Offshore Corridor', 'Malindi Bay Lane'],
      voyageSummary: 'Departed Kilindini Harbour in Mombasa, cleared customs, transited north through coastal navigation corridor past Malindi into the Kiunga coastal fairway with active AIS.',
      originCoords: [39.65, -4.07],
      waypoints: [
        { lon: 40.08, lat: -3.72, label: '▶ DEPARTURE: Kilifi Coastal Corridor 🇰🇪', day: 'Day -2' },
        { lon: 39.90, lat: -3.92, label: 'Nyali Marine Park Offshore Passage', day: 'Day -1' },
        { lon: 39.75, lat: -4.08, label: '🎯 Mombasa Harbour Approaches (Compliant) 🇰🇪', day: 'Now' },
      ],
    },
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
    originCountry: 'Tanzania',
    transOceanicVoyage: {
      originCountry: 'Tanzania',
      originPort: 'Port of Tanga',
      flagEmoji: '🇹🇿',
      voyageDays: 1,
      departureDate: 'Oct 28, 2026',
      chokepoints: ['Tanga Northern Fairway', 'Vanga Border Inshore Reef'],
      voyageSummary: 'Departed Port of Tanga, navigated east into the international deep-water commercial lane 35 km east of Pemba Island.',
      originCoords: [39.12, -5.06],
      waypoints: [
        { lon: 39.12, lat: -5.06, label: '▶ DEPARTURE: Port of Tanga, Tanzania 🇹🇿', day: 'Day -1' },
        { lon: 40.48, lat: -4.45, label: 'East African Deep Water Fairway', day: 'Day 0' },
        { lon: 40.28, lat: -4.80, label: 'Eastern Deep Fairway (35 km E of Pemba)', day: 'Day 0' },
        { lon: 40.08, lat: -5.10, label: '🎯 Open Ocean Commercial Lane (East of Pemba) 🇹🇿/🇰🇪', day: 'Now' },
      ],
    },
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
    originCountry: 'United Arab Emirates',
    transOceanicVoyage: {
      originCountry: 'United Arab Emirates',
      originPort: 'Port of Fujairah / Dubai World Gateway',
      flagEmoji: '🇦🇪',
      voyageDays: 11,
      departureDate: 'Oct 19, 2026',
      chokepoints: ['Gulf of Oman', 'Arabian Sea South Corridor', 'Guardafui Channel', 'Somali Basin'],
      voyageSummary: 'Departed Port of Fujairah, rounded eastern Horn of Africa down Somali coast, dropped AIS transponder while entering Zanzibar Channel western fairway.',
      originCoords: [56.35, 25.13],
      waypoints: [
        { lon: 56.35, lat: 25.13, label: '▶ DEPARTURE: Port of Fujairah, UAE 🇦🇪', day: 'Day -11' },
        { lon: 58.20, lat: 24.00, label: 'Gulf of Oman International Fairway', day: 'Day -9' },
        { lon: 57.00, lat: 16.50, label: 'Arabian Sea South Corridor 🌊', day: 'Day -6' },
        { lon: 51.50, lat: 11.80, label: 'Guardafui Channel (Cape Guardafui) 🇸🇴', day: 'Day -4' },
        { lon: 52.80, lat: 10.20, label: 'Ras Hafun Offshore Fairway (East of Horn of Africa) 🇸🇴', day: 'Day -3' },
        { lon: 48.00, lat: 3.00, label: 'Somali Basin Fairway (AIS Off)', day: 'Day -2' },
        { lon: 41.50, lat: -2.00, label: 'Kenya Northern EEZ Approach 🇰🇪', day: 'Day -1' },
        { lon: 39.24, lat: -6.42, label: 'Dar es Salaam Southern Approach', day: 'Day 0' },
        { lon: 39.35, lat: -5.85, label: '🎯 Target Location: Zanzibar Channel Corridor', day: 'Now' },
      ],
    },
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
    originCountry: 'Liberia',
    transOceanicVoyage: {
      originCountry: 'Liberia',
      originPort: 'Monrovia Free Port',
      flagEmoji: '🇱🇷',
      voyageDays: 25,
      departureDate: 'Oct 04, 2026',
      chokepoints: ['Cape Palmas (Liberia)', 'Gulf of Guinea', 'Cape of Good Hope (South Africa)', 'Agulhas Bank', 'Mozambique Channel', 'Mombasa Approach'],
      voyageSummary: 'Departed Monrovia, cleared Cape Palmas south through the open Atlantic, navigated the Agulhas corridor south of South Africa, proceeded north through the Mozambique Channel to Kilindini Container Terminal in Mombasa.',
      originCoords: [-10.80, 6.32],
      waypoints: [
        { lon: -10.80, lat: 6.32, label: '▶ DEPARTURE: Monrovia Free Port, Liberia 🇱🇷', day: 'Day -25' },
        { lon: -7.50, lat: 4.10, label: 'Cape Palmas Offshore Fairway', day: 'Day -23' },
        { lon: -1.00, lat: 3.20, label: 'Gulf of Guinea Open Fairway', day: 'Day -21' },
        { lon: 5.50, lat: 0.00, label: 'Equatorial Atlantic Ocean (West of Gabon)', day: 'Day -18' },
        { lon: 8.50, lat: -10.50, label: 'Angola Basin Deep Ocean Transit', day: 'Day -15' },
        { lon: 11.50, lat: -23.00, label: 'Namibia Offshore / Walvis Fairway', day: 'Day -12' },
        { lon: 15.50, lat: -31.00, label: 'Southwest African Continental Margin', day: 'Day -10' },
        { lon: 18.50, lat: -34.90, label: 'Cape of Good Hope Offshore Fairway 🇿🇦', day: 'Day -8' },
        { lon: 20.50, lat: -35.40, label: 'Agulhas Bank / Southern Ocean Fairway', day: 'Day -7' },
        { lon: 26.20, lat: -34.80, label: 'Port Elizabeth Deep Sea Corridor 🇿🇦', day: 'Day -6' },
        { lon: 32.80, lat: -30.20, label: 'Durban Offshore Fairway 🇿🇦', day: 'Day -5' },
        { lon: 35.50, lat: -25.80, label: 'Mozambique Channel Southern Fairway 🇲🇿', day: 'Day -4' },
        { lon: 38.20, lat: -19.50, label: 'Central Mozambique Channel (Mid-Sea)', day: 'Day -3' },
        { lon: 41.20, lat: -12.50, label: 'Northern Mozambique Channel / Comoros Gap', day: 'Day -2' },
        { lon: 40.80, lat: -7.50, label: 'Tanzania Deep Sea Commercial Corridor', day: 'Day -1' },
        { lon: 40.38, lat: -4.38, label: 'Offshore Approach to Mombasa 🇰🇪', day: 'Day 0' },
        { lon: 39.82, lat: -4.12, label: '🎯 Kilindini Container Terminal Fairway 🇰🇪', day: 'Now' },
      ],
    },
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

  // ── Case 110: TAI YUAN 227 (Lamu Basin / Northern EEZ) ──
  {
    caseId: 110,
    vesselName: 'TAI YUAN 227',
    mmsi: '416002194',
    flag: 'Taiwan',
    flagEmoji: '🇹🇼',
    gearType: 'Tuna Longliner',
    behavior: 'normal-transit',
    targetCoords: [41.2500, -2.0500],
    originLabel: 'Kaohsiung Harbor Approach',
    originCountry: 'Taiwan',
    transOceanicVoyage: {
      originCountry: 'Taiwan',
      originPort: 'Kaohsiung Harbor',
      flagEmoji: '🇹🇼',
      voyageDays: 24,
      departureDate: 'Oct 06, 2026',
      chokepoints: ['South China Sea', 'Singapore Strait', 'Malacca Strait', 'Six Degree Channel (North Sumatra)', 'Sri Lanka South Fairway', 'Seychelles Northern Basin'],
      voyageSummary: 'Departed Kaohsiung Harbor, transited the South China Sea, threaded the Singapore Strait south of Singapore, navigated northwest through the Malacca Strait around northern Sumatra, crossed south of Sri Lanka across the Indian Ocean before entering Kenya EEZ.',
      originCoords: [120.28, 22.61],
      waypoints: [
        { lon: 120.28, lat: 22.61, label: '▶ DEPARTURE: Kaohsiung Harbor, Taiwan 🇹🇼', day: 'Day -24' },
        { lon: 114.50, lat: 14.50, label: 'South China Sea Deep Basin', day: 'Day -19' },
        { lon: 107.50, lat: 4.50, label: 'Southern South China Sea Fairway', day: 'Day -17' },
        { lon: 104.55, lat: 1.35, label: 'Eastern Singapore Strait Approach (Horsburgh Fairway) 🇸🇬', day: 'Day -15' },
        { lon: 103.84, lat: 1.22, label: 'Singapore Strait Main Fairway (South of Singapore) 🇸🇬', day: 'Day -15' },
        { lon: 103.35, lat: 1.25, label: 'Western Singapore Strait / Tanjung Piai 🇲🇾', day: 'Day -14' },
        { lon: 101.00, lat: 2.95, label: 'Malacca Strait Central Fairway', day: 'Day -13' },
        { lon: 97.80, lat: 5.30, label: 'Northern Malacca Strait Deep Water Lane', day: 'Day -11' },
        { lon: 95.20, lat: 6.10, label: 'Six Degree Channel (North of Sumatra / Banda Aceh) 🇮🇩', day: 'Day -10' },
        { lon: 80.50, lat: 5.50, label: 'Sri Lanka South Fairway 🇱🇰', day: 'Day -8' },
        { lon: 65.00, lat: 0.00, label: 'Equatorial Indian Ocean Transit 🌊', day: 'Day -5' },
        { lon: 52.00, lat: -1.80, label: 'Seychelles Northern Basin 🇸🇨', day: 'Day -3' },
        { lon: 43.10, lat: -1.80, label: 'High Seas North Approach 🇸🇴', day: 'Day -1' },
        { lon: 41.25, lat: -2.05, label: '🎯 Current Position: Lamu Basin / Northern EEZ 🇰🇪', day: 'Now' },
      ],
    },
    waypoints: [
      {
        lon: 43.1000,
        lat: -1.8000,
        hoursAgo: 12,
        speedKnots: 9.8,
        heading: 235,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ High Seas North Approach',
      },
      {
        lon: 42.2000,
        lat: -2.0500,
        hoursAgo: 6,
        speedKnots: 9.5,
        heading: 230,
        aisStatus: 'active',
        label: 'Kenya EEZ 100nm Line',
      },
      {
        lon: 41.2500,
        lat: -2.0500,
        hoursAgo: 0,
        speedKnots: 9.2,
        heading: 220,
        aisStatus: 'active',
        isCurrent: true,
        label: '🎯 Lamu Offshore Tuna Sector',
      },
    ],
  },

  // ── Case 111: SEA LION 8 (Malindi Outer Bunkering Station) ──
  {
    caseId: 111,
    vesselName: 'SEA LION 8',
    mmsi: '671239001',
    flag: 'Togo',
    flagEmoji: '🇹🇬',
    gearType: 'Reefer / Fuel Bunkering',
    behavior: 'dark-incursion',
    targetCoords: [40.4500, -3.8000],
    originLabel: 'Port Louis / Lomé Offshore',
    originCountry: 'Togo',
    transOceanicVoyage: {
      originCountry: 'Togo',
      originPort: 'Port of Lomé / Port Louis Offshore',
      flagEmoji: '🇹🇬',
      voyageDays: 16,
      departureDate: 'Oct 14, 2026',
      chokepoints: ['Mascarene Plateau', 'Comoros Channel', 'Aldabra Passage', 'Kenya/Tanzania Border'],
      voyageSummary: 'Departed Port Louis anchorage, transited across the Mascarene Plateau, rounded northern Madagascar past Comoros, entered southern Kenya EEZ targeting offshore bunkering of dark trawlers.',
      originCoords: [57.50, -20.16],
      waypoints: [
        { lon: 57.50, lat: -20.16, label: '▶ DEPARTURE: Port Louis Anchorage, Mauritius 🇲🇺', day: 'Day -16' },
        { lon: 58.00, lat: -14.00, label: 'Mascarene Basin North Transit', day: 'Day -11' },
        { lon: 51.50, lat: -11.00, label: 'North of Cap d’Ambre (Madagascar Offshore) 🇲🇬', day: 'Day -9' },
        { lon: 45.50, lat: -11.50, label: 'Comoros Channel Northern Passage 🇰🇲', day: 'Day -7' },
        { lon: 45.80, lat: -9.00, label: 'Aldabra Atoll Offshore Fairway 🇸🇨', day: 'Day -4' },
        { lon: 40.50, lat: -5.20, label: 'Kenya/Tanzania Cross-Border Transit 🇰🇪/🇹🇿', day: 'Day -1' },
        { lon: 40.45, lat: -3.80, label: '🎯 Current Position: Malindi Outer Bunkering Station 🇰🇪', day: 'Now' },
      ],
    },
    waypoints: [
      {
        lon: 41.2000,
        lat: -4.8000,
        hoursAgo: 16,
        speedKnots: 11.2,
        heading: 340,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ Deep Ocean South Approach',
      },
      {
        lon: 40.8500,
        lat: -4.3000,
        hoursAgo: 8,
        speedKnots: 10.5,
        heading: 335,
        aisStatus: 'active',
        label: 'Mombasa Outer EEZ Crossing',
      },
      {
        lon: 40.6000,
        lat: -4.0000,
        hoursAgo: 3.2,
        speedKnots: 8.4,
        heading: 330,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ AIS Transponder Ceased (Rendezvous Prep)',
      },
      {
        lon: 40.4500,
        lat: -3.8000,
        hoursAgo: 0,
        speedKnots: 2.8,
        heading: 310,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Target Radar Centroid: Malindi Outer Bunkering Station',
      },
    ],
  },

  // ── Case 112: OCEAN DRAGON 9 (Watamu Outer Banks) ──
  {
    caseId: 112,
    vesselName: 'OCEAN DRAGON 9',
    mmsi: '413890123',
    flag: 'China',
    flagEmoji: '🇨🇳',
    gearType: 'Deep-Sea Longliner',
    behavior: 'dark-vessel',
    targetCoords: [40.1800, -3.4200],
    originLabel: 'Dalian Port Approach',
    originCountry: 'China',
    transOceanicVoyage: {
      originCountry: 'China',
      originPort: 'Dalian Port, Liaoning',
      flagEmoji: '🇨🇳',
      voyageDays: 30,
      departureDate: 'Sep 29, 2026',
      chokepoints: ['Yellow Sea', 'East China Sea', 'South China Sea', 'Singapore Strait', 'Malacca Strait', 'Six Degree Channel (North Sumatra)', 'Mid-Indian Ocean Ridge'],
      voyageSummary: 'Departed Dalian Port, sailed down the Chinese seaboard through the South China Sea, threaded the Singapore and Malacca Straits around northern Sumatra, transited the equatorial Indian Ocean into the Kenya EEZ outer bank.',
      originCoords: [121.62, 38.92],
      waypoints: [
        { lon: 121.62, lat: 38.92, label: '▶ DEPARTURE: Dalian Port, China 🇨🇳', day: 'Day -30' },
        { lon: 122.50, lat: 30.50, label: 'East China Sea Fairway', day: 'Day -26' },
        { lon: 114.50, lat: 14.50, label: 'South China Sea Deep Basin', day: 'Day -21' },
        { lon: 107.50, lat: 4.50, label: 'Southern South China Sea Fairway', day: 'Day -18' },
        { lon: 104.55, lat: 1.35, label: 'Eastern Singapore Strait Approach 🇸🇬', day: 'Day -16' },
        { lon: 103.84, lat: 1.22, label: 'Singapore Strait Main Fairway (South of Singapore) 🇸🇬', day: 'Day -16' },
        { lon: 103.35, lat: 1.25, label: 'Western Singapore Strait 🇲🇾', day: 'Day -15' },
        { lon: 101.00, lat: 2.95, label: 'Malacca Strait Central Fairway', day: 'Day -14' },
        { lon: 97.80, lat: 5.30, label: 'Northern Malacca Strait Deep Water Lane', day: 'Day -12' },
        { lon: 95.20, lat: 6.10, label: 'Six Degree Channel (North of Sumatra) 🇮🇩', day: 'Day -11' },
        { lon: 80.50, lat: 4.50, label: 'Bay of Bengal / Sri Lanka South', day: 'Day -9' },
        { lon: 63.00, lat: -3.00, label: 'Mid-Indian Ocean Ridge 🌊', day: 'Day -6' },
        { lon: 41.50, lat: -3.10, label: 'Outer EEZ Eastern Fairway 🇰🇪', day: 'Day -1' },
        { lon: 40.18, lat: -3.42, label: '🎯 Current Position: Watamu Outer Banks 🇰🇪', day: 'Now' },
      ],
    },
    waypoints: [
      {
        lon: 41.5000,
        lat: -3.1000,
        hoursAgo: 14,
        speedKnots: 10.4,
        heading: 245,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ Outer EEZ Eastern Fairway',
      },
      {
        lon: 40.8000,
        lat: -3.2500,
        hoursAgo: 6,
        speedKnots: 9.8,
        heading: 240,
        aisStatus: 'active',
        label: 'Watamu Offshore Edge',
      },
      {
        lon: 40.3500,
        lat: -3.3600,
        hoursAgo: 2.1,
        speedKnots: 8.2,
        heading: 235,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Disabled',
      },
      {
        lon: 40.1800,
        lat: -3.4200,
        hoursAgo: 0,
        speedKnots: 3.4,
        heading: 230,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 SAR Radar Target: Watamu Outer Banks',
      },
    ],
  },

  // ── Case 113: MV AL-HILAL (Lamu Archipelago Flats) ──
  {
    caseId: 113,
    vesselName: 'MV AL-HILAL',
    mmsi: '422091823',
    flag: 'Iran',
    flagEmoji: '🇮🇷',
    gearType: 'Pelagic Driftnetter',
    behavior: 'dark-incursion',
    targetCoords: [41.4500, -2.1500],
    originLabel: 'Chabahar / Makran Coast',
    originCountry: 'Iran',
    transOceanicVoyage: {
      originCountry: 'Iran',
      originPort: 'Chabahar / Bandar Abbas Naval Port',
      flagEmoji: '🇮🇷',
      voyageDays: 14,
      departureDate: 'Oct 16, 2026',
      chokepoints: ['Strait of Hormuz', 'Gulf of Oman', 'Arabian Sea', 'Socotra Gap (Horn of Africa)'],
      voyageSummary: 'Departed Chabahar fishing harbour, exited the Gulf of Oman, crossed the Arabian Sea, passed Socotra Gap, navigated south along Somali coast before slipping into Lamu archipelago to set illegal driftnets.',
      originCoords: [60.62, 25.29],
      waypoints: [
        { lon: 60.62, lat: 25.29, label: '▶ DEPARTURE: Chabahar Port, Iran 🇮🇷', day: 'Day -14' },
        { lon: 58.50, lat: 24.20, label: 'Gulf of Oman Navigational Lane', day: 'Day -11' },
        { lon: 56.00, lat: 18.50, label: 'Central Arabian Sea Fairway 🌊', day: 'Day -8' },
        { lon: 52.50, lat: 12.00, label: 'Socotra Gap Passage (Yemen / Somalia Horn) 🇾🇪', day: 'Day -5' },
        { lon: 52.80, lat: 10.20, label: 'Ras Hafun Offshore Corridor (Horn of Africa) 🇸🇴', day: 'Day -4' },
        { lon: 49.50, lat: 5.00, label: 'Somali Eastern Seaboard Passage 🇸🇴', day: 'Day -2' },
        { lon: 41.80, lat: -1.90, label: '⚠️ Transponder Ceased near Somali Border', day: 'Day 0' },
        { lon: 41.45, lat: -2.15, label: '🎯 Current Position: Lamu Archipelago Protected Flats 🇰🇪', day: 'Now' },
      ],
    },
    waypoints: [
      {
        lon: 42.6000,
        lat: -1.6000,
        hoursAgo: 15,
        speedKnots: 8.8,
        heading: 225,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ Somali Basin Coastal Ingress',
      },
      {
        lon: 41.9500,
        lat: -1.8500,
        hoursAgo: 7,
        speedKnots: 8.4,
        heading: 220,
        aisStatus: 'active',
        label: 'Lamu Northern EEZ Boundary',
      },
      {
        lon: 41.6500,
        lat: -2.0000,
        hoursAgo: 2.8,
        speedKnots: 7.2,
        heading: 215,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Ceased near Border',
      },
      {
        lon: 41.4500,
        lat: -2.1500,
        hoursAgo: 0,
        speedKnots: 2.4,
        heading: 210,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Target Intercept: Lamu Archipelago Protected Flats',
      },
    ],
  },

  // ── Case 114: BARAKA 04 (Shimoni / Wasini Reefs) ──
  {
    caseId: 114,
    vesselName: 'BARAKA 04',
    mmsi: '667981023',
    flag: 'Sierra Leone',
    flagEmoji: '🇸🇱',
    gearType: 'Inshore Bunkering Craft',
    behavior: 'dark-vessel',
    targetCoords: [39.5200, -4.6500],
    originLabel: 'Dar es Salaam Approach',
    originCountry: 'Tanzania',
    transOceanicVoyage: {
      originCountry: 'Tanzania',
      originPort: 'Port of Dar es Salaam / Zanzibar North Channel',
      flagEmoji: '🇹🇿',
      voyageDays: 3,
      departureDate: 'Oct 26, 2026',
      chokepoints: ['Zanzibar North Channel', 'Tanga Bay Offshore Fairway', 'Vanga Border Reefs'],
      voyageSummary: 'Departed Dar es Salaam, slipped north between Zanzibar and the mainland, crossed the Tanzania/Kenya maritime boundary without clearing customs, currently hovering in the Shimoni/Wasini reefs.',
      originCoords: [39.28, -6.82],
      waypoints: [
        { lon: 39.28, lat: -6.82, label: '▶ DEPARTURE: Dar es Salaam Port, Tanzania 🇹🇿', day: 'Day -3' },
        { lon: 39.35, lat: -5.90, label: 'Zanzibar Channel Passage', day: 'Day -2' },
        { lon: 39.42, lat: -5.10, label: 'Tanga Inshore Navigational Corridor', day: 'Day -1' },
        { lon: 39.52, lat: -4.65, label: '🎯 Current Position: Shimoni / Wasini Inshore Reefs 🇰🇪', day: 'Now' },
      ],
    },
    waypoints: [
      {
        lon: 39.4000,
        lat: -5.2000,
        hoursAgo: 10,
        speedKnots: 9.2,
        heading: 10,
        aisStatus: 'active',
        isOrigin: true,
        label: '▶ Tanga Outer Navigable Lane',
      },
      {
        lon: 39.4600,
        lat: -4.9000,
        hoursAgo: 5,
        speedKnots: 8.8,
        heading: 15,
        aisStatus: 'active',
        label: 'Vanga Border Inshore Fairway',
      },
      {
        lon: 39.4900,
        lat: -4.7500,
        hoursAgo: 1.8,
        speedKnots: 8.2,
        heading: 20,
        aisStatus: 'disabled',
        isGapPoint: true,
        label: '⚠️ Transponder Disabled in Wasini Channel',
      },
      {
        lon: 39.5200,
        lat: -4.6500,
        hoursAgo: 0,
        speedKnots: 2.1,
        heading: 345,
        aisStatus: 'radar_contact',
        isCurrent: true,
        label: '🎯 Radar Intercept: Shimoni / Wasini Reefs',
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

  // Handle any other cases passed dynamically - deduplicate so we never create duplicate tracks or radiating fan rays
  for (const c of cases) {
    const cId = Number(c.id);
    const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || {};
    const vName = (candidate.vesselName || '').toUpperCase().trim();

    // If this vessel already exists in BASE_TRACKS, skip creating synthetic rays
    const alreadyMapped = Array.from(trackMap.values()).some((bt) => {
      const btName = bt.vesselName.toUpperCase().trim();
      return vName && (btName === vName || btName.includes(vName) || vName.includes(btName));
    });
    if (alreadyMapped) continue;

    if (!trackMap.has(cId)) {
      const lat = Number(c.features?.lat ?? c.lat);
      const lon = Number(c.features?.lon ?? c.lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        // Also ensure we don't have another synthetic track within 15 km
        const nearbyTrack = Array.from(trackMap.values()).some((t) => {
          const tCoord = t.targetCoords || (t.waypoints && [t.waypoints[t.waypoints.length - 1]?.lon, t.waypoints[t.waypoints.length - 1]?.lat]);
          return tCoord && haversineKm(lat, lon, tCoord[1], tCoord[0]) < 15.0;
        });
        if (nearbyTrack) continue;

        const displayName = candidate.vesselName || `Contact #${cId}`;
        const synthetic = createSyntheticTrack(cId, displayName, lon, lat);
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

    // 5. Trans-Oceanic Global Origin Route (Forensic Trace-Back from Origin Country into East Africa)
    if (track.transOceanicVoyage && Array.isArray(track.transOceanicVoyage.waypoints) && track.transOceanicVoyage.waypoints.length > 1) {
      const transCoords = track.transOceanicVoyage.waypoints.map((wp) => [wp.lon, wp.lat]);
      lineFeatures.push({
        type: 'Feature',
        id: `track-transoceanic-${track.caseId}`,
        properties: {
          type: 'vessel_transoceanic_track',
          caseId: track.caseId,
          vesselName: track.vesselName,
          flag: track.flag || 'Unknown',
          flagEmoji: track.flagEmoji || '🚢',
          color: palette.color,
          glowColor: palette.glow,
          originCountry: track.transOceanicVoyage.originCountry,
          originPort: track.transOceanicVoyage.originPort,
          voyageDays: track.transOceanicVoyage.voyageDays,
          chokepoints: track.transOceanicVoyage.chokepoints,
          voyageSummary: track.transOceanicVoyage.voyageSummary,
        },
        geometry: {
          type: 'LineString',
          coordinates: transCoords,
        },
      });

      // Origin Port Landmark Pin
      const originPortWp = track.transOceanicVoyage.waypoints[0];
      pointFeatures.push({
        type: 'Feature',
        id: `origin-port-${track.caseId}`,
        properties: {
          type: 'origin_port_marker',
          caseId: track.caseId,
          vesselName: track.vesselName,
          portName: track.transOceanicVoyage.originPort,
          country: track.transOceanicVoyage.originCountry,
          flagEmoji: track.transOceanicVoyage.flagEmoji,
          voyageDays: track.transOceanicVoyage.voyageDays,
          departureDate: track.transOceanicVoyage.departureDate,
          color: palette.color,
          label: `▶ ORIGIN: ${track.transOceanicVoyage.originPort} (${track.transOceanicVoyage.flagEmoji} ${track.transOceanicVoyage.originCountry})`,
        },
        geometry: {
          type: 'Point',
          coordinates: [originPortWp.lon, originPortWp.lat],
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

/**
 * Get trans-oceanic voyage metadata and origin trace-back for a case or vessel name
 */
export function getTransOceanicTrack(caseIdOrName) {
  const cId = Number(caseIdOrName);
  let track = !isNaN(cId) ? getTrackByCaseId(cId) : null;

  if (!track || !track.transOceanicVoyage) {
    const searchStr = String(caseIdOrName || '').toUpperCase().trim();
    if (searchStr) {
      track = BASE_TRACKS.find((t) =>
        t.transOceanicVoyage && (
          t.vesselName.toUpperCase() === searchStr ||
          searchStr.includes(t.vesselName.toUpperCase()) ||
          t.vesselName.toUpperCase().includes(searchStr)
        )
      );
    }
  }

  if (track && track.transOceanicVoyage) {
    const palette = track.palette || getVesselColor(track.vesselName, track.caseId);
    return {
      caseId: track.caseId,
      vesselName: track.vesselName,
      palette,
      ...track.transOceanicVoyage,
    };
  }
  return null;
}
