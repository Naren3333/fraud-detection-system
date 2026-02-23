const redis = require('redis');
const config = require('./index');
const logger = require('./logger');

let client = null;

// Handles create client.
const createClient = async () => {
  if (client) return client;

  client = redis.createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
    database: config.redis.db,
  });

  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('connect', () => logger.info('Redis connected'));
  client.on('ready', () => logger.info('Redis ready'));

  await client.connect();
  return client;
};

// Handles get client.
const getClient = () => {
  if (!client) throw new Error('Redis client not initialized');
  return client;
};

// Handles close client.
const closeClient = async () => {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis connection closed');
  }
};

module.exports = { createClient, getClient, closeClient };