const express = require('express');
const { getPool } = require('../db/pool');

const router = express.Router();

router.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'alive', service: 'human-verification-service' });
});

router.get('/health', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.status(200).json({
      status: 'healthy',
      service: 'human-verification-service',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'human-verification-service',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
