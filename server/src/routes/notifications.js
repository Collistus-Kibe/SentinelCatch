import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import broker from '../alerts/broker.js';
import { dispatchAlert } from '../alerts/index.js';
import { inMemoryNotifications } from '../alerts/onsite.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/stream
 * Server-Sent Events (SSE) live broadcast stream.
 * Features:
 * - 25s keepalive heartbeat (prevents Render proxy idle timeout)
 * - Last-Event-ID reconnection replay
 * - Real-time notification, case_update, status, and ais_tick events
 */
router.get('/stream', async (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable proxy buffering (nginx / render)
  });

  const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clientCount = broker.incrementClients();
  logger.info({ clientId, clientCount }, 'Client connected to SSE stream');

  // Initial connection acknowledgement
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Last-Event-ID resume: replay any missed notifications
  const lastEventId = req.headers['last-event-id'] || req.query.lastEventId;
  if (lastEventId) {
    try {
      const missed = await query(
        'SELECT * FROM notifications WHERE id > $1 ORDER BY id ASC LIMIT 50',
        [Number(lastEventId) || 0]
      );
      for (const row of missed.rows) {
        res.write(`id: ${row.id}\nevent: notification\ndata: ${JSON.stringify(row)}\n\n`);
      }
    } catch (err) {
      logger.warn({ err, lastEventId }, 'Failed to replay missed SSE events');
    }
  }

  // Event handlers
  const onNotification = (data) => {
    res.write(`id: ${data.id || Date.now()}\nevent: notification\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onCaseUpdate = (data) => {
    res.write(`event: case_update\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onStatus = (data) => {
    res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onAisTick = (data) => {
    res.write(`event: ais_tick\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onPatrolDispatch = (data) => {
    res.write(`event: patrol_dispatch\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onOfficerPresence = (data) => {
    res.write(`event: officer_presence\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onStationChat = (data) => {
    res.write(`event: station_chat_message\ndata: ${JSON.stringify(data)}\n\n`);
  };

  broker.on('notification', onNotification);
  broker.on('case_update', onCaseUpdate);
  broker.on('status', onStatus);
  broker.on('ais_tick', onAisTick);
  broker.on('patrol_dispatch', onPatrolDispatch);
  broker.on('officer_presence', onOfficerPresence);
  broker.on('station_chat_message', onStationChat);

  // 25-second keepalive heartbeat comment
  const heartbeatInterval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  // Client disconnected cleanup
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    broker.off('notification', onNotification);
    broker.off('case_update', onCaseUpdate);
    broker.off('status', onStatus);
    broker.off('ais_tick', onAisTick);
    broker.off('patrol_dispatch', onPatrolDispatch);
    broker.off('officer_presence', onOfficerPresence);
    broker.off('station_chat_message', onStationChat);
    const remaining = broker.decrementClients();
    logger.info({ clientId, remaining }, 'Client disconnected from SSE stream');
  });
});

/**
 * GET /api/notifications
 * Polling fallback endpoint for clients when SSE is interrupted.
 */
router.get('/notifications', async (req, res) => {
  try {
    const since = req.query.since;
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);

    let sql = 'SELECT * FROM notifications';
    const params = [];

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        sql += ' WHERE created_at > $1';
        params.push(sinceDate.toISOString());
      }
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

    try {
      const { rows } = await query(sql, params);
      return res.json({
        notifications: rows,
        count: rows.length,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // In-memory fallback
      let memNotifs = inMemoryNotifications;
      if (since) {
        const sinceTime = new Date(since).getTime();
        memNotifs = memNotifs.filter((n) => new Date(n.created_at).getTime() > sinceTime);
      }
      return res.json({
        notifications: memNotifs.slice(0, limit),
        count: memNotifs.length,
        source: 'in-memory-fallback',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to fetch notifications');
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

/**
 * POST /api/notifications/test
 * Sends a clearly-labeled system test notification.
 * Never creates a fake vessel case; verifies end-to-end SSE delivery path.
 */
router.post('/notifications/test', async (req, res) => {
  const start = Date.now();
  try {
    const result = await dispatchAlert({
      caseId: null,
      type: 'system_test',
      band: 'High',
      headline: 'System Test Notification',
      body: 'Live on-site alert pipeline verified. Real-time SSE stream is functional.',
      lat: -4.0435, // Mombasa coast
      lon: 39.6682,
      sector: 'Mombasa',
      score: 99,
      caseCreatedAt: new Date().toISOString(),
    });

    const roundTripMs = Date.now() - start;
    res.json({
      success: true,
      roundTripMs,
      notification: result.notification,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to generate system test notification');
    res.status(500).json({ error: 'Failed to dispatch test notification' });
  }
});

export default router;
