const { v4: uuidv4 } = require('uuid');

/**
 * Attaches a correlation ID to every incoming HTTP request.
 * Reads from X-Correlation-ID header if present, otherwise generates a new UUID.
 * The ID is written back to the response header for tracing.
 */
const correlationId = (req, res, next) => {
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.set('X-Correlation-ID', id);
  next();
};

module.exports = { correlationId };