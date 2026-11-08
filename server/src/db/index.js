import pg from 'pg';
import mysql from 'mysql2/promise';
import config from '../config.js';
import logger from '../logger.js';

const isMysql = Boolean(
  config.DATABASE_URL &&
  (config.DATABASE_URL.startsWith('mysql://') || config.DATABASE_URL.startsWith('tidb://'))
);

let pgPool = null;
let mysqlPool = null;
let dbInitialized = false;

// Initialize connection pool based on URL
try {
  if (isMysql) {
    let cleanUrl = config.DATABASE_URL.replace(/^tidb:\/\//, 'mysql://');
    try {
      const parsed = new URL(cleanUrl);
      if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname === '/sys') {
        parsed.pathname = '/test';
        cleanUrl = parsed.toString();
        logger.info('TiDB connection redirected to application database "/test"');
      }
    } catch {
      if (!cleanUrl.includes('/test') && !cleanUrl.includes('/sentinelcatch')) {
        cleanUrl = cleanUrl.replace(/:4000(\/?)(?:sys)?(\?|$)/, ':4000/test$2');
      }
    }

    mysqlPool = mysql.createPool({
      uri: cleanUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: {
        rejectUnauthorized: false,
      },
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
    logger.info('Connected to TiDB Cloud / MySQL pool');
  } else if (
    config.DATABASE_URL &&
    (config.DATABASE_URL.startsWith('postgres://') || config.DATABASE_URL.startsWith('postgresql://'))
  ) {
    pgPool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pgPool.on('error', (err) => {
      logger.debug({ err: err.message }, 'PostgreSQL pool background error');
    });
    logger.info('Connected to PostgreSQL pool');
  } else {
    logger.info('No persistent database URI configured; using resilient in-memory store');
  }
} catch (err) {
  logger.info({ err: err.message }, 'Database pool using in-memory store');
}

/**
 * Initialize TiDB schema if running against TiDB/MySQL
 */
async function initMysqlSchema() {
  if (!mysqlPool || dbInitialized) return;
  try {
    try {
      await mysqlPool.query(`CREATE DATABASE IF NOT EXISTS test`);
    } catch {}
    try {
      await mysqlPool.query(`USE test`);
    } catch {}

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS detections (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        dataset VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lon DOUBLE NOT NULL,
        uncertainty_km DOUBLE,
        detected_at DATETIME NOT NULL,
        matched BOOLEAN NOT NULL DEFAULT false,
        length_m DOUBLE,
        raw JSON,
        hash VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_detected_at (detected_at),
        INDEX idx_location (lat, lon)
      ) ENGINE=InnoDB;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        detection_id BIGINT,
        cluster_ids JSON,
        behavior VARCHAR(100) NOT NULL DEFAULT 'dark-vessel',
        score_rule INT NOT NULL,
        score_llm_adjust INT NOT NULL DEFAULT 0,
        score_final INT NOT NULL,
        band VARCHAR(20) NOT NULL,
        rationale TEXT NOT NULL,
        features JSON,
        sector VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_band (band),
        INDEX idx_status (status),
        INDEX idx_sector (sector)
      ) ENGINE=InnoDB;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS case_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        case_id BIGINT NOT NULL,
        actor_name VARCHAR(255),
        device_id VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        note TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_case_id (case_id)
      ) ENGINE=InnoDB;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        case_id BIGINT,
        type VARCHAR(50) NOT NULL DEFAULT 'case_new',
        band VARCHAR(20) NOT NULL DEFAULT 'High',
        headline TEXT,
        body TEXT,
        lat DOUBLE,
        lon DOUBLE,
        sector VARCHAR(100),
        score INT,
        channel VARCHAR(50) NOT NULL DEFAULT 'onsite',
        status VARCHAR(50) NOT NULL DEFAULT 'delivered',
        message TEXT,
        broadcast_latency_ms INT DEFAULT 35,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at),
        INDEX idx_band (band),
        INDEX idx_type (type),
        INDEX idx_case_id (case_id)
      ) ENGINE=InnoDB;
    `);

    // Ensure all required columns exist on legacy notifications tables in TiDB/MySQL
    const notificationColumns = [
      "ALTER TABLE notifications ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'case_new'",
      "ALTER TABLE notifications ADD COLUMN band VARCHAR(20) NOT NULL DEFAULT 'High'",
      "ALTER TABLE notifications ADD COLUMN headline TEXT",
      "ALTER TABLE notifications ADD COLUMN body TEXT",
      "ALTER TABLE notifications ADD COLUMN lat DOUBLE",
      "ALTER TABLE notifications ADD COLUMN lon DOUBLE",
      "ALTER TABLE notifications ADD COLUMN sector VARCHAR(100)",
      "ALTER TABLE notifications ADD COLUMN score INT",
      "ALTER TABLE notifications ADD COLUMN broadcast_latency_ms INT DEFAULT 35",
    ];
    for (const alterSql of notificationColumns) {
      try {
        await mysqlPool.query(alterSql);
      } catch {
        // Column already exists or table updated
      }
    }

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS ais_positions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        mmsi VARCHAR(20) NOT NULL,
        lat DOUBLE NOT NULL,
        lon DOUBLE NOT NULL,
        course DOUBLE,
        speed DOUBLE,
        ship_name VARCHAR(255),
        ship_type INT,
        raw JSON,
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mmsi (mmsi),
        INDEX idx_received_at (received_at),
        INDEX idx_location (lat, lon)
      ) ENGINE=InnoDB;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        stage VARCHAR(100) NOT NULL DEFAULT 'full',
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME,
        status VARCHAR(50) NOT NULL DEFAULT 'running',
        counts JSON,
        errors JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_started_at (started_at)
      ) ENGINE=InnoDB;
    `);

    dbInitialized = true;
    logger.info('TiDB schema initialized successfully');
  } catch (err) {
    logger.warn({ err: err.message }, 'TiDB schema auto-init warning');
  }
}

/**
 * Execute parameterized query across TiDB / MySQL or PostgreSQL.
 * @param {string} text - SQL query
 * @param {any[]} params - Query parameters
 * @returns {Promise<{ rows: any[], rowCount: number, insertId?: any }>}
 */
export async function query(text, params = []) {
  const start = Date.now();

  if (mysqlPool) {
    await initMysqlSchema();

    let mysqlSql = text;
    let mysqlParams = [...params];

    // If query has LIMIT $N and/or OFFSET $N, inline the integer values directly into the query
    // and remove them from the parameters list so TiDB prepared statements never error.
    const limitOffsetMatch = mysqlSql.match(/LIMIT\s+\$(\d+)(?:\s+OFFSET\s+\$(\d+))?/i);
    if (limitOffsetMatch) {
      const limitIdx = parseInt(limitOffsetMatch[1], 10) - 1;
      const offsetIdx = limitOffsetMatch[2] ? parseInt(limitOffsetMatch[2], 10) - 1 : -1;
      const limitVal = parseInt(mysqlParams[limitIdx], 10) || 50;
      const offsetVal = offsetIdx >= 0 ? (parseInt(mysqlParams[offsetIdx], 10) || 0) : null;

      let replacement = `LIMIT ${limitVal}`;
      if (offsetVal !== null) {
        replacement += ` OFFSET ${offsetVal}`;
      }
      mysqlSql = mysqlSql.replace(limitOffsetMatch[0], replacement);

      const indicesToRemove = [limitIdx, offsetIdx].filter((idx) => idx >= 0).sort((a, b) => b - a);
      for (const idx of indicesToRemove) {
        mysqlParams.splice(idx, 1);
      }
    }

    // Convert remaining $1, $2, ... to ? for MySQL
    mysqlSql = mysqlSql.replace(/\$(\d+)/g, '?');

    // Adapt common postgres syntax differences
    mysqlSql = mysqlSql.replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*hours'/gi, 'NOW() - INTERVAL $1 HOUR');
    mysqlSql = mysqlSql.replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*days'/gi, 'NOW() - INTERVAL $1 DAY');
    mysqlSql = mysqlSql.replace(/INTERVAL\s*'(\d+)\s*days'/gi, 'INTERVAL $1 DAY');
    mysqlSql = mysqlSql.replace(/INTERVAL\s*'(\d+)\s*hours'/gi, 'INTERVAL $1 HOUR');
    mysqlSql = mysqlSql.replace(/COUNT\(\*\)\s+FILTER\s*\(WHERE\s+([^)]+)\)/gi, 'SUM(CASE WHEN $1 THEN 1 ELSE 0 END)');
    mysqlSql = mysqlSql.replace(/RETURNING\s+\*/gi, '');
    mysqlSql = mysqlSql.replace(/RETURNING\s+id/gi, '');

    // Adapt PostgreSQL ON CONFLICT for MySQL / TiDB
    mysqlSql = mysqlSql.replace(
      /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+matched\s*=\s*EXCLUDED\.matched/gi,
      'ON DUPLICATE KEY UPDATE matched = VALUES(matched)'
    );
    mysqlSql = mysqlSql.replace(
      /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+NOTHING/gi,
      'ON DUPLICATE KEY UPDATE id = id'
    );

    // Adapt PostgreSQL DISTINCT ON (column) for MySQL / TiDB
    if (/SELECT\s+DISTINCT\s+ON/i.test(mysqlSql)) {
      mysqlSql = mysqlSql.replace(/SELECT\s+DISTINCT\s+ON\s*\([^)]+\)\s+/gi, 'SELECT ');
    }

    // Handle any literal LIMIT ? with parameter
    if (/LIMIT\s+\?\s*$/i.test(mysqlSql) && mysqlParams.length > 0) {
      const lastParam = mysqlParams[mysqlParams.length - 1];
      if (typeof lastParam === 'number' || (typeof lastParam === 'string' && /^\d+$/.test(lastParam))) {
        mysqlSql = mysqlSql.replace(/LIMIT\s+\?\s*$/i, `LIMIT ${parseInt(lastParam, 10)}`);
        mysqlParams.pop();
      }
    }

    try {
      let results;
      try {
        const [execResults] = await mysqlPool.execute(mysqlSql, mysqlParams);
        results = execResults;
      } catch (execErr) {
        // Fallback to text query if prepared statement fails on parameter types or LIMIT
        if (execErr.message?.includes('LIMIT') || execErr.code === 'ER_WRONG_ARGUMENTS') {
          const [queryResults] = await mysqlPool.query(mysqlSql, mysqlParams);
          results = queryResults;
        } else {
          throw execErr;
        }
      }

      const duration = Date.now() - start;
      const isArray = Array.isArray(results);
      const rows = isArray ? results : [];
      const rowCount = isArray ? results.length : (results?.affectedRows || 0);

      logger.debug({ query: mysqlSql.slice(0, 80), duration, rowCount }, 'TiDB query');
      return { rows, rowCount, insertId: results?.insertId };
    } catch (err) {
      logger.error({ err: err.message, sql: mysqlSql.slice(0, 80) }, 'TiDB query error');
      throw err;
    }
  }

  if (pgPool) {
    try {
      const result = await pgPool.query(text, params);
      const duration = Date.now() - start;
      logger.debug({ query: text.slice(0, 80), duration, rows: result.rowCount }, 'PostgreSQL query');
      return result;
    } catch (err) {
      logger.debug({ err: err.message, sql: text.slice(0, 80) }, 'PostgreSQL query error, falling back to in-memory');
      throw err;
    }
  }

  // Graceful in-memory fallback: throw so caller's catch-block triggers in-memory store
  throw new Error('No persistent database configured; using in-memory store');
}

/**
 * Check if a persistent database pool is active (TiDB Cloud MySQL or PostgreSQL)
 */
export function hasActiveDb() {
  return Boolean(mysqlPool || pgPool);
}

/**
 * Get client for transactions
 */
export async function getClient() {
  if (mysqlPool) return mysqlPool.getConnection();
  if (pgPool) return pgPool.connect();
  throw new Error('No database pool available');
}

/**
 * Advisory lock for pipeline coordination
 */
export async function tryAdvisoryLock(lockId = 1) {
  try {
    if (mysqlPool) {
      const res = await query('SELECT GET_LOCK(?, 0) AS locked', [`sentinel_lock_${lockId}`]);
      return Boolean(res.rows[0]?.locked);
    }
    if (pgPool) {
      const res = await query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
      return Boolean(res.rows[0]?.locked);
    }
    return true; // Single process in-memory mode
  } catch {
    return true;
  }
}

export async function releaseAdvisoryLock(lockId = 1) {
  try {
    if (mysqlPool) {
      await query('SELECT RELEASE_LOCK(?)', [`sentinel_lock_${lockId}`]);
    } else if (pgPool) {
      await query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } catch {
    // Ignore lock release warnings
  }
}

/**
 * Database healthcheck
 */
export async function healthCheck() {
  try {
    if (mysqlPool) {
      await mysqlPool.query('SELECT 1');
      return true;
    }
    if (pgPool) {
      await pgPool.query('SELECT 1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default { query, healthCheck, tryAdvisoryLock, releaseAdvisoryLock };
