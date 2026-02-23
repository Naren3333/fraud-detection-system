const { v4: uuidv4 } = require('uuid');


// Handles correlation id.
const correlationId = (req, res, next) => {
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.set('X-Correlation-ID', id);
  next();
};

module.exports = { correlationId };