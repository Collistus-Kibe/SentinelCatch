import config from '../config.js';
import logger from '../logger.js';

export class MyShipTrackingService {
  constructor() {
    this.apiKey = config.MYSHIPTRACKING_API_KEY || '';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.length > 3);
  }

  /**
   * Fetch live vessel metadata and photo from MyShipTracking API
   * @param {string} mmsi
   * @param {string} imo
   * @returns {Promise<Object|null>}
   */
  async fetchVessel(mmsi, imo = null) {
    if (!mmsi && !imo) return null;

    // If API key is configured, query official REST API
    if (this.isConfigured()) {
      try {
        const queryParam = mmsi ? `mmsi=${encodeURIComponent(mmsi)}` : `imo=${encodeURIComponent(imo)}`;
        const url = `https://api.myshiptracking.com/api/v1/vessel?${queryParam}`;
        logger.info({ mmsi, imo }, 'Querying MyShipTracking API');

        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'SentinelCatch-Surveillance/3.0',
          },
        });

        if (res.ok) {
          const json = await res.json();
          const vessel = json.data || json.vessel || json;
          if (vessel && !vessel.error) {
            const photoUrl = vessel.photo_url || vessel.image || vessel.photo || null;
            return {
              vesselName: vessel.name || vessel.vessel_name || `MMSI ${mmsi}`,
              mmsi: vessel.mmsi || mmsi,
              imo: vessel.imo || imo,
              flag: vessel.flag || 'Unknown',
              flagEmoji: '🚢',
              gearType: vessel.type || vessel.vessel_type || 'Commercial Vessel',
              lengthM: Number(vessel.length) || null,
              photoUrl: photoUrl || (imo ? `https://static.vesselfinder.net/ship-photo/${imo}` : null),
              profileUrl: `https://www.myshiptracking.com/vessels?name=${encodeURIComponent(vessel.name || mmsi)}`,
              source: 'myshiptracking_api',
              credit: `MyShipTracking AIS Fleet Database (${vessel.owner || 'Verified Ship'})`,
              isRealPhoto: Boolean(photoUrl),
              cached: false,
            };
          }
        }
      } catch (err) {
        logger.debug({ err: err.message, mmsi, imo }, 'MyShipTracking API fetch error');
      }
    }

    // Free Open Fallback: Generate MyShipTracking direct directory reference
    if (mmsi || imo) {
      return {
        vesselName: `Vessel MMSI ${mmsi}`,
        mmsi,
        imo,
        flag: 'Unknown',
        flagEmoji: '🚢',
        gearType: 'Commercial Craft',
        lengthM: null,
        photoUrl: null, // Will fall back to local/Wikimedia
        profileUrl: `https://www.myshiptracking.com/vessels?name=${encodeURIComponent(mmsi || imo)}`,
        source: 'myshiptracking_directory',
        credit: 'MyShipTracking Open Directory',
        isRealPhoto: false,
        cached: false,
      };
    }

    return null;
  }
}

export const myShipTrackingService = new MyShipTrackingService();
export default myShipTrackingService;
