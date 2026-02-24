const logger = require('../config/logger');

const errorHandler = (err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: `${req.method} ${req.path} not found`,
  });
};

module.exports = { errorHandler, notFoundHandler };
