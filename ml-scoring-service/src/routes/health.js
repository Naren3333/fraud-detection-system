const router = require('express').Router();
const { getClient: getRedisClient } = require('../config/redis');
const fraudModel = require('../models/fraudModel');
const mlScoringService = require('../services/mlScoringService');
const logger = require('../config/logger');

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ml-scoring-service',
    uptime: Math.floor(process.uptime()),
    uptimeHuman: formatUptime(process.uptime()),
    memory: formatMemory(process.memoryUsage()),
    pid: process.pid,
    nodeVersion: process.version,
    dependencies: {},
  };

  let degraded = false;

  // Redis cache
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

  // ML model
  try {
    const modelMetadata = fraudModel.getMetadata();
    health.dependencies.mlModel = {
      status: modelMetadata.isLoaded ? 'healthy' : 'unhealthy',
      version: modelMetadata.modelVersion,
      featureCount: modelMetadata.featureCount,
    };
    if (!modelMetadata.isLoaded) degraded = true;
  } catch (err) {
    health.dependencies.mlModel = { status: 'unhealthy', error: err.message };
    degraded = true;
  }

  // Service stats
  health.stats = mlScoringService.getStats();

  health.status = degraded ? 'degraded' : 'healthy';
  res.status(degraded ? 503 : 200).json(health);
});

router.get('/health/ready', async (req, res) => {
  try {
    const redis = getRedisClient();
    await redis.ping();

    if (!fraudModel.isLoaded) {
      throw new Error('Model not loaded');
    }

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

router.get('/health/live', (_req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
});

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
};

const formatMemory = (mem) => ({
  rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
  heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
  heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`,
  external: `${(mem.external / 1024 / 1024).toFixed(1)}MB`,
});

module.exports = router;
