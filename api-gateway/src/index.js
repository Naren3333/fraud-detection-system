require('express-async-errors');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./config');
const logger = require('./config/logger');
const { createRedisClient, closeRedisConnection } = require('./config/redis');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { attachRequestMetadata } = require('./middleware/requestValidator');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom middleware
app.use(attachRequestMetadata);
app.use(requestLogger);

// Routes
app.use('/api/v1', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await closeRedisConnection();
      logger.info('All connections closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Start server
let server;

const startServer = async () => {
  try {
    // Initialize Redis connection
    await createRedisClient();
    logger.info('Redis connection established');

    // Start HTTP server
    server = app.listen(config.port, () => {
      logger.info(`API Gateway started successfully`, {
        port: config.port,
        environment: config.env,
        nodeVersion: process.version,
      });
    });

    // Start metrics server if enabled
    if (config.metrics.enabled) {
      const metricsApp = express();
      metricsApp.get('/metrics', async (req, res) => {
        const MetricsService = require('./utils/metrics');
        res.set('Content-Type', MetricsService.getContentType());
        res.end(await MetricsService.getMetrics());
      });

      metricsApp.listen(config.metrics.port, () => {
        logger.info(`Metrics server started on port ${config.metrics.port}`);
      });
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;