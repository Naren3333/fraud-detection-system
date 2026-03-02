'use strict';
require('express-async-errors');
require('./config/tracing');

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const swaggerSpec = require('./config/swagger');
const logger = require('./config/logger');
const { createPool, closePool } = require('./db/pool');
const { createProducer } = require('./config/kafka');
const reviewService = require('./services/reviewService');
const { start: startFlaggedConsumer, stop: stopFlaggedConsumer } = require('./consumers/flaggedConsumer');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/v1', routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});
app.use(notFoundHandler);
app.use(errorHandler);

let server = null;
let producer = null;

// Handles shutdown.
const shutdown = async (signal) => {
  logger.info(`${signal} received - shutting down`);
  if (server) {
    server.close(() => logger.info('HTTP server closed'));
  }
  try {
    await stopFlaggedConsumer();
  } catch (err) {
    logger.error('Error stopping flagged consumer', { error: err.message });
  }
  try {
    if (producer) await producer.disconnect();
  } catch (err) {
    logger.error('Error disconnecting Kafka producer', { error: err.message });
  }
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  shutdown('unhandledRejection');
});

// Handles bootstrap.
const bootstrap = async () => {
  createPool();
  producer = await createProducer();
  reviewService.setProducer(producer);
  await startFlaggedConsumer();

  server = app.listen(config.port, () => {
    logger.info(`Human Verification Service listening on port ${config.port}`, {
      env: config.env,
      node: process.version,
    });
  });
};

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap service', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app;

