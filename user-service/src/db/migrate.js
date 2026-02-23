require('dotenv').config();
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../config/logger');

// Handles run migrations.
const runMigrations = async () => {
  logger.info('Running database migrations...');

  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(255) UNIQUE NOT NULL,
        password_hash   TEXT NOT NULL,
        first_name      VARCHAR(100),
        last_name       VARCHAR(100),
        role            VARCHAR(50) NOT NULL DEFAULT 'user',
        status          VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        phone           VARCHAR(20),
        email_verified  BOOLEAN DEFAULT FALSE,
        phone_verified  BOOLEAN DEFAULT FALSE,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at   TIMESTAMPTZ
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id              BIGSERIAL PRIMARY KEY,
        email           VARCHAR(255) NOT NULL,
        ip_address      VARCHAR(50),
        success         BOOLEAN NOT NULL,
        attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_agent      TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        token_hash      TEXT NOT NULL,
        expires_at      TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at      TIMESTAMPTZ,
        ip_address      VARCHAR(50),
        user_agent      TEXT
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);');

    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error('Migration failed', { error: err.message, stack: err.stack });
    throw err;
  } finally {
    await pool.end();
    logger.info('DB pool closed');
  }
};
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = runMigrations;