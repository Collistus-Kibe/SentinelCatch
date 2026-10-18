import logger from '../logger.js';

const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

// 30-minute in-memory cache keyed by 0.25° coordinate bin
const weatherCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

export class OpenMeteoClient {
  /**
   * Get marine sea state at coordinates
   * @param {number} lat
   * @param {number} lon
   * @returns {Promise<{ waveHeightM: number, windWaveHeightM: number, wavePeriodS: number, seaState: string, penalty: number }>}
   */
  async getMarineConditions(lat, lon) {
    const latBin = Math.round(lat * 4) / 4;
    const lonBin = Math.round(lon * 4) / 4;
    const cacheKey = `${latBin},${lonBin}`;

    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = `${OPEN_METEO_MARINE_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=wave_height,wind_wave_height,wave_period&timezone=UTC`;
      const res = await fetch(url, { headers: { 'User-Agent': 'SentinelCatch/3.0' } });

      if (!res.ok) {
        logger.warn({ status: res.status, lat, lon }, 'Open-Meteo marine API returned non-200');
        return this.getDefaultSeaState();
      }

      const json = await res.json();
      const waveHeights = json.hourly?.wave_height || [];
      const windWaveHeights = json.hourly?.wind_wave_height || [];
      const wavePeriods = json.hourly?.wave_period || [];

      // Current hour index
      const now = new Date();
      const currentHour = now.getUTCHours();
      const waveHeightM = Number(waveHeights[currentHour] ?? waveHeights[0] ?? 1.2);
      const windWaveHeightM = Number(windWaveHeights[currentHour] ?? windWaveHeights[0] ?? 0.8);
      const wavePeriodS = Number(wavePeriods[currentHour] ?? wavePeriods[0] ?? 6.0);

      const seaState = this.classifySeaState(waveHeightM);
      const penalty = this.computeRadarPenalty(waveHeightM);

      const data = {
        waveHeightM: Math.round(waveHeightM * 10) / 10,
        windWaveHeightM: Math.round(windWaveHeightM * 10) / 10,
        wavePeriodS: Math.round(wavePeriodS * 10) / 10,
        seaState,
        penalty, // 0 to 15 points deducted from radar confidence
      };

      weatherCache.set(cacheKey, { timestamp: Date.now(), data });
      return data;
    } catch (err) {
      logger.warn({ err: err.message, lat, lon }, 'Failed to fetch Open-Meteo marine conditions');
      return this.getDefaultSeaState();
    }
  }

  classifySeaState(waveHeight) {
    if (waveHeight < 0.5) return 'Calm (Glassy/Rippled)';
    if (waveHeight < 1.25) return 'Smooth to Slight';
    if (waveHeight < 2.5) return 'Moderate';
    if (waveHeight < 4.0) return 'Rough (Radar Clutter)';
    return 'Very Rough / High';
  }

  /**
   * High wave heights create sea clutter on radar backscatter.
   * If wave height > 2.5m, decrease detection confidence by up to 15 points.
   */
  computeRadarPenalty(waveHeight) {
    if (waveHeight <= 1.5) return 0;
    if (waveHeight <= 2.5) return 5;
    if (waveHeight <= 3.5) return 10;
    return 15;
  }

  getDefaultSeaState() {
    return {
      waveHeightM: 1.2,
      windWaveHeightM: 0.8,
      wavePeriodS: 6.0,
      seaState: 'Moderate',
      penalty: 0,
    };
  }
}

export const openMeteoClient = new OpenMeteoClient();
export default openMeteoClient;
