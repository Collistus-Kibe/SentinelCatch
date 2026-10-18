import { Router } from 'express';
import { getGeoJsonLayers, KENYA_EEZ_POLYGON, KENYA_MPAS } from '../geo/kenya_eez.js';
import { KENYA_PORTS } from '../utils/geo.js';
import aisStreamClient from '../integrations/aisstream.js';
import DetectionAgent from '../agents/detection.js';
import ReasoningAgent from '../agents/reasoning.js';
import { query } from '../db/index.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/map/layers
 * Returns comprehensive GeoJSON FeatureCollection for MapLibre (Flat & 3D Globe).
 */
router.get('/map/layers', async (req, res) => {
  try {
    const baseLayers = getGeoJsonLayers();

    // 1. Port markers
    const portFeatures = KENYA_PORTS.map((port) => ({
      type: 'Feature',
      id: `port-${port.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      properties: {
        type: 'port',
        name: port.name,
        sector: port.sector,
      },
      geometry: {
        type: 'Point',
        coordinates: [port.lon, port.lat],
      },
    }));

    // 2. Active cases as GeoJSON points
    let caseFeatures = [];
    try {
      const casesRes = await query(
        `SELECT c.id, c.score_final, c.band, c.sector, c.status, c.rationale, c.created_at,
                d.lat, d.lon, d.uncertainty_km, d.length_m
         FROM cases c
         JOIN detections d ON c.detection_id = d.id
         WHERE c.created_at >= NOW() - INTERVAL '30 days'
         ORDER BY c.created_at DESC LIMIT 100`
      );
      caseFeatures = casesRes.rows.map((row) => ({
        type: 'Feature',
        id: `case-${row.id}`,
        properties: {
          type: 'case',
          caseId: row.id,
          score: row.score_final,
          band: row.band,
          sector: row.sector,
          status: row.status,
          rationale: row.rationale,
          lengthM: row.length_m,
          uncertaintyKm: row.uncertainty_km,
          createdAt: row.created_at,
        },
        geometry: {
          type: 'Point',
          coordinates: [row.lon, row.lat],
        },
      }));
    } catch {
      // In-memory fallback
      const memoryCases = ReasoningAgent.getInMemoryCases();
      caseFeatures = memoryCases.map((c) => ({
        type: 'Feature',
        id: `case-${c.id}`,
        properties: {
          type: 'case',
          caseId: c.id,
          score: c.score_final,
          band: c.band,
          sector: c.sector,
          status: c.status,
          rationale: c.rationale,
          lengthM: c.features?.estimatedLengthM,
          uncertaintyKm: 1.5,
          createdAt: c.created_at,
        },
        geometry: {
          type: 'Point',
          coordinates: [c.features?.lon || 40.5, c.features?.lat || -3.5],
        },
      }));
    }

    // 3. Live AIS ships
    const liveShips = await aisStreamClient.getLiveShips();
    const shipFeatures = liveShips.map((ship) => ({
      type: 'Feature',
      id: `ais-${ship.mmsi}`,
      properties: {
        type: 'ais_ship',
        mmsi: ship.mmsi,
        name: ship.ship_name || `MMSI ${ship.mmsi}`,
        course: ship.course,
        speed: ship.speed,
        shipType: ship.ship_type,
        receivedAt: ship.received_at,
      },
      geometry: {
        type: 'Point',
        coordinates: [ship.lon, ship.lat],
      },
    }));

    // 4. AIS coverage confidence grid (0.5° cells)
    const coverageFeatures = generateAisCoverageGrid();

    res.json({
      type: 'FeatureCollection',
      features: [
        ...baseLayers.features,
        ...portFeatures,
        ...coverageFeatures,
        ...caseFeatures,
        ...shipFeatures,
      ],
      meta: {
        casesCount: caseFeatures.length,
        shipsCount: shipFeatures.length,
        portsCount: portFeatures.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to generate map layers GeoJSON');
    res.status(500).json({ error: 'Failed to generate map layers' });
  }
});

/**
 * GET /api/map/ais
 * Returns active AIS vessels inside Kenya EEZ
 */
router.get('/map/ais', async (_req, res) => {
  try {
    const liveShips = await aisStreamClient.getLiveShips();
    res.json({
      ships: liveShips,
      count: liveShips.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch live AIS ships');
    res.status(500).json({ error: 'Failed to retrieve AIS ships' });
  }
});

/**
 * Helper to build AIS reception confidence grid across Kenya's EEZ
 */
function generateAisCoverageGrid() {
  const cells = [];
  // Grid between minLat -4.5 to 0.0, minLon 39.5 to 44.5 in 0.5° steps
  for (let lat = -4.5; lat <= 0.0; lat += 0.5) {
    for (let lon = 39.5; lon <= 44.5; lon += 0.5) {
      // Near shore (<40.5) has higher terrestrial AIS reception
      const confidence = lon < 40.5 ? 0.95 : lon < 42.5 ? 0.85 : 0.76;
      cells.push({
        type: 'Feature',
        id: `cov-${lat.toFixed(1)}-${lon.toFixed(1)}`,
        properties: {
          type: 'ais_coverage',
          confidence,
          latCenter: lat,
          lonCenter: lon,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [lon - 0.25, lat - 0.25],
            [lon + 0.25, lat - 0.25],
            [lon + 0.25, lat + 0.25],
            [lon - 0.25, lat + 0.25],
            [lon - 0.25, lat - 0.25],
          ]],
        },
      });
    }
  }
  return cells;
}

export default router;
