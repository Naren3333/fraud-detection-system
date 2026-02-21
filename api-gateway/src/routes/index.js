const express = require('express');
const axios = require('axios');
const healthRoutes = require('./health');
const proxyRoutes = require('./proxy');
const MetricsService = require('../utils/metrics');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Health check routes (no auth required)
router.use(healthRoutes);

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', MetricsService.getContentType());
  res.end(await MetricsService.getMetrics());
});

// Auth Routes Proxy
// All /auth/* requests are proxied to user-service:3002
// No more mock authService - real authentication via user service
router.use('/auth', authLimiter, async (req, res) => {
  const targetUrl = `http://user-service:3002/api/v1/auth${req.path}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['GET', 'HEAD', 'DELETE'].includes(req.method.toUpperCase()) ? undefined : req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
        'X-Request-ID': req.requestId || '',
        'X-Correlation-ID': req.correlationId || '',
        'X-Forwarded-For': req.ip || '',
      },
      timeout: 30000,
      validateStatus: () => true, // Pass through all status codes
    });

    res.status(response.status).json(response.data);
  } catch (err) {
    const logger = require('../config/logger');
    logger.error('Auth proxy error', {
      requestId: req.requestId,
      error: err.message,
      code: err.code,
      targetUrl,
    });

    res.status(503).json({
      success: false,
      error: {
        message: 'User service is currently unavailable',
        statusCode: 503,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  }
});

// Proxied routes (auth required for transactions, audit, analytics)
router.use(proxyRoutes);

module.exports = router;
