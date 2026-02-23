const router = require('express').Router();
const { query } = require('../db/pool');
const logger = require('../config/logger');

// Handles GET /health.
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'audit-service',
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
  health.dependencies.kafka = {
    status: 'healthy',
    note: 'Consumer crash triggers process restart',
  };

  health.status = degraded ? 'degraded' : 'healthy';
  res.status(degraded ? 503 : 200).json(health);
});

// Handles GET /health/live.
router.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;