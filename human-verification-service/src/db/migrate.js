const { createPool, closePool } = require('./pool');
const logger = require('../config/logger');

// Handles migrate.
const migrate = async () => {
  const pool = createPool();
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS manual_reviews (
        review_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id      UUID UNIQUE NOT NULL,
        customer_id         VARCHAR(255) NOT NULL,
        merchant_id         VARCHAR(255),
        source_topic        VARCHAR(100) NOT NULL DEFAULT 'transaction.flagged',
        queue_status        VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                          CHECK (queue_status IN ('PENDING','REVIEWED')),
        previous_decision   VARCHAR(50) NOT NULL DEFAULT 'FLAGGED',
        final_decision      VARCHAR(50)
                          CHECK (final_decision IN ('APPROVED','DECLINED','FLAGGED')),
        decision_reason     TEXT,
        risk_score          NUMERIC(5,2),
        payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
        reviewed_by         VARCHAR(255),
        review_notes        TEXT,
        correlation_id      VARCHAR(255),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at         TIMESTAMPTZ,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_manual_reviews_queue_status
      ON manual_reviews (queue_status, created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_manual_reviews_customer_id
      ON manual_reviews (customer_id, created_at DESC);
    `);

    logger.info('Manual review schema migration complete');
  } finally {
    await closePool();
  }
};

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', { error: err.message, stack: err.stack });
    process.exit(1);
  });
