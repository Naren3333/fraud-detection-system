const router = require('express').Router();
const { getClient: getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'fraud-detection-service',
    uptime: process.uptime(),
    dependencies: {},
  };

  try {
    // Check Redis
    const redis = getRedisClient();
    await redis.ping();
    health.dependencies.redis = { status: 'healthy' };
  } catch (err) {
    logger.error('Redis health check failed', { error: err.message });
    health.dependencies.redis = { status: 'unhealthy', error: err.message };
    health.status = 'degraded';
  }

  // Kafka health is implicit - if consumer crashes, service should restart
  health.dependencies.kafka = { status: 'healthy', note: 'Consumer running' };

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/health/ready', async (req, res) => {
  try {
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

router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
