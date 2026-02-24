'use strict';

const express = require('express');
const axios   = require('axios');
const config  = require('../config');
const logger  = require('../config/logger');
const { authenticate }                     = require('../middleware/auth');
const { transactionLimiter, standardLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
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
    pathPrefix:           '/decisions',
    target:               config.services.decisionEngine,
    serviceName:          'decision-engine-service',
    useTransactionLimiter: false,
    rewriteTo:            '/api/v1/decisions',
  },
  {
    pathPrefix:           '/thresholds',
    target:               config.services.decisionEngine,
    serviceName:          'decision-engine-service',
    useTransactionLimiter: false,
    rewriteTo:            '/api/v1/thresholds',
  },
  {
    pathPrefix:           '/analytics',
    target:               config.services.analytics,
    serviceName:          'analytics-service',
    useTransactionLimiter: false,
    rewriteTo:            '/api/v1/analytics',
  },
  {
    pathPrefix:           '/reviews',
    target:               config.services.humanVerification,
    serviceName:          'human-verification-service',
    useTransactionLimiter: false,
    rewriteTo:            '/api/v1/reviews',
  },
];
// Handles make proxy handler.
const makeProxyHandler = (target, serviceName, rewriteTo, pathPrefix) => {
  return async (req, res, next) => {
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
          'Authorization':     req.headers.authorization || '',
          'X-Request-ID':      req.requestId    || '',
          'X-Correlation-ID':  req.correlationId || '',
          'X-User-ID':         req.user?.userId  || '',
          'X-User-Role':       req.user?.role    || '',
          'X-Idempotency-Key': req.idempotencyKey || '',
          'X-Forwarded-For':   req.ip || '',
        },
        timeout:        config.proxy.timeout || 30000,
        validateStatus: () => true,
        maxRedirects:   0,
      });

      const duration = Date.now() - startTime;
      logger.debug('Proxy response received', {
        requestId:  req.requestId,
        statusCode: response.status,
        serviceName,
        durationMs: duration,
      });
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
serviceRoutes.forEach(({ pathPrefix, target, serviceName, useTransactionLimiter: useTxnLimiter, rewriteTo }) => {
  const rateLimiter  = useTxnLimiter ? transactionLimiter : standardLimiter;
  const handler      = makeProxyHandler(target, serviceName, rewriteTo, pathPrefix);
  router.use(pathPrefix, authenticate, rateLimiter, handler);

  logger.info(`Proxy registered: ${pathPrefix} → ${target}${rewriteTo}`);
});

module.exports = router;
