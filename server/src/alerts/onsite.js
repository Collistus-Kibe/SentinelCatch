import { AlertChannelAdapter } from './adapter.js';
import { query } from '../db/index.js';
import broker from './broker.js';
import logger from '../logger.js';

// In-memory notifications fallback
export const inMemoryNotifications = [];

export class OnsiteAlertAdapter extends AlertChannelAdapter {
  constructor() {
    super('onsite');
  }

  /**
   * Store notification in PostgreSQL (or in-memory) and broadcast to connected SSE clients.
   * @param {Object} payload
   */
  async send(payload) {
    const start = Date.now();
    const caseCreationTime = payload.caseCreatedAt ? new Date(payload.caseCreatedAt).getTime() : start;
    const broadcastLatencyMs = Math.max(0, start - caseCreationTime);

    let row = {
      id: inMemoryNotifications.length + 1,
      case_id: payload.caseId || null,
      type: payload.type || 'case_new',
      band: payload.band || 'High',
      headline: payload.headline,
      body: payload.body,
      lat: payload.lat !== undefined ? payload.lat : null,
      lon: payload.lon !== undefined ? payload.lon : null,
      sector: payload.sector || null,
      score: payload.score !== undefined ? payload.score : null,
      created_at: new Date().toISOString(),
      broadcast_latency_ms: broadcastLatencyMs,
    };

    try {
      const sql = `
        INSERT INTO notifications (
          case_id, type, band, headline, body, lat, lon, sector, score, created_at, broadcast_latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
        RETURNING *
      `;

      const params = [
        row.case_id,
        row.type,
        row.band,
        row.headline,
        row.body,
        row.lat,
        row.lon,
        row.sector,
        row.score,
        broadcastLatencyMs,
      ];

      const result = await query(sql, params);
      row = result.rows[0];
    } catch (err) {
      logger.debug({ err: err.message }, 'PostgreSQL offline; using in-memory notification record');
    }

    inMemoryNotifications.unshift(row);

    // Publish immediately to connected SSE clients
    broker.publish('notification', row);

    logger.info(
      { id: row.id, type: row.type, band: row.band, latencyMs: broadcastLatencyMs },
      'On-site notification broadcast successfully'
    );

    return {
      success: true,
      id: row.id,
      broadcastLatencyMs,
      notification: row,
    };
  }
}

export const onsiteAdapter = new OnsiteAlertAdapter();
export default onsiteAdapter;
