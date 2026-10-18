import config from '../config.js';
import logger from '../logger.js';

const COPERNICUS_AUTH_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const SH_PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';

export class CopernicusClient {
  constructor() {
    this.clientId = config.COPERNICUS_CLIENT_ID;
    this.clientSecret = config.COPERNICUS_CLIENT_SECRET;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.clientId.length > 5);
  }

  async getAccessToken() {
    if (!this.isConfigured()) return null;

    if (this.token && Date.now() < this.tokenExpiresAt - 60000) {
      return this.token;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const res = await fetch(COPERNICUS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) {
        logger.warn('Failed to obtain Copernicus OAuth access token');
        return null;
      }

      const json = await res.json();
      this.token = json.access_token;
      this.tokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
      return this.token;
    } catch (err) {
      logger.warn({ err: err.message }, 'Copernicus authentication error');
      return null;
    }
  }

  /**
   * Request Sentinel-1 SAR backscatter chip centered around coordinates.
   * Returns base64 PNG data URL or null if unavailable.
   */
  async getRadarChip(lat, lon, bboxDelta = 0.05) {
    const token = await this.getAccessToken();
    if (!token) return null;

    const bbox = [lon - bboxDelta, lat - bboxDelta, lon + bboxDelta, lat + bboxDelta];

    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: ["VV"],
          output: { bands: 1, sampleType: "AUTO" }
        };
      }
      function evaluatePixel(samples) {
        return [Math.sqrt(Math.max(0, samples.VV)) * 2.5];
      }
    `;

    try {
      const res = await fetch(SH_PROCESS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'image/png',
        },
        body: JSON.stringify({
          input: {
            bounds: {
              bbox,
              properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
            },
            data: [{ type: 'sentinel-1-grd' }],
          },
          output: {
            width: 256,
            height: 256,
            responses: [{ identifier: 'default', format: { type: 'image/png' } }],
          },
          evalscript,
        }),
      });

      if (!res.ok) return null;

      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to fetch Copernicus SAR chip');
      return null;
    }
  }
}

export const copernicusClient = new CopernicusClient();
export default copernicusClient;
