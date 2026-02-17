const express = require('express');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    dependencies: {},
  };

  try {
    // Check Redis connection
    const redisClient = getRedisClient();
    await redisClient.ping();
    health.dependencies.redis = { status: 'healthy' };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    health.dependencies.redis = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/health/ready', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.ping();
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;