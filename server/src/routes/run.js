import { Router } from 'express';
import orchestrator from '../orchestrator.js';
import logger from '../logger.js';

const router = Router();

/**
 * POST /api/run
 * Trigger an on-demand multi-agent pipeline cycle.
 */
router.post('/run', async (req, res) => {
  try {
    const isBackfill = Boolean(req.body.isBackfill);
    logger.info({ isBackfill }, 'Manual pipeline execution requested via API');

    const result = await orchestrator.runPipeline({ isBackfill });

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to execute manual pipeline run');
    res.status(500).json({ error: 'Pipeline execution failed', message: err.message });
  }
});

export default router;
