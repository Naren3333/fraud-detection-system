const { v4: uuidv4 } = require('uuid');
const { HEADERS } = require('../utils/constants');

module.exports = (req, res, next) => {
  req.requestId = req.headers[HEADERS.REQUEST_ID] || uuidv4();
  req.correlationId = req.headers[HEADERS.CORRELATION_ID] || req.requestId;

  res.setHeader(HEADERS.REQUEST_ID, req.requestId);
  res.setHeader(HEADERS.CORRELATION_ID, req.correlationId);

  next();
};