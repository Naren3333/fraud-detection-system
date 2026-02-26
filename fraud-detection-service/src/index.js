require('express-async-errors');
require('dotenv').config();
require('./config/tracing');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const swaggerSpec = require('./config/swagger');
const logger = require('./config/logger');
const { createClient: createRedisClient, closeClient: closeRedisClient } = require('./config/redis');
const transactionConsumer = require('./consumers/transactionConsumer');
const routes = require('./routes');
const { correlationId } = require('./middleware/correlationId');
const { requestLogger } = require('./middleware/requestLogger');

// Express App
console.log("SERVICE STARTING");


const app = express();

app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors());

// Performance
app.use(compression());

// Parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Observability
app.use(correlationId);
app.use(requestLogger);

// Routes
app.use('/api/v1', routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `${req.method} ${req.path} not found`,
    correlationId: req.correlationId,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack,
  });

  res.status(err.status || 500).json({
    success: false,
    error: config.env === 'production' ? 'Internal server error' : err.message,
    correlationId: req.correlationId,
  });
});

// Graceful Shutdown

let server;
let isShuttingDown = false;

// Handles shutdown.
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received - starting graceful shutdown`);

  // 1. Stop accepting new HTTP connections
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP server closed');
  }

  // 2. Stop Kafka consumer (completes in-flight messages first)
  try {
    await transactionConsumer.stop();
    logger.info('Kafka consumer stopped');
  } catch (err) {
    logger.error('Error stopping Kafka consumer', { error: err.message });
  }

  // 3. Close Redis
  try {
    await closeRedisClient();
    logger.info('Redis connection closed');
  } catch (err) {
    logger.error('Error closing Redis', { error: err.message });
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

// Allow 30 seconds for graceful shutdown before forcing exit
const forceExitTimer = (signal) => {
  setTimeout(() => {
    logger.error(`Forced exit after 30s shutdown timeout (signal: ${signal})`);
    process.exit(1);
  }, 30000).unref();
};

process.on('SIGTERM', () => { forceExitTimer('SIGTERM'); shutdown('SIGTERM'); });
process.on('SIGINT', () => { forceExitTimer('SIGINT'); shutdown('SIGINT'); });

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  shutdown('unhandledRejection');
});

// Bootstrap

const bootstrap = async () => {
  try {
    logger.info('Bootstrapping Fraud Detection Service', {
      env: config.env,
      version: config.serviceVersion,
      node: process.version,
      pid: process.pid,
    });

    // 1. Redis
    await createRedisClient();
    logger.info('Redis initialised');

    // 2. Kafka
    await transactionConsumer.start();
    logger.info('Kafka consumer started');

    // 3. HTTP server (last - only open to traffic when fully ready)
    server = app.listen(config.port, () => {
      logger.info('Fraud Detection Service listening', {
        port: config.port,
        env: config.env,
      });
    });

    server.on('error', (err) => {
      logger.error('HTTP server error', { error: err.message });
      process.exit(1);
    });

    logger.info('Bootstrap complete - service is ready');
  } catch (err) {
    logger.error('Bootstrap failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

bootstrap();

module.exports = app;

