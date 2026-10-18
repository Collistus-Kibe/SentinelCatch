-- SentinelCatch Migration 002: On-site notifications
-- Drop external delivery channel tables and create the on-site notifications table

-- Drop obsolete push_subscriptions table
DROP TABLE IF EXISTS push_subscriptions CASCADE;

-- Drop obsolete external alert_log table
DROP TABLE IF EXISTS alert_log CASCADE;

-- ──────────────────────────────────────────────
-- On-site real-time notifications
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                    BIGSERIAL PRIMARY KEY,
  case_id               BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL CHECK (type IN ('case_new', 'case_update', 'system_test')),
  band                  TEXT NOT NULL CHECK (band IN ('High', 'Medium', 'Low')),
  headline              TEXT NOT NULL,
  body                  TEXT NOT NULL,
  lat                   DOUBLE PRECISION,
  lon                   DOUBLE PRECISION,
  sector                TEXT,
  score                 INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  broadcast_latency_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_band ON notifications (band);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_case_id ON notifications (case_id);
