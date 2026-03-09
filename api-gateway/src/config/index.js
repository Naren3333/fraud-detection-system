require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  serviceName: process.env.SERVICE_NAME || 'api-gateway',
  logLevel: process.env.LOG_LEVEL || 'info',

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: process.env.JWT_ISSUER || 'fraud-detection-platform',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
  },
  transactionRateLimit: {
    windowMs: parseInt(process.env.TXN_RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.TXN_RATE_LIMIT_MAX_PER_CUSTOMER, 10) || 30,
    keyPrefix: process.env.TXN_RATE_LIMIT_KEY_PREFIX || 'txn:customer:',
  },

  services: {
    user: process.env.USER_SERVICE_URL || 'http://user-service:3002',
    transaction: process.env.TRANSACTION_SERVICE_URL || 'http://transaction-service:3001',
    decisionEngine: process.env.DECISION_ENGINE_SERVICE_URL || 'http://decision-engine-service:3005',
    mlScoring: process.env.ML_SCORING_SERVICE_URL || 'http://ml-scoring-service:3004',
    audit: process.env.AUDIT_SERVICE_URL || 'http://audit-service:3007',
    analytics: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3008',
    humanVerification: process.env.HUMAN_VERIFICATION_SERVICE_URL || 'http://human-verification-service:3010',
    appeal: process.env.APPEAL_SERVICE_URL || 'http://appeal-service:3011',
  },

  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT, 10) || 3000,
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD, 10) || 50,
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 10) || 30000,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  proxy: {
    timeout: parseInt(process.env.PROXY_TIMEOUT, 10) || 30000,
    retryAttempts: parseInt(process.env.PROXY_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.PROXY_RETRY_DELAY, 10) || 1000,
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    port: parseInt(process.env.METRICS_PORT, 10) || 9090,
  },

  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
  },
};
