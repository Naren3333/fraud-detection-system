const router = require('express').Router();
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const logger = require('../config/logger');

// Handles GET /health.
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'notification-service',
    uptime: Math.floor(process.uptime()),
    uptimeHuman: formatUptime(process.uptime()),
    memory: formatMemory(process.memoryUsage()),
    pid: process.pid,
    nodeVersion: process.version,
    dependencies: {},
  };

  let degraded = false;
  try {
    const emailHealthy = await emailService.verifyConnection();
    health.dependencies.email = {
      status: emailHealthy ? 'healthy' : 'degraded',
      enabled: true,
    };
    if (!emailHealthy) degraded = true;
  } catch (err) {
    logger.error('Email health check failed', { error: err.message });
    health.dependencies.email = { status: 'unhealthy', error: err.message };
    degraded = true;
  }
  try {
    const smsHealthy = await smsService.verifyConnection();
    health.dependencies.sms = {
      status: smsHealthy ? 'healthy' : 'degraded',
      enabled: true,
    };
    if (!smsHealthy) degraded = true;
  } catch (err) {
    logger.error('SMS health check failed', { error: err.message });
    health.dependencies.sms = { status: 'unhealthy', error: err.message };
    degraded = true;
  }
  health.dependencies.kafka = {
    status: 'healthy',
    note: 'Consumer crash triggers process restart',
  };

  health.status = degraded ? 'degraded' : 'healthy';
  res.status(degraded ? 503 : 200).json(health);
});

// Handles GET /health/ready.
router.get('/health/ready', async (req, res) => {
  try {
    const emailHealthy = await emailService.verifyConnection();
    const smsHealthy = await smsService.verifyConnection();

    if (!emailHealthy && !smsHealthy) {
      return res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: 'No notification channels available',
      });
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