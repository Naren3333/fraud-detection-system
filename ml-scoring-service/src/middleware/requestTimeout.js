const config = require('../config');
const logger = require('../config/logger');


// Handles request timeout.
const requestTimeout = (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      logger.warn('Request timeout', {
        method: req.method,
        path: req.path,
        correlationId: req.correlationId,
        timeoutMs: config.performance.requestTimeout,
      });

      res.status(504).json({
        success: false,
        error: 'Request timeout - inference took too long',
        timeoutMs: config.performance.requestTimeout,
        correlationId: req.correlationId,
      });
    }
  }, config.performance.requestTimeout);

  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));

  next();
};

module.exports = { requestTimeout };