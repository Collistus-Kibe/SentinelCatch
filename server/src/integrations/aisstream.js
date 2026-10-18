import WebSocket from 'ws';
import config from '../config.js';
import logger from '../logger.js';
import broker from '../alerts/broker.js';
import { query } from '../db/index.js';
import { KENYA_EEZ_BBOX } from '../geo/kenya_eez.js';

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';

export class AISStreamClient {
  constructor() {
    this.apiKey = config.AISSTREAM_API_KEY;
    this.ws = null;
    this.reconnectTimeout = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 60000;
    this.isConnected = false;
    this.pruneInterval = null;
    // In-memory cache of latest ship positions by MMSI (72h TTL)
    this.livePositions = new Map();
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  start() {
    if (!this.isConfigured()) {
      logger.info('AISStream.io API key not set; live ship tracking disabled');
      return;
    }

    this.connect();

    // Background 1-hour pruning for positions older than 72 hours
    this.pruneInterval = setInterval(() => {
      this.pruneExpiredPositions();
    }, 60 * 60 * 1000);
  }

  connect() {
    if (!this.isConfigured()) return;

    try {
      logger.info('Connecting to AISStream.io live WebSocket for Kenya EEZ...');
      this.ws = new WebSocket(AISSTREAM_URL);

      this.ws.on('open', () => {
        logger.info('Connected to AISStream.io');
        this.isConnected = true;
        this.reconnectDelay = 1000; // Reset backoff

        // Subscribe to Kenya EEZ bounding box
        const subMsg = {
          Apikey: this.apiKey,
          BoundingBoxes: [
            [
              [KENYA_EEZ_BBOX.minLat, KENYA_EEZ_BBOX.minLon],
              [KENYA_EEZ_BBOX.maxLat, KENYA_EEZ_BBOX.maxLon],
            ],
          ],
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        };
        this.ws.send(JSON.stringify(subMsg));
      });

      this.ws.on('message', async (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          await this.handleMessage(parsed);
        } catch (err) {
          logger.warn({ err }, 'Failed to parse AISStream message');
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        logger.warn({ code, reason: reason?.toString() }, 'AISStream WebSocket closed; scheduling reconnect');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        logger.error({ err: err.message }, 'AISStream WebSocket error');
        this.ws?.close();
      });
    } catch (err) {
      logger.error({ err }, 'Failed to initialize AISStream connection');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  async handleMessage(msg) {
    const msgType = msg.MessageType;
    const meta = msg.MetaData;

    if (!meta) return;

    const mmsi = String(meta.MMSI);
    const shipName = meta.ShipName?.trim() || null;
    const lat = meta.latitude;
    const lon = meta.longitude;
    const timeUtc = meta.time_utc || new Date().toISOString();

    if (lat === undefined || lon === undefined) return;

    let course = null;
    let speed = null;
    let shipType = null;

    if (msgType === 'PositionReport' && msg.Message?.PositionReport) {
      const pos = msg.Message.PositionReport;
      course = pos.Cog;
      speed = pos.Sog;
    } else if (msgType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
      const staticData = msg.Message.ShipStaticData;
      shipType = staticData.Type;
    }

    const posRecord = {
      mmsi,
      lat,
      lon,
      course,
      speed,
      ship_name: shipName,
      ship_type: shipType,
      raw: msg,
      received_at: timeUtc,
    };

    // Update in-memory live cache
    this.livePositions.set(mmsi, posRecord);

    // Broadcast live ship tick across SSE broker
    broker.publish('ais_tick', {
      mmsi,
      lat,
      lon,
      course,
      speed,
      ship_name: shipName,
      timestamp: timeUtc,
    });

    // Save to PostgreSQL if connected
    try {
      await query(
        `INSERT INTO ais_positions (mmsi, lat, lon, course, speed, ship_name, ship_type, raw, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [mmsi, lat, lon, course, speed, shipName, shipType, JSON.stringify(msg), timeUtc]
      );
    } catch {
      // In local dev without postgres, in-memory cache handles live positions
    }
  }

  /**
   * Get all live ships within Kenya EEZ received in last 24 hours
   */
  async getLiveShips() {
    // Return from in-memory cache first
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const memoryShips = Array.from(this.livePositions.values()).filter(
      (p) => now - new Date(p.received_at).getTime() < oneDayMs
    );

    if (memoryShips.length > 0) {
      return memoryShips;
    }

    // Try DB query
    try {
      const res = await query(
        `SELECT DISTINCT ON (mmsi) mmsi, lat, lon, course, speed, ship_name, ship_type, received_at
         FROM ais_positions
         WHERE received_at >= NOW() - INTERVAL '24 hours'
         ORDER BY mmsi, received_at DESC
         LIMIT 300`
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  /**
   * Prune positions older than 72 hours
   */
  async pruneExpiredPositions() {
    const seventyTwoHoursAgo = Date.now() - 72 * 60 * 60 * 1000;

    // Prune in-memory map
    for (const [mmsi, pos] of this.livePositions.entries()) {
      if (new Date(pos.received_at).getTime() < seventyTwoHoursAgo) {
        this.livePositions.delete(mmsi);
      }
    }

    // Prune DB
    try {
      await query(`DELETE FROM ais_positions WHERE received_at < NOW() - INTERVAL '72 hours'`);
      logger.info('Pruned AIS positions older than 72 hours');
    } catch {
      // Ignore if DB unreachable
    }
  }

  stop() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.pruneInterval) clearInterval(this.pruneInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const aisStreamClient = new AISStreamClient();
export default aisStreamClient;
