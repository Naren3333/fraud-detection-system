const logger      = require('../config/logger');
const { AppError } = require('../utils/errors');

// Handles error handler.
const errorHandler = (err, req, res, next) => {
  logger.error('Request error', {
    requestId: req.requestId, method: req.method, path: req.path,
    code: err.code, message: err.message,
    stack: err instanceof AppError ? undefined : err.stack,
  });

  if (err instanceof AppError) {
    let body = err.message;
    try { body = JSON.parse(err.message); } catch {}
    return res.status(err.statusCode).json({
      success: false, code: err.code, error: body,
      requestId: req.requestId, correlationId: req.correlationId,
      timestamp: err.timestamp,
    });
  }

  res.status(500).json({
    success: false, code: 'INTERNAL_ERROR',
    error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    requestId: req.requestId, timestamp: new Date().toISOString(),
  });
};

// Handles not found handler.
const notFoundHandler = (req, res) =>
  res.status(404).json({ success: false, code: 'NOT_FOUND',
    error: `${req.method} ${req.path} not found`, requestId: req.requestId });

module.exports = { errorHandler, notFoundHandler };