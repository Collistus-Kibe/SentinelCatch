import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import broker from '../alerts/broker.js';
import ReasoningAgent from '../agents/reasoning.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/cases
 * Retrieve cases filtered by sector, band, status, and time.
 */
router.get('/cases', async (req, res) => {
  try {
    const sector = req.query.sector;
    const band = req.query.band;
    const status = req.query.status;
    const since = req.query.since;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(0, Number(req.query.offset) || 0);

    // Try PostgreSQL query
    try {
      const conditions = [];
      const params = [];

      if (sector && sector !== 'all') {
        params.push(sector);
        conditions.push(`sector = $${params.length}`);
      }

      if (band && band !== 'all') {
        params.push(band);
        conditions.push(`band = $${params.length}`);
      }

      if (status && status !== 'all') {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }

      if (since) {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          params.push(sinceDate.toISOString());
          conditions.push(`created_at >= $${params.length}`);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countSql = `SELECT COUNT(*) as total FROM cases ${whereClause}`;
      const countRes = await query(countSql, params);
      const total = Number(countRes.rows[0]?.total || 0);

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const listSql = `
        SELECT c.*, d.lat, d.lon, d.uncertainty_km, d.length_m, d.detected_at, d.raw as detection_raw
        FROM cases c
        LEFT JOIN detections d ON c.detection_id = d.id
        ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const listRes = await query(listSql, params);
      const parsedCases = listRes.rows.map((row) => {
        if (typeof row.features === 'string') {
          try { row.features = JSON.parse(row.features); } catch { row.features = {}; }
        }
        return row;
      });

      return res.json({
        cases: parsedCases,
        total,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Fallback: Query from in-memory cache if PostgreSQL is offline
      let memoryCases = ReasoningAgent.getInMemoryCases();

      if (sector && sector !== 'all') {
        memoryCases = memoryCases.filter((c) => c.sector === sector);
      }
      if (band && band !== 'all') {
        memoryCases = memoryCases.filter((c) => c.band === band);
      }
      if (status && status !== 'all') {
        memoryCases = memoryCases.filter((c) => c.status === status);
      }

      const total = memoryCases.length;
      const paginated = memoryCases.slice(offset, offset + limit);

      return res.json({
        cases: paginated,
        total,
        limit,
        offset,
        source: 'in-memory-fallback',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to list cases');
    res.status(500).json({ error: 'Failed to retrieve cases' });
  }
});

/**
 * GET /api/cases/:id
 * Retrieve a specific case by ID with full features and audit events.
 */
router.get('/cases/:id', async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) {
    return res.status(400).json({ error: 'Invalid case ID' });
  }

  try {
    let caseData = null;
    let events = [];

    try {
      const caseRes = await query(
        `SELECT c.*, d.lat, d.lon, d.uncertainty_km, d.length_m, d.detected_at, d.raw as detection_raw
         FROM cases c
         LEFT JOIN detections d ON c.detection_id = d.id
         WHERE c.id = $1`,
        [caseId]
      );
      caseData = caseRes.rows[0];

      if (caseData) {
        const eventsRes = await query(
          `SELECT * FROM case_events WHERE case_id = $1 ORDER BY created_at ASC`,
          [caseId]
        );
        events = eventsRes.rows;
      }
    } catch {
      // In-memory fallback
      const allCases = ReasoningAgent.getInMemoryCases();
      caseData = allCases.find((c) => c.id === caseId);
    }

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (caseData && typeof caseData.features === 'string') {
      try { caseData.features = JSON.parse(caseData.features); } catch { caseData.features = {}; }
    }

    res.json({
      case: caseData,
      events,
    });
  } catch (err) {
    logger.error({ err, caseId }, 'Failed to fetch case details');
    res.status(500).json({ error: 'Failed to retrieve case details' });
  }
});

const actionSchema = z.object({
  action: z.enum(['acknowledge', 'dispatch', 'false_alarm', 'resolved']),
  actorName: z.string().min(1).default('Fisheries Officer'),
  deviceId: z.string().optional().default(''),
  note: z.string().optional().default(''),
});

/**
 * POST /api/cases/:id/action
 * Perform a status workflow action (Acknowledge, Dispatch, False alarm, Resolve).
 */
router.post('/cases/:id/action', async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) {
    return res.status(400).json({ error: 'Invalid case ID' });
  }

  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid action payload', issues: parsed.error.issues });
  }

  const { action, actorName, deviceId, note } = parsed.data;

  // Map action to status
  const statusMap = {
    acknowledge: 'acknowledged',
    dispatch: 'dispatched',
    false_alarm: 'false_alarm',
    resolved: 'resolved',
  };
  const newStatus = statusMap[action];

  try {
    let updatedCase = null;

    try {
      // Update case status in database
      const updateRes = await query(
        `UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [newStatus, caseId]
      );
      updatedCase = updateRes.rows[0];

      // Insert audit event
      await query(
        `INSERT INTO case_events (case_id, actor_name, device_id, action, note, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [caseId, actorName, deviceId, action, note || null]
      );
    } catch {
      // In-memory update
      const allCases = ReasoningAgent.getInMemoryCases();
      updatedCase = allCases.find((c) => c.id === caseId);
      if (updatedCase) {
        updatedCase.status = newStatus;
        updatedCase.updated_at = new Date().toISOString();
      }
    }

    if (!updatedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Broadcast case update event across SSE broker
    broker.publish('case_update', {
      caseId,
      status: newStatus,
      action,
      actorName,
      note,
      updatedAt: new Date().toISOString(),
    });

    logger.info({ caseId, action, newStatus, actorName }, 'Case workflow status updated');

    res.json({
      success: true,
      caseId,
      status: newStatus,
      updatedCase,
    });
  } catch (err) {
    logger.error({ err, caseId, action }, 'Failed to update case action');
    res.status(500).json({ error: 'Failed to process case action' });
  }
});

/**
 * POST /api/cases/:id/deliberate
 * Run autonomous Prosecutor vs Skeptic multi-agent deliberation on this case.
 */
router.post('/cases/:id/deliberate', async (req, res) => {
  const caseId = Number(req.params.id);
  try {
    const allCases = ReasoningAgent.getInMemoryCases();
    let targetCase = allCases.find((c) => c.id === caseId);

    if (!targetCase) {
      try {
        const dbRes = await query(`SELECT * FROM cases WHERE id = $1`, [caseId]);
        if (dbRes.rows[0]) targetCase = dbRes.rows[0];
      } catch (err) {
        logger.debug({ err }, 'DB lookup fallback');
      }
    }

    if (!targetCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Run deliberation
    const { deliberationEngine } = await import('../agents/deliberation.js');
    const deliberation = await deliberationEngine.deliberate(targetCase);

    // Save deliberation to case features
    if (!targetCase.features) targetCase.features = {};
    targetCase.features.deliberation = deliberation;

    try {
      await query(
        `UPDATE cases SET features = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(targetCase.features), caseId]
      );
    } catch {
      // In-memory updated
    }

    // Broadcast update
    broker.publish('case_update', {
      caseId,
      action: 'deliberated',
      deliberation,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      caseId,
      deliberation,
    });
  } catch (err) {
    logger.error({ err, caseId }, 'Failed to run deliberation');
    res.status(500).json({ error: 'Failed to complete deliberation' });
  }
});

/**
 * GET /api/cases/:id/dossier
 * Export full legal & tactical evidence dossier for a specific case.
 */
router.get('/cases/:id/dossier', async (req, res) => {
  const caseId = Number(req.params.id);
  try {
    const allCases = ReasoningAgent.getInMemoryCases();
    let c = allCases.find((x) => x.id === caseId);

    if (!c) {
      try {
        const dbRes = await query(`SELECT * FROM cases WHERE id = $1`, [caseId]);
        if (dbRes.rows[0]) c = dbRes.rows[0];
      } catch (err) {
        logger.debug({ err }, 'DB lookup fallback');
      }
    }

    if (!c) return res.status(404).json({ error: 'Case not found' });

    if (c && typeof c.features === 'string') {
      try { c.features = JSON.parse(c.features); } catch { c.features = {}; }
    }

    // Fetch audit events
    let events = [];
    try {
      const evRes = await query(
        `SELECT * FROM case_events WHERE case_id = $1 ORDER BY created_at ASC`,
        [caseId]
      );
      events = evRes.rows;
    } catch {
      events = [
        { action: 'created', created_at: c.created_at, actor_name: 'Sentinel-1 Ingestion Pipeline', note: 'Isolated SAR target lacking AIS' },
      ];
    }

    const dossier = {
      dossierId: `KEN-MAR-INTEL-${c.id}-${new Date(c.created_at).getFullYear()}`,
      classification: 'OFFICIAL — TACTICAL MARITIME DECISION SUPPORT',
      target: {
        caseId: c.id,
        sector: c.sector || 'Kenya Coastal Waters',
        threatBand: c.band,
        scoreFinal: c.score_final,
        scoreRule: c.score_rule,
        scoreLlmAdjust: c.score_llm_adjust,
        coordinates: {
          lat: c.features?.lat ?? c.lat,
          lon: c.features?.lon ?? c.lon,
        },
        detectedAtEat: new Date(c.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }),
        detectedAtUtc: new Date(c.created_at).toISOString(),
        satelliteSensor: 'Sentinel-1 C-Band Synthetic Aperture Radar (Copernicus)',
        estimatedLengthM: c.features?.estimatedLengthM || 'Unknown radar return',
      },
      candidateMatches: c.candidate_matches || c.features?.candidate_matches || [],
      deliberation: c.features?.deliberation || null,
      rationale: c.rationale,
      features: c.features || {},
      auditEvents: events,
      legalDisclaimer:
        'This intelligence document provides probabilistic decision support derived from open satellite synthetic aperture radar and transponder monitoring. It serves as an investigative tactical lead for patrol asset deployment and does not constitute judicial conviction evidence without on-water boarding inspection.',
      generatedAt: new Date().toISOString(),
    };

    res.json(dossier);
  } catch (err) {
    logger.error({ err, caseId }, 'Failed to compile evidence dossier');
    res.status(500).json({ error: 'Failed to compile evidence dossier' });
  }
});

export default router;
