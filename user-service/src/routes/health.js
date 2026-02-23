const router = require('express').Router();
const { query } = require('../db/pool');
const { getClient: getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

// Handles GET /health.
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'user-service',
    uptime: process.uptime(),
    dependencies: {},
  };

  try {
    await query('SELECT 1');
    health.dependencies.postgres = { status: 'healthy' };
  } catch (err) {
    logger.error('PostgreSQL health check failed', { error: err.message });
    health.dependencies.postgres = { status: 'unhealthy', error: err.message };
    health.status = 'degraded';
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    health.dependencies.redis = { status: 'healthy' };
  } catch (err) {
    logger.error('Redis health check failed', { error: err.message });
    health.dependencies.redis = { status: 'unhealthy', error: err.message };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Handles GET /health/ready.
router.get('/health/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    const redis = getRedisClient();
    await redis.ping();

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

// Handles GET /health/live.
router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;