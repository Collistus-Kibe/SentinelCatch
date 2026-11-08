import config from '../config.js';
import logger from '../logger.js';
import { KENYA_EEZ_BBOX } from '../geo/kenya_eez.js';

const GFW_GATEWAY = 'https://gateway.api.globalfishingwatch.org/v3';

/**
 * Sanitize query date range: GFW API enforces strict maximum time ranges (max 366 days,
 * recommended 14-30 days for 4wings reports and event searches).
 */
function sanitizeGfwDateRange(startDate, endDate, defaultDays = 7) {
  const now = new Date();
  let endD = endDate ? new Date(endDate) : now;
  if (isNaN(endD.getTime()) || endD > now) endD = now;

  let startD = startDate ? new Date(startDate) : new Date(endD.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  if (isNaN(startD.getTime())) startD = new Date(endD.getTime() - defaultDays * 24 * 60 * 60 * 1000);

  if (endD < startD) {
    const tmp = endD;
    endD = startD;
    startD = tmp;
  }

  // Restrict time window to max 30 days to strictly avoid GFW 422 errors
  const maxDiffMs = 30 * 24 * 60 * 60 * 1000;
  if (endD.getTime() - startD.getTime() > maxDiffMs) {
    startD = new Date(endD.getTime() - maxDiffMs);
  }

  return {
    start: startD.toISOString().split('T')[0],
    end: endD.toISOString().split('T')[0],
  };
}

export class GFWClient {
  constructor(token = config.GFW_API_TOKEN) {
    this.token = token;
  }

  isConfigured() {
    return Boolean(this.token && this.token.length > 5);
  }

  /**
   * Internal authenticated fetch to GFW API Gateway with error handling
   */
  async request(path, options = {}) {
    if (!this.isConfigured()) {
      logger.debug('GFW API token not configured; returning empty dataset');
      return null;
    }

    const url = `${GFW_GATEWAY}${path}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401 || response.status === 403) {
        logger.warn('GFW API token unauthorized or forbidden');
        return null;
      }

      if (response.status === 422) {
        const errorText = await response.text();
        logger.debug({ status: response.status, errorText }, 'GFW API query range out of bounds, falling back to local simulation');
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, errorText }, 'GFW API request failed');
        return null;
      }

      return await response.json();
    } catch (err) {
      logger.error({ err, path }, 'Network error querying Global Fishing Watch API');
      return null;
    }
  }

  /**
   * Query Sentinel-1 SAR presence/detections in Kenya EEZ
   * Dataset: public-global-sar-presence:latest
   * @param {Object} params - { startDate, endDate, bbox }
   */
  async fetchSARDetections({ startDate, endDate, bbox = KENYA_EEZ_BBOX } = {}) {
    const { start, end } = sanitizeGfwDateRange(startDate, endDate, 7);

    const queryParams = new URLSearchParams({
      'start-date': start,
      'end-date': end,
      'temporal-aggregation': 'false',
      'spatial-aggregation': 'false',
      'datasets[0]': 'public-global-sar-presence:latest',
      'geometry': JSON.stringify({
        type: 'Polygon',
        coordinates: [[
          [bbox.minLon, bbox.minLat],
          [bbox.maxLon, bbox.minLat],
          [bbox.maxLon, bbox.maxLat],
          [bbox.minLon, bbox.maxLat],
          [bbox.minLon, bbox.minLat],
        ]],
      }),
    });

    const data = await this.request(`/4wings/report?${queryParams.toString()}`);
    if (!data || !Array.isArray(data.entries)) {
      return [];
    }

    return data.entries.map((entry) => ({
      lat: entry.lat ?? entry.latitude,
      lon: entry.lon ?? entry.longitude,
      detected_at: entry.date || entry.timestamp || new Date().toISOString(),
      uncertainty_km: entry.uncertainty_km || 1.5,
      length_m: entry.length_m || entry.vessel_length || null,
      raw: entry,
    }));
  }

  /**
   * Query AIS vessel presence in Kenya EEZ
   * Dataset: public-global-presence:latest
   */
  async fetchAISPresence({ startDate, endDate, bbox = KENYA_EEZ_BBOX } = {}) {
    const { start, end } = sanitizeGfwDateRange(startDate, endDate, 7);

    const queryParams = new URLSearchParams({
      'start-date': start,
      'end-date': end,
      'datasets[0]': 'public-global-presence:latest',
      'geometry': JSON.stringify({
        type: 'Polygon',
        coordinates: [[
          [bbox.minLon, bbox.minLat],
          [bbox.maxLon, bbox.minLat],
          [bbox.maxLon, bbox.maxLat],
          [bbox.minLon, bbox.maxLat],
          [bbox.minLon, bbox.minLat],
        ]],
      }),
    });

    const data = await this.request(`/4wings/report?${queryParams.toString()}`);
    if (!data || !Array.isArray(data.entries)) {
      return [];
    }

    return data.entries.map((entry) => ({
      mmsi: entry.mmsi || entry.vessel_id || 'unknown',
      lat: entry.lat ?? entry.latitude,
      lon: entry.lon ?? entry.longitude,
      timestamp: entry.date || entry.timestamp || new Date().toISOString(),
      raw: entry,
    }));
  }

  /**
   * Query GFW Events (gaps, loitering, encounters)
   * @param {string} dataset - e.g. 'public-global-gaps-events:latest', 'public-global-loitering-events:latest'
   */
  async fetchEvents(dataset, { startDate, endDate } = {}) {
    const { start, end } = sanitizeGfwDateRange(startDate, endDate, 14);

    const queryParams = new URLSearchParams({
      'start-date': start,
      'end-date': end,
      'datasets[0]': dataset,
      'limit': '100',
      'offset': '0',
    });

    const data = await this.request(`/events?${queryParams.toString()}`);
    return data?.entries || data?.events || [];
  }
}

export const gfwClient = new GFWClient();
export default gfwClient;
