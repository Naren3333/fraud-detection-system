'use strict';

const express = require('express');
const axios   = require('axios');
const config  = require('../config');
const logger  = require('../config/logger');
const { authenticate }                     = require('../middleware/auth');
const { transactionLimiter, standardLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ─── Service route definitions ────────────────────────────────────────────────
const serviceRoutes = [
  {
    pathPrefix:           '/transactions',
    target:               config.services.transaction,
    serviceName:          'transaction-service',
    useTransactionLimiter: true,
    rewriteTo:            '/api/v1/transactions',
  },
  {
    pathPrefix:           '/audit',
    target:               config.services.audit,
    serviceName:          'audit-service',
    useTransactionLimiter: false,
    rewriteTo:            '/api/v1/audit',
  },
  {
    pathPrefix:           '/analytics',
    target:               config.services.analytics,
    serviceName:          'analytics-service',
    useTransactionLimiter: false,
    rewriteTo:            '/api/v1/analytics',
  },
];

// ─── Build a direct-proxy handler (no http-proxy-middleware) ──────────────────
// express.json() already parsed req.body, so we forward it ourselves via axios.
// This avoids the raw-body / ECONNRESET timing issue with stream-based proxies.
const makeProxyHandler = (target, serviceName, rewriteTo, pathPrefix) => {
  return async (req, res, next) => {
    // Build the downstream URL:
    //   req.path inside the sub-router is already stripped of pathPrefix
    //   e.g. POST /transactions/  →  req.path = '/'
    const subPath    = req.path === '/' ? '' : req.path;
    const targetUrl  = `${target}${rewriteTo}${subPath}`;

    const startTime = Date.now();
    logger.debug('Proxying request', {
      requestId:  req.requestId,
      method:     req.method,
      targetUrl,
      serviceName,
    });

    try {
      const response = await axios({
        method:  req.method,
        url:     targetUrl,
        params:  req.query,
        data:    ['GET', 'HEAD', 'DELETE'].includes(req.method.toUpperCase()) ? undefined : req.body,
        headers: {
          'Content-Type':      'application/json',
          'X-Request-ID':      req.requestId    || '',
          'X-Correlation-ID':  req.correlationId || '',
          'X-User-ID':         req.user?.userId  || '',
          'X-User-Role':       req.user?.role    || '',
          'X-Idempotency-Key': req.idempotencyKey || '',
          'X-Forwarded-For':   req.ip || '',
        },
        timeout:        config.proxy.timeout || 30000,
        validateStatus: () => true,   // let all statuses through
        maxRedirects:   0,
      });

      const duration = Date.now() - startTime;
      logger.debug('Proxy response received', {
        requestId:  req.requestId,
        statusCode: response.status,
        serviceName,
        durationMs: duration,
      });

      // Forward the status + body from the downstream service
      res.status(response.status).json(response.data);

    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error('Proxy request failed', {
        requestId:  req.requestId,
        error:      err.message,
        code:       err.code,
        serviceName,
        targetUrl,
        durationMs: duration,
      });

      if (res.headersSent) return;

      // ECONNREFUSED / ENOTFOUND → service down
      // ECONNABORTED / ETIMEDOUT → timeout
      const status = (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') ? 504 : 503;
      res.status(status).json({
        success: false,
        error: {
          message:    `Service ${serviceName} is currently unavailable`,
          statusCode: status,
          timestamp:  new Date().toISOString(),
          requestId:  req.requestId,
        },
      });
    }
  };
};

// ─── Register routes ──────────────────────────────────────────────────────────
serviceRoutes.forEach(({ pathPrefix, target, serviceName, useTransactionLimiter: useTxnLimiter, rewriteTo }) => {
  const rateLimiter  = useTxnLimiter ? transactionLimiter : standardLimiter;
  const handler      = makeProxyHandler(target, serviceName, rewriteTo, pathPrefix);

  // Matches /transactions, /transactions/, /transactions/abc, etc.
  router.use(pathPrefix, authenticate, rateLimiter, handler);

  logger.info(`Proxy registered: ${pathPrefix} → ${target}${rewriteTo}`);
});

module.exports = router;