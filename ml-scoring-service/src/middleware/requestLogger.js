const logger = require('../config/logger');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      correlationId: req.correlationId,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });

  next();
};

module.exports = { requestLogger };
