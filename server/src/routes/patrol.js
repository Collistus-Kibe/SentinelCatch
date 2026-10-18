import { Router } from 'express';
import patrolPlanner, { PATROL_BASES } from '../agents/patrol.js';
import reasoningAgent from '../agents/reasoning.js';
import { query } from '../db/index.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/patrol/bases
 * List available Kenya coastal patrol bases and illustrative asset types.
 */
router.get('/patrol/bases', (_req, res) => {
  res.json({
    bases: Object.values(PATROL_BASES),
    disclaimer: 'Illustrative tactical planning bases. Official asset specifications are classified.',
  });
});

/**
 * GET /api/patrol/plan
 * Compute optimized patrol dispatch recommendations.
 */
router.get('/patrol/plan', async (req, res) => {
  try {
    const baseId = (req.query.base || 'mombasa').toLowerCase();
    const speedKnots = Number(req.query.speed) || 22;

    let cases = reasoningAgent.getInMemoryCases();
    if (cases.length === 0) {
      try {
        const dbRes = await query(`SELECT * FROM cases WHERE status NOT IN ('resolved', 'false_alarm') ORDER BY score_final DESC LIMIT 50`);
        cases = dbRes.rows;
      } catch (err) {
        logger.debug({ err: err.message }, 'DB lookup for patrol plan');
      }
    }

    const plan = patrolPlanner.planPatrol(cases, { baseId, speedKnots });
    res.json(plan);
  } catch (err) {
    logger.error({ err }, 'Failed to compute patrol plan');
    res.status(500).json({ error: 'Failed to compute patrol plan' });
  }
});

export default router;
