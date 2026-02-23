const redis = require('redis');
const config = require('./index');
const logger = require('./logger');

let redisClient = null;

// Handles create redis client.
const createRedisClient = async () => {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = redis.createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        connectTimeout: config.redis.connectTimeout,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected successfully');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting');
    });

    await redisClient.connect();
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to create Redis client:', error);
    throw error;
  }
};

// Handles get redis client.
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient first.');
  }
  return redisClient;
};

// Handles close redis connection.
const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  closeRedisConnection,
};