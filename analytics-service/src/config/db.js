const { Pool } = require('pg');
const config = require('../config');
const logger = require('../config/logger');

let pool = null;
let appealPool = null;

// Handles create pool.
const createPool = () => {
  if (pool) return { decisionPool: pool, appealPool };

  pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: config.db.max,
    idleTimeoutMillis: config.db.idleTimeoutMillis,
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  });

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool error', { error: err.message });
  });

  pool.on('connect', () => {
    logger.debug('New PostgreSQL client connected');
  });

  logger.info('PostgreSQL pool created');

  if (config.appealDb.enabled) {
    appealPool = new Pool({
      host: config.appealDb.host,
      port: config.appealDb.port,
      database: config.appealDb.database,
      user: config.appealDb.user,
      password: config.appealDb.password,
      max: config.appealDb.max,
      idleTimeoutMillis: config.appealDb.idleTimeoutMillis,
      connectionTimeoutMillis: config.appealDb.connectionTimeoutMillis,
    });

    appealPool.on('error', (err) => {
      logger.error('Appeal PostgreSQL pool error', { error: err.message });
    });

    appealPool.on('connect', () => {
      logger.debug('New appeal PostgreSQL client connected');
    });

    logger.info('Appeal PostgreSQL pool created');
  }

  return { decisionPool: pool, appealPool };
};

// Handles query.
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Query failed', { error: err.message, query: text });
    throw err;
  }
};

// Handles appeal query.
const queryAppeal = async (text, params) => {
  if (!appealPool) {
    throw new Error('Appeal DB pool is not initialized');
  }

  const start = Date.now();
  try {
    const res = await appealPool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Appeal query executed', { duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Appeal query failed', { error: err.message, query: text });
    throw err;
  }
};

// Handles get client.
const getClient = async () => {
  return pool.connect();
};

// Handles close pool.
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('DB pool closed');
  }

  if (appealPool) {
    await appealPool.end();
    appealPool = null;
    logger.info('Appeal DB pool closed');
  }
};

module.exports = { createPool, query, queryAppeal, getClient, closePool };
