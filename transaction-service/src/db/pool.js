const { Pool } = require('pg');
const config   = require('../config');
const logger   = require('../config/logger');

let pool = null;

// Handles create pool.
const createPool = () => {
  if (pool) return pool;
  pool = new Pool({
    host : config.db.host,
    port : config.db.port,
    database : config.db.database,
    user : config.db.user,
    password : config.db.password,
    min : config.db.pool.min,
    max : config.db.pool.max,
    idleTimeoutMillis : 30000,
    connectionTimeoutMillis : 5000,
  });
  pool.on('error', (err) => logger.error('Idle DB client error', { error: err.message }));
  logger.info('PostgreSQL pool created');
  return pool;
};

// Handles get pool.
const getPool = () => {
  if (!pool) throw new Error('DB pool not initialised');
  return pool;
};

// Handles close pool.
const closePool = async () => {
  if (pool) { await pool.end(); pool = null; logger.info('DB pool closed'); }
};

// Handles query.
const query = async (text, params) => {
  const client = await getPool().connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
};

// Handles with transaction.
const withTransaction = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { createPool, getPool, closePool, query, withTransaction };