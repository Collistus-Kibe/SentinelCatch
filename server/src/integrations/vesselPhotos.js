import config from '../config.js';
import logger from '../logger.js';

// In-memory 24-hour cache for external API photo queries
const photoCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Curated surveillance imagery library for Western Indian Ocean / Kenya EEZ dark contacts
const CURATED_VESSEL_ARCHIVE = [
  {
    vesselName: 'LU RONG YUAN YU 188',
    mmsi: '412349012',
    flag: 'China',
    flagEmoji: '🇨🇳',
    gearType: 'Tuna Longliner',
    lengthM: 44.5,
    photoUrl: '/vessels/lu_rong_yuan_yu.jpg',
    source: 'curated_surveillance_archive',
    credit: 'Naval Reconnaissance Patrol (C-Band Corroborated)',
    iuuListed: true,
  },
  {
    vesselName: 'PACIFIC DAWN 02',
    mmsi: '667001421',
    flag: 'Sierra Leone',
    flagEmoji: '🇸🇱',
    gearType: 'Reefer / Cargo Carrier',
    lengthM: 52.0,
    photoUrl: '/vessels/pacific_dawn.jpg',
    source: 'curated_surveillance_archive',
    credit: 'Aerial Reconnaissance Flyover',
    iuuListed: false,
  },
  {
    vesselName: 'HAI FENG 68',
    mmsi: '352001928',
    flag: 'Panama',
    flagEmoji: '🇵🇦',
    gearType: 'Industrial Trawler',
    lengthM: 38.0,
    photoUrl: '/vessels/hai_feng.jpg',
    source: 'curated_surveillance_archive',
    credit: 'Coast Guard Surveillance Photo',
    iuuListed: false,
  },
  {
    vesselName: 'ZHOU YU 926',
    mmsi: '413398102',
    flag: 'China',
    flagEmoji: '🇨🇳',
    gearType: 'Squid Jigger / Longliner',
    lengthM: 48.0,
    photoUrl: '/vessels/zhou_yu.jpg',
    source: 'curated_surveillance_archive',
    credit: 'Night Patrol Reconnaissance Photo',
    iuuListed: true,
  },
  {
    vesselName: 'AL-MARWAH',
    mmsi: '518100823',
    flag: 'Cook Islands',
    flagEmoji: '🇨🇰',
    gearType: 'Tuna Longliner',
    lengthM: 41.2,
    photoUrl: '/vessels/lu_rong_yuan_yu.jpg',
    source: 'curated_surveillance_archive',
    credit: 'Maritime Surveillance Photo',
    iuuListed: false,
  },
];

export class VesselPhotoService {
  constructor() {
    this.vesselFinderKey = config.VESSELFINDER_API_KEY || (config.VESSEL_PHOTO_PROVIDER === 'vesselfinder' ? config.VESSEL_PHOTO_API_KEY : '');
    this.apiKey = this.vesselFinderKey || config.VESSEL_PHOTO_API_KEY || '';
    this.provider = config.VESSEL_PHOTO_PROVIDER || 'auto';
  }

  isApiKeyConfigured() {
    return Boolean(this.apiKey && this.apiKey.length > 3);
  }

  isVesselFinderConfigured() {
    return Boolean(this.vesselFinderKey && this.vesselFinderKey.length > 3);
  }

  /**
   * Resolve best photo for a vessel by Name, MMSI, IMO, or Gear Type.
   * Priority:
   * 1. Curated high-res local surveillance archive
   * 2. VesselFinder API (if userkey is configured)
   * 3. Wikimedia Commons Open Maritime Database (no key required)
   * 4. Default tactical dark vessel profile
   *
   * @param {Object} query - { name, mmsi, imo, gearType }
   * @returns {Promise<Object>} Photo record { photoUrl, source, credit, vesselName, flag, gearType }
   */
  async getVesselPhoto(query = {}) {
    const name = (query.name || '').trim();
    const mmsi = (query.mmsi || '').toString().trim();
    const imo = (query.imo || '').toString().trim();
    const gearType = (query.gearType || '').trim();

    const cacheKey = `${name.toLowerCase()}_${mmsi}_${imo}`;
    const cached = photoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Check curated high-resolution surveillance archive
    const localMatch = this.findInCuratedArchive(name, mmsi, gearType);
    if (localMatch && (this.provider === 'local' || this.provider === 'auto')) {
      photoCache.set(cacheKey, { timestamp: Date.now(), data: localMatch });
      return localMatch;
    }

    // 2. Check VesselFinder API (if userkey provided)
    if (this.isVesselFinderConfigured() && (this.provider === 'vesselfinder' || this.provider === 'auto')) {
      const vfPhoto = await this.fetchFromVesselFinder(mmsi, name, imo);
      if (vfPhoto) {
        photoCache.set(cacheKey, { timestamp: Date.now(), data: vfPhoto });
        return vfPhoto;
      }
    }

    // 3. Check Wikimedia Commons Open Maritime Database (if auto or wikimedia)
    if (this.provider === 'wikimedia' || this.provider === 'auto') {
      const wikiPhoto = await this.fetchFromWikimedia(name, gearType);
      if (wikiPhoto) {
        photoCache.set(cacheKey, { timestamp: Date.now(), data: wikiPhoto });
        return wikiPhoto;
      }
    }

    // 4. Default fallback to tactical dark vessel profile
    const fallbackRecord = {
      vesselName: name || 'Unidentified Dark Contact',
      mmsi: mmsi || null,
      imo: imo || null,
      flag: 'Unknown',
      flagEmoji: '🏳️',
      gearType: gearType || 'Industrial Vessel',
      photoUrl: '/vessels/default_dark_vessel.jpg',
      source: 'default_tactical_profile',
      credit: 'Satellite Radar Centroid Observation',
      cached: false,
    };

    photoCache.set(cacheKey, { timestamp: Date.now(), data: fallbackRecord });
    return fallbackRecord;
  }

  /**
   * Search curated surveillance archive
   */
  findInCuratedArchive(name, mmsi, gearType) {
    if (mmsi) {
      const matchByMmsi = CURATED_VESSEL_ARCHIVE.find((v) => v.mmsi === mmsi);
      if (matchByMmsi) return { ...matchByMmsi, cached: true };
    }

    if (name) {
      const cleanName = name.toLowerCase();
      const matchByName = CURATED_VESSEL_ARCHIVE.find((v) =>
        cleanName.includes(v.vesselName.toLowerCase()) || v.vesselName.toLowerCase().includes(cleanName)
      );
      if (matchByName) return { ...matchByName, cached: true };
    }

    if (gearType) {
      const cleanGear = gearType.toLowerCase();
      const matchByGear = CURATED_VESSEL_ARCHIVE.find((v) =>
        v.gearType.toLowerCase().includes(cleanGear)
      );
      if (matchByGear) return { ...matchByGear, cached: true };
    }

  /**
   * Query VesselFinder API using userkey
   * Endpoint: api.vesselfinder.com/masterdata or api.vesselfinder.com/vessels
   */
  async fetchFromVesselFinder(mmsi, vesselName, imo = null) {
    if (!this.vesselFinderKey) return null;

    try {
      logger.info({ mmsi, imo, vesselName }, 'Querying VesselFinder API');

      // Query VesselFinder masterdata endpoint with imo or mmsi
      const identifierParam = imo ? `imo=${encodeURIComponent(imo)}` : mmsi ? `mmsi=${encodeURIComponent(mmsi)}` : '';
      if (!identifierParam) return null;

      const url = `https://api.vesselfinder.com/masterdata?userkey=${encodeURIComponent(this.vesselFinderKey)}&${identifierParam}&format=json`;
      const res = await fetch(url, { headers: { 'User-Agent': 'SentinelCatch-Surveillance/3.0' } });

      if (!res.ok) {
        logger.debug({ status: res.status, mmsi, imo }, 'VesselFinder API response non-200');
        return null;
      }

      const json = await res.json();
      const vesselData = Array.isArray(json) ? json[0] : json;

      if (!vesselData) return null;

      const master = vesselData.MASTERDATA || vesselData;
      const ais = vesselData.AIS || {};

      // Check for direct image or photo attributes in the response payload
      const photoUrl = master.IMAGE || master.PHOTO || master.PHOTO_URL || ais.IMAGE || vesselData.image || vesselData.photo;

      if (photoUrl) {
        return {
          vesselName: master.NAME || ais.NAME || vesselName,
          mmsi: ais.MMSI || mmsi,
          imo: master.IMO || imo,
          flag: master.FLAG || 'Unknown',
          flagEmoji: '🚢',
          gearType: master.TYPE || 'Commercial Vessel',
          lengthM: Number(master.LENGTH) || null,
          photoUrl,
          source: 'vesselfinder_api',
          credit: `VesselFinder MasterData (${master.BUILDER || master.OWNER || 'Verified Vessel'})`,
          cached: false,
        };
      }

      // If MasterData confirms the vessel exists with IMO, provide VesselFinder static preview CDN
      const resolvedImo = master.IMO || imo;
      if (resolvedImo) {
        return {
          vesselName: master.NAME || vesselName,
          mmsi: ais.MMSI || mmsi,
          imo: resolvedImo,
          flag: master.FLAG || 'Unknown',
          flagEmoji: '🚢',
          gearType: master.TYPE || 'Commercial Vessel',
          lengthM: Number(master.LENGTH) || null,
          photoUrl: `https://static.vesselfinder.net/ship-photo/${resolvedImo}`,
          profileUrl: `https://www.vesselfinder.com/vessels/details/${resolvedImo}`,
          source: 'vesselfinder_api',
          credit: `VesselFinder Maritime Registry (${master.OWNER || 'IMO ' + resolvedImo})`,
          cached: false,
        };
      }
    } catch (err) {
      logger.warn({ err: err.message, mmsi, imo }, 'VesselFinder API query error');
    }

    return null;
  }

  /**
   * Query Wikimedia Commons Open Maritime Database (Free, Open-Access)
   */
  async fetchFromWikimedia(vesselName, gearType) {
    const searchTerm = vesselName ? `${vesselName} ship` : `${gearType || 'fishing'} trawler ship`;

    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchTerm)}&gsrlimit=1&prop=imageinfo&iiprop=url|mime&format=json&origin=*`;
      const res = await fetch(url, { headers: { 'User-Agent': 'SentinelCatch-App/3.0 (info@sentinelcatch.org)' } });

      if (!res.ok) return null;

      const data = await res.json();
      const pages = data.query?.pages;
      if (!pages) return null;

      const firstPage = Object.values(pages)[0];
      const imageInfo = firstPage?.imageinfo?.[0];

      if (imageInfo?.url) {
        return {
          vesselName: vesselName || firstPage.title,
          mmsi: null,
          flag: 'Open Ocean',
          flagEmoji: '🌊',
          gearType: gearType || 'Vessel',
          photoUrl: imageInfo.url,
          source: 'wikimedia_commons',
          credit: 'Wikimedia Commons Open Maritime Fleet',
          cached: false,
        };
      }
    } catch (err) {
      logger.debug({ err: err.message, searchTerm }, 'Wikimedia photo fetch note');
    }

    return null;
  }

  /**
   * Return entire gallery of curated vessels
   */
  getCuratedGallery() {
    return CURATED_VESSEL_ARCHIVE;
  }
}

export const vesselPhotoService = new VesselPhotoService();
export default vesselPhotoService;
