require('express-async-errors');
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const config = require('./config');
const logger = require('./config/logger');
const { createPool, closePool } = require('./db/pool');
const { createClient: createRedisClient, closeClient: closeRedisClient } = require('./config/redis');
const requestContext = require('./middleware/requestContext');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(config.cors));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContext);

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received - starting graceful shutdown`);

  try {
    await new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    await closeRedisClient();
    await closePool();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  // Ignore Redis "client is closed" errors that fire during shutdown teardown
  if (reason?.message === 'The client is closed') return;

  logger.error('Unhandled rejection', { reason: String(reason) });
  shutdown('unhandledRejection');
});

const bootstrap = async () => {
  try {
    logger.info('Bootstrapping User Service...');

    createPool();
    logger.info('PostgreSQL pool initialised');

    await createRedisClient();
    logger.info('Redis connected');

    server = app.listen(config.port, () => {
      logger.info(`User Service listening on port ${config.port}`, {
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