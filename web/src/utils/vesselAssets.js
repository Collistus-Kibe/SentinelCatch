/**
 * SentinelCatch Vessel Assets & Intelligence Utilities
 * Maps vessel names, gear types, and flags to realistic surveillance imagery and metadata.
 */

export const KNOWN_VESSELS = {
  'LU RONG YUAN YU 188': {
    name: 'LU RONG YUAN YU 188',
    image: '/vessels/lu_rong_yuan_yu.jpg',
    flag: 'China',
    flagEmoji: '🇨🇳',
    type: 'Tuna Longliner',
    lengthM: 44.5,
    mmsi: '412349012',
    iuuListed: true,
  },
  'PACIFIC DAWN 02': {
    name: 'PACIFIC DAWN 02',
    image: '/vessels/pacific_dawn.jpg',
    flag: 'Sierra Leone',
    flagEmoji: '🇸🇱',
    type: 'Reefer / Cargo Carrier',
    lengthM: 52.0,
    mmsi: '667001421',
    iuuListed: false,
  },
  'HAI FENG 68': {
    name: 'HAI FENG 68',
    image: '/vessels/hai_feng.jpg',
    flag: 'Panama',
    flagEmoji: '🇵🇦',
    type: 'Industrial Trawler',
    lengthM: 38.0,
    mmsi: '352001928',
    iuuListed: false,
  },
  'ZHOU YU 926': {
    name: 'ZHOU YU 926',
    image: '/vessels/zhou_yu.jpg',
    flag: 'China',
    flagEmoji: '🇨🇳',
    type: 'Squid Jigger / Longliner',
    lengthM: 48.0,
    mmsi: '413398102',
    iuuListed: true,
  },
  'AL-MARWAH': {
    name: 'AL-MARWAH',
    image: '/vessels/lu_rong_yuan_yu.jpg',
    flag: 'Cook Islands',
    flagEmoji: '🇨🇰',
    type: 'Tuna Longliner',
    lengthM: 41.2,
    mmsi: '518100823',
    iuuListed: false,
  },
};

/**
 * Get surveillance photo for a suspected vessel
 * Matches known vessels to bundled high-res images, or queries the /api/vessels/photo endpoint
 */
export function getVesselPhoto(vesselName = '', gearType = '', mmsi = '', imo = '') {
  const norm = (vesselName + ' ' + gearType).toLowerCase();
  if (norm.includes('lu rong') || norm.includes('yuan yu')) {
    return '/vessels/lu_rong_yuan_yu.jpg';
  }
  if (norm.includes('pacific') || norm.includes('dawn') || norm.includes('reefer') || norm.includes('cargo')) {
    return '/vessels/pacific_dawn.jpg';
  }
  if (norm.includes('hai feng') || norm.includes('trawler')) {
    return '/vessels/hai_feng.jpg';
  }
  if (norm.includes('zhou yu') || norm.includes('squid') || norm.includes('jigger')) {
    return '/vessels/zhou_yu.jpg';
  }

  // If a name, MMSI, or IMO was provided that is not pre-bundled, query our backend photo endpoint
  if (vesselName || mmsi || imo) {
    const params = new URLSearchParams();
    if (vesselName) params.set('name', vesselName);
    if (mmsi) params.set('mmsi', mmsi);
    if (imo) params.set('imo', imo);
    if (gearType) params.set('gearType', gearType);
    return `/api/vessels/photo?${params.toString()}`;
  }

  return '/vessels/default_dark_vessel.jpg';
}

/**
 * Get direct API endpoint URL for a vessel photo
 */
export function getVesselPhotoApiUrl(vesselName = '', mmsi = '', gearType = '', imo = '') {
  const params = new URLSearchParams();
  if (vesselName) params.set('name', vesselName);
  if (mmsi) params.set('mmsi', mmsi);
  if (imo) params.set('imo', imo);
  if (gearType) params.set('gearType', gearType);
  return `/api/vessels/photo?${params.toString()}`;
}

/**
 * Get direct API endpoint URL for a case vessel photo
 */
export function getCasePhotoApiUrl(caseId) {
  return `/api/cases/${caseId}/photo`;
}

/**
 * Get country flag emoji
 */
export function getFlagEmoji(country = '') {
  const c = String(country).toLowerCase();
  if (c.includes('china')) return '🇨🇳';
  if (c.includes('panama')) return '🇵🇦';
  if (c.includes('sierra leone')) return '🇸🇱';
  if (c.includes('cook')) return '🇨🇰';
  if (c.includes('kenya')) return '🇰🇪';
  if (c.includes('tanzania')) return '🇹🇿';
  if (c.includes('somalia')) return '🇸🇴';
  return '🏳️';
}

