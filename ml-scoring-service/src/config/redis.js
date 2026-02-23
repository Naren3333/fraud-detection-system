const redis = require('redis');
const config = require('./index');
const logger = require('./logger');

let client = null;
let isConnecting = false;

// Handles create client.
const createClient = async () => {
  if (client?.isReady) return client;
  if (isConnecting) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return client;
  }

  isConnecting = true;

  const redisConfig = {
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: config.redis.connectTimeout,
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          logger.error('Redis max reconnection attempts reached', { retries });
          return new Error('Max reconnection attempts reached');
        }
        const delay = Math.min(500 * Math.pow(2, retries), 10000);
        logger.warn('Redis reconnecting', { attempt: retries + 1, delayMs: delay });
        return delay;
      },
    },
    ...(config.redis.password && { password: config.redis.password }),
    database: config.redis.db,
  };

  client = redis.createClient(redisConfig);

  client.on('error', (err) => {
    logger.error('Redis client error', { error: err.message, code: err.code });
  });

  client.on('connect', () => {
    logger.info('Redis connecting...');
  });

  client.on('ready', () => {
    isConnecting = false;
    logger.info('Redis ready', {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
    });
  });

  client.on('end', () => {
    logger.warn('Redis connection ended');
  });

  try {
    await client.connect();
  } catch (err) {
    isConnecting = false;
    logger.error('Redis initial connection failed', { error: err.message });
    throw err;
  }

  return client;
};

// Handles get client.
const getClient = () => {
  if (!client?.isReady) {
    throw new Error('Redis client not initialized or not ready');
  }
  return client;
};

// Handles close client.
const closeClient = async () => {
  if (client) {
    try {
      await client.quit();
      logger.info('Redis connection closed gracefully');
    } catch (err) {
      logger.error('Error closing Redis connection', { error: err.message });
      client.disconnect();
    } finally {
      client = null;
      isConnecting = false;
    }
  }
};

module.exports = { createClient, getClient, closeClient };