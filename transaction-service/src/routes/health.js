const router = require('express').Router();
const { getPool }         = require('../db/pool');
const { isProducerReady } = require('../kafka/producer');

// Handles GET /health.
router.get('/health', async (req, res) => {
  const checks = {};
  let ok = true;

  try   { await getPool().query('SELECT 1'); checks.database = { status: 'healthy' }; }
  catch (e) { checks.database = { status: 'unhealthy', error: e.message }; ok = false; }

  checks.kafka = isProducerReady()
    ? { status: 'healthy' }
    : { status: 'degraded', note: 'outbox will deliver pending events' };

  res.status(ok ? 200 : 503).json({
    status: ok ? 'healthy' : 'unhealthy',
    service: 'transaction-service', version: '1.0.0',
    uptime: process.uptime(), timestamp: new Date().toISOString(), checks,
  });
});

// Handles GET /health/live.
router.get('/health/live',  (_req, res) => res.json({ status: 'alive' }));

// Handles GET /health/ready.
router.get('/health/ready', async (_req, res) => {
  try   { await getPool().query('SELECT 1'); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not_ready' }); }
});

module.exports = router;