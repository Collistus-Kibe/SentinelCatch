-- SentinelCatch initial schema
-- All timestamps stored in UTC

-- ──────────────────────────────────────────────
-- Raw SAR/AIS detections
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS detections (
  id              BIGSERIAL PRIMARY KEY,
  dataset         TEXT NOT NULL,            -- e.g. 'public-global-sar-presence:latest'
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  uncertainty_km  DOUBLE PRECISION,         -- location uncertainty radius
  detected_at     TIMESTAMPTZ NOT NULL,
  matched         BOOLEAN NOT NULL DEFAULT false,
  length_m        DOUBLE PRECISION,         -- estimated vessel length (nullable)
  raw             JSONB NOT NULL DEFAULT '{}',
  hash            TEXT NOT NULL UNIQUE,      -- idempotency key
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detections_detected_at ON detections (detected_at);
CREATE INDEX IF NOT EXISTS idx_detections_matched ON detections (matched);
CREATE INDEX IF NOT EXISTS idx_detections_location ON detections (lat, lon);

-- ──────────────────────────────────────────────
-- Scored cases (one per detection cluster)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id              BIGSERIAL PRIMARY KEY,
  detection_id    BIGINT REFERENCES detections(id),
  cluster_ids     BIGINT[] DEFAULT '{}',      -- related detection IDs for recurrences
  behavior        TEXT NOT NULL DEFAULT 'dark-vessel',
  score_rule      INTEGER NOT NULL,           -- rule-based score 0-100
  score_llm_adjust INTEGER NOT NULL DEFAULT 0, -- LLM adjustment -15 to +15
  score_final     INTEGER NOT NULL,           -- clamped(rule + adjust)
  band            TEXT NOT NULL CHECK (band IN ('High', 'Medium', 'Low')),
  rationale       TEXT NOT NULL,
  features        JSONB NOT NULL DEFAULT '{}',
  sector          TEXT,                       -- Lamu, Malindi-Kilifi, Mombasa, South Coast/Vanga
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'acknowledged', 'dispatched', 'false_alarm', 'resolved')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_band ON cases (band);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_sector ON cases (sector);

-- ──────────────────────────────────────────────
-- Case status history / audit trail
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_events (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  actor_name      TEXT,                       -- self-declared officer name
  device_id       TEXT,                       -- device fingerprint
  action          TEXT NOT NULL
                    CHECK (action IN ('created', 'acknowledged', 'dispatched', 'false_alarm', 'resolved', 'score_updated', 'note')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events (case_id);

-- ──────────────────────────────────────────────
-- Push notification subscriptions
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  endpoint        TEXT NOT NULL UNIQUE,
  keys            JSONB NOT NULL,             -- {p256dh, auth}
  device_id       TEXT,
  officer_name    TEXT,
  min_band        TEXT NOT NULL DEFAULT 'High'
                    CHECK (min_band IN ('High', 'Medium', 'Low')),
  sectors         TEXT[] DEFAULT '{}',
  language        TEXT NOT NULL DEFAULT 'en'
                    CHECK (language IN ('en', 'sw')),
  channels        TEXT[] DEFAULT ARRAY['push'],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Alert delivery log
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_log (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,              -- push, telegram, email, sms
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'expired')),
  error           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_case_id ON alert_log (case_id);

-- ──────────────────────────────────────────────
-- Live AIS positions (72h TTL, pruned by cron)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ais_positions (
  id              BIGSERIAL PRIMARY KEY,
  mmsi            TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  course          DOUBLE PRECISION,
  speed           DOUBLE PRECISION,
  ship_name       TEXT,
  ship_type       INTEGER,
  raw             JSONB NOT NULL DEFAULT '{}',
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ais_positions_mmsi ON ais_positions (mmsi);
CREATE INDEX IF NOT EXISTS idx_ais_positions_received_at ON ais_positions (received_at);
CREATE INDEX IF NOT EXISTS idx_ais_positions_location ON ais_positions (lat, lon);

-- ──────────────────────────────────────────────
-- AIS coverage confidence grid (0.25° cells)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coverage_cells (
  id              BIGSERIAL PRIMARY KEY,
  lat_bin         DOUBLE PRECISION NOT NULL,  -- cell center lat
  lon_bin         DOUBLE PRECISION NOT NULL,  -- cell center lon
  confidence      DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lat_bin, lon_bin)
);

-- ──────────────────────────────────────────────
-- Pipeline run log
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              BIGSERIAL PRIMARY KEY,
  stage           TEXT NOT NULL,              -- detection, reasoning, alert, full
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  counts          JSONB DEFAULT '{}',
  errors          JSONB DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed'))
);

-- ──────────────────────────────────────────────
-- Validation run results
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validation_runs (
  id              BIGSERIAL PRIMARY KEY,
  params          JSONB NOT NULL DEFAULT '{}',
  metrics         JSONB NOT NULL DEFAULT '{}',
  report_md       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
