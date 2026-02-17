-- ─── Transaction Service Database Schema ──────────────────────────────────────
-- Run via: node src/db/migrate.js
-- Each service owns its own DB. Nothing else touches this schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Core transactions table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     VARCHAR(255) NOT NULL,
  merchant_id     VARCHAR(255) NOT NULL,
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency        CHAR(3)      NOT NULL DEFAULT 'USD',

  -- Payment info (card_number is masked/hashed before storage - never raw PAN)
  card_number     VARCHAR(255),
  card_last_four  CHAR(4),
  card_type       VARCHAR(50),

  -- Device & network signals for ML feature engineering
  device_id       VARCHAR(255),
  ip_address      VARCHAR(45),
  user_agent      TEXT,

  -- Structured location data  { country, city, lat, lng }
  location        JSONB        DEFAULT '{}',

  -- Arbitrary extensible fields (merchant category, channel, etc.)
  metadata        JSONB        DEFAULT '{}',

  -- Lifecycle status
  status          VARCHAR(50)  NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','APPROVED','REJECTED','FLAGGED','REVERSED','ERROR')),

  -- Distributed tracing
  idempotency_key VARCHAR(255) UNIQUE,
  correlation_id  VARCHAR(255),
  request_id      VARCHAR(255),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_txn_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_merchant_id ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_txn_status      ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_created_at  ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_correlation ON transactions(correlation_id);

-- Idempotency table
-- Stores request fingerprints so duplicate POSTs return the same response
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key            VARCHAR(255) PRIMARY KEY,
  transaction_id UUID         REFERENCES transactions(id) ON DELETE CASCADE,
  status_code    INT          NOT NULL,
  response_body  JSONB        NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- Outbox table (Transactional Outbox Pattern)
-- Kafka events are written here atomically with the transaction INSERT.
-- A background worker reads and publishes them, guaranteeing at-least-once delivery.
CREATE TABLE IF NOT EXISTS outbox_events (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID         REFERENCES transactions(id) ON DELETE CASCADE,
  topic          VARCHAR(255) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  payload        JSONB        NOT NULL,
  partition_key  VARCHAR(255),          -- customerId → ordering per customer
  status         VARCHAR(50)  NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','PUBLISHED','FAILED')),
  attempts       INT          NOT NULL DEFAULT 0,
  last_error     TEXT,
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_txn_updated ON transactions;
CREATE TRIGGER trg_txn_updated
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Useful views
CREATE OR REPLACE VIEW transaction_stats AS
SELECT
  DATE(created_at) AS date,
  status,
  COUNT(*)         AS count,
  SUM(amount)      AS total_amount,
  AVG(amount)      AS avg_amount
FROM transactions
GROUP BY DATE(created_at), status;

CREATE OR REPLACE VIEW customer_summary AS
SELECT
  customer_id,
  COUNT(*)                                              AS total_txns,
  SUM(amount)                                           AS total_amount,
  MAX(created_at)                                       AS last_txn_at,
  COUNT(*) FILTER (WHERE status = 'APPROVED')           AS approved,
  COUNT(*) FILTER (WHERE status = 'REJECTED')           AS rejected,
  COUNT(*) FILTER (WHERE status = 'FLAGGED')            AS flagged
FROM transactions
GROUP BY customer_id;