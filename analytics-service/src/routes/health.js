const router = require('express').Router();
const { query } = require('../config/db');
const { getClient } = require('../config/redis');
const logger = require('../config/logger');

// Handles GET /health.
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'analytics-service',
    uptime: Math.floor(process.uptime()),
    dependencies: {},
  };

  let degraded = false;
  try {
    await query('SELECT 1');
    health.dependencies.database = { status: 'healthy' };
  } catch (err) {
    health.dependencies.database = { status: 'unhealthy', error: err.message };
    degraded = true;
  }
  try {
    const redis = getClient();
    await redis.ping();
    health.dependencies.redis = { status: 'healthy' };
  } catch (err) {
    health.dependencies.redis = { status: 'unhealthy', error: err.message };
    degraded = true;
  }

  health.status = degraded ? 'degraded' : 'healthy';
  res.status(degraded ? 503 : 200).json(health);
});

// Handles GET /health/live.
router.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;