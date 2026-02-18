require('express-async-errors');
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const config = require('./config');
const logger = require('./config/logger');
const { createClient: createRedisClient, closeClient: closeRedisClient } = require('./config/redis');
const transactionConsumer = require('./consumers/transactionConsumer');
const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

let server;

const shutdown = async (signal) => {
  logger.info(`${signal} received – starting graceful shutdown`);

  // Stop accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');
  });

  // Stop Kafka consumer
  try {
    await transactionConsumer.stop();
    logger.info('Kafka consumer stopped');
  } catch (err) {
    logger.error('Error stopping Kafka consumer', { error: err.message });
  }

  // Close Redis
  await closeRedisClient();

  logger.info('Graceful shutdown complete');
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

const bootstrap = async () => {
  try {
    logger.info('Bootstrapping Fraud Detection Service...');

    // Initialize Redis
    await createRedisClient();
    logger.info('Redis connected');

    // Start Kafka consumer
    await transactionConsumer.start();
    logger.info('Kafka consumer started');

    // Start HTTP server (for health checks)
    server = app.listen(config.port, () => {
      logger.info(`Fraud Detection Service listening on port ${config.port}`, {
        env: config.env,
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
