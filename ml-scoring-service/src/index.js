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
const { correlationId } = require('./middleware/correlationId');
const { requestLogger } = require('./middleware/requestLogger');
const { AppError } = require('./utils/errors');
const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);

// Security & Performance
app.use(helmet());
app.use(cors(config.cors));
app.use(compression());

// Parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

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

  if (err instanceof AppError) {
    let body = err.message;
    try {
      body = JSON.parse(err.message);
    } catch {}

    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      error: body,
      correlationId: req.correlationId,
      timestamp: err.timestamp,
    });
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
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

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP server closed');
  }

  try {
    await closeRedisClient();
    logger.info('Redis connection closed');
  } catch (err) {
    logger.error('Error closing Redis', { error: err.message });
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

// Handles force exit timer.
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
    logger.info('Bootstrapping ML Scoring Service', {
      env: config.env,
      version: config.serviceVersion,
      modelVersion: config.model.version,
      node: process.version,
      pid: process.pid,
    });

    // Redis (for caching)
    await createRedisClient();
    logger.info('Redis initialized');

    // HTTP server
    server = app.listen(config.port, () => {
      logger.info('ML Scoring Service listening', {
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

