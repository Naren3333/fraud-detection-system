const router = require('express').Router();
const { getClient: getRedisClient } = require('../config/redis');
const mlScoringClient = require('../services/mlScoringClient');
const logger = require('../config/logger');
// Handles GET /health.
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'fraud-detection-service',
    uptime: Math.floor(process.uptime()),
    uptimeHuman: formatUptime(process.uptime()),
    memory: formatMemory(process.memoryUsage()),
    pid: process.pid,
    nodeVersion: process.version,
    dependencies: {},
  };

  let degraded = false;
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    health.dependencies.redis = {
      status: pong === 'PONG' ? 'healthy' : 'unhealthy',
    };
    if (pong !== 'PONG') degraded = true;
  } catch (err) {
    logger.error('Redis health check failed', { error: err.message });
    health.dependencies.redis = { status: 'unhealthy', error: err.message };
    degraded = true;
  }
  try {
    const cbStats = mlScoringClient.getCircuitBreakerStats();
    health.dependencies.mlScoringService = {
      status: cbStats.state === 'CLOSED' ? 'healthy' : 'degraded',
      circuitBreaker: cbStats,
    };
    if (cbStats.state === 'OPEN') degraded = true;
  } catch (err) {
    health.dependencies.mlScoringService = { status: 'unknown', error: err.message };
  }
  health.dependencies.kafka = {
    status: 'healthy',
    note: 'Consumer crash triggers process restart via uncaughtException handler',
  };

  health.status = degraded ? 'degraded' : 'healthy';
  res.status(degraded ? 503 : 200).json(health);
});
// Handles GET /health/ready.
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
// Handles GET /health/live.
router.get('/health/live', (_req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
});


// Handles format uptime.
const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
};

// Handles format memory.
const formatMemory = (mem) => ({
  rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
  heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
  heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`,
  external: `${(mem.external / 1024 / 1024).toFixed(1)}MB`,
});

module.exports = router;