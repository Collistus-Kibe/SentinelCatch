import cron from 'node-cron';
import config from './config.js';
import logger from './logger.js';
import { tryAdvisoryLock, releaseAdvisoryLock, query } from './db/index.js';
import broker from './alerts/broker.js';
import DetectionAgent from './agents/detection.js';
import ReasoningAgent from './agents/reasoning.js';
import aisStreamClient from './integrations/aisstream.js';

const LOCK_ID = 42; // PostgreSQL advisory lock identifier for SentinelCatch pipeline

export class PipelineOrchestrator {
  constructor() {
    this.cronTask = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.lastRunStats = null;
  }

  /**
   * Start the orchestrator, initialize AISStream client, and schedule recurring cron.
   */
  start() {
    logger.info('Initializing SentinelCatch Pipeline Orchestrator...');

    // 1. Start live AISStream client for Kenya EEZ
    aisStreamClient.start();

    // 2. Schedule recurring pipeline execution
    const intervalMinutes = Math.max(5, config.PIPELINE_INTERVAL_MINUTES || 60);
    const cronExpr = `*/${intervalMinutes} * * * *`;

    this.cronTask = cron.schedule(cronExpr, async () => {
      logger.info('Scheduled pipeline execution triggered');
      await this.runPipeline({ isBackfill: false });
    });

    logger.info({ intervalMinutes, cronExpr }, 'Pipeline scheduler active');

    // Run initial run asynchronously after startup
    setTimeout(() => {
      this.runPipeline({ isBackfill: false }).catch((err) => {
        logger.error({ err }, 'Initial pipeline execution failed');
      });
    }, 5000);
  }

  /**
   * Execute one full run of the Detection -> Reasoning -> Alert pipeline.
   * Guarded by non-blocking PostgreSQL advisory lock.
   */
  async runPipeline({ isBackfill = false } = {}) {
    if (this.isRunning) {
      logger.warn('Pipeline run already in progress locally; skipping execution');
      return { skipped: true, reason: 'Local run in progress' };
    }

    let hasLock = false;
    try {
      hasLock = await tryAdvisoryLock(LOCK_ID);
    } catch {
      hasLock = true; // In offline dev without postgres, proceed
    }

    if (!hasLock) {
      logger.warn('Another SentinelCatch instance holds the advisory lock; skipping run');
      return { skipped: true, reason: 'Advisory lock held by another process' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    logger.info({ isBackfill }, '=== Multi-Agent Pipeline Run Started ===');

    let runId = null;
    try {
      const res = await query(
        `INSERT INTO pipeline_runs (stage, started_at, status) VALUES ('full', NOW(), 'running') RETURNING id`
      );
      runId = res.rows[0]?.id;
    } catch {
      // Ignore if DB unreachable
    }

    try {
      // ── Step 1: Detection Agent ─────────────────────────────
      broker.publish('status', { stage: 'detection', message: 'Pulling SAR radar and AIS feeds...' });
      const unmatchedDetections = await DetectionAgent.run();

      // ── Step 2: Reasoning Agent & Alert Agent ───────────────
      broker.publish('status', {
        stage: 'reasoning',
        message: `Analyzing ${unmatchedDetections.length} candidate dark vessel contacts...`,
      });

      const liveShips = await aisStreamClient.getLiveShips();
      const assessedCases = await ReasoningAgent.processCandidates(unmatchedDetections, {
        isBackfill,
        liveShips,
      });

      const highCount = assessedCases.filter((c) => c.band === 'High').length;
      const medCount = assessedCases.filter((c) => c.band === 'Medium').length;
      const lowCount = assessedCases.filter((c) => c.band === 'Low').length;

      const durationMs = Date.now() - startTime;
      this.lastRunAt = new Date().toISOString();
      this.lastRunStats = {
        detectionsCount: unmatchedDetections.length,
        casesCount: assessedCases.length,
        highCount,
        medCount,
        lowCount,
        durationMs,
        isBackfill,
      };

      logger.info(
        this.lastRunStats,
        '=== Multi-Agent Pipeline Run Completed Successfully ==='
      );

      // Record in pipeline_runs
      if (runId) {
        try {
          await query(
            `UPDATE pipeline_runs SET finished_at = NOW(), counts = $1, status = 'completed' WHERE id = $2`,
            [JSON.stringify(this.lastRunStats), runId]
          );
        } catch {
          // Ignore
        }
      }

      broker.publish('status', {
        stage: 'completed',
        stats: this.lastRunStats,
        timestamp: this.lastRunAt,
      });

      return {
        success: true,
        stats: this.lastRunStats,
        cases: assessedCases,
      };
    } catch (err) {
      logger.error({ err }, 'Multi-Agent pipeline run encountered an unhandled error');

      if (runId) {
        try {
          await query(
            `UPDATE pipeline_runs SET finished_at = NOW(), status = 'failed', errors = $1 WHERE id = $2`,
            [JSON.stringify([err.message]), runId]
          );
        } catch {
          // Ignore
        }
      }

      broker.publish('status', {
        stage: 'failed',
        error: err.message,
      });

      return { success: false, error: err.message };
    } finally {
      this.isRunning = false;
      try {
        await releaseAdvisoryLock(LOCK_ID);
      } catch {
        // Ignore
      }
    }
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
    aisStreamClient.stop();
    logger.info('Pipeline orchestrator stopped');
  }
}

export const orchestrator = new PipelineOrchestrator();
export default orchestrator;
