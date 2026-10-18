import { Router } from 'express';
import copilotAssistant from '../agents/copilot.js';
import reasoningAgent from '../agents/reasoning.js';
import { query } from '../db/index.js';
import logger from '../logger.js';

const router = Router();

/**
 * POST /api/chat
 * Natural language maritime domain query with safe read-only tools and case linking.
 */
router.post('/chat', async (req, res) => {
  try {
    const userQuery = req.body.message || req.body.query;
    if (!userQuery || typeof userQuery !== 'string') {
      return res.status(400).json({ error: 'Message or query string required' });
    }

    let cases = reasoningAgent.getInMemoryCases();
    if (cases.length === 0) {
      try {
        const dbRes = await query(`SELECT * FROM cases ORDER BY created_at DESC LIMIT 100`);
        cases = dbRes.rows;
      } catch (err) {
        logger.debug({ err: err.message }, 'DB lookup for chat');
      }
    }

    const answer = await copilotAssistant.answerQuery(userQuery, cases);
    res.json(answer);
  } catch (err) {
    logger.error({ err }, 'Failed to process copilot query');
    res.status(500).json({ error: 'Failed to process natural language query' });
  }
});

export default router;
