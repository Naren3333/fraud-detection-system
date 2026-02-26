'use strict';
require('express-async-errors');
require('dotenv').config();
require('./config/tracing');

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const swaggerUi   = require('swagger-ui-express');

const config      = require('./config');
const swaggerSpec = require('./config/swagger');
const logger      = require('./config/logger');
const { createPool, closePool } = require('./db/pool');
const { createProducer, disconnectProducer } = require('./kafka/producer');
const { startOutboxPublisher, stopOutboxPublisher } = require('./kafka/outboxPublisher');
const { start: startDecisionConsumer, stop: stopDecisionConsumer } = require('./kafka/decisionConsumer');
const requestContext = require('./middleware/requestContext');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes     = require('./routes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContext);

app.use('/api/v1', routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});

app.use(notFoundHandler);
app.use(errorHandler);

let server;

// Handles shutdown.
const shutdown = async (signal) => {
  logger.info(`${signal} received - starting graceful shutdown`);

  if (server) {
    server.close(() => logger.info('HTTP server closed'));
  }

  stopOutboxPublisher();

  try {
    await stopDecisionConsumer();
    logger.info('Decision consumer stopped');
  } catch (err) {
    logger.error('Error stopping decision consumer', { error: err.message });
  }

  await disconnectProducer();
  await closePool();
  logger.info('Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

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
  try {
    logger.info('Bootstrapping Transaction Service...');

    createPool();
    logger.info('PostgreSQL pool initialised');

    await createProducer();
    logger.info('Kafka producer connected');

    startOutboxPublisher();
    logger.info('Outbox publisher started');

    await startDecisionConsumer();
    logger.info('Decision consumer started');

    server = app.listen(config.port, () => {
      logger.info(`Transaction Service listening on port ${config.port}`, {
        env:  config.env,
        node: process.version,
      });
    });

    server.on('error', (err) => {
      logger.error('HTTP server error', { error: err.message });
      process.exit(1);
    });

  } catch (err) {
    logger.error('Bootstrap failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

bootstrap();

module.exports = app;

