require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3010,
  serviceName: process.env.SERVICE_NAME || 'human-verification-service',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',
  enableBrowserIsolation: process.env.ENABLE_BROWSER_ISOLATION === 'true',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'human_review_db',
    user: process.env.DB_USER || 'review_admin',
    password: process.env.DB_PASSWORD || 'review_password',
    max: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 2000,
  },
  appealService: {
    baseUrl: process.env.APPEAL_SERVICE_URL || 'http://appeal-service:3011',
    timeoutMs: parseInt(process.env.APPEAL_SERVICE_TIMEOUT_MS, 10) || 4000,
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'human-verification-service',
    groupId: process.env.KAFKA_GROUP_ID || 'human-verification-group',
    sessionTimeout: parseInt(process.env.KAFKA_CONSUMER_SESSION_TIMEOUT, 10) || 30000,
    heartbeatInterval: parseInt(process.env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL, 10) || 3000,
    inputTopicFlagged: process.env.KAFKA_INPUT_TOPIC_FLAGGED || 'transaction.flagged',
    outputTopicReviewed: process.env.KAFKA_OUTPUT_TOPIC_REVIEWED || 'transaction.reviewed',
    dlqTopic: process.env.KAFKA_DLQ_TOPIC || 'transaction.review.dlq',
    retry: {
      initialRetryTime: 100,
      retries: 8,
      multiplier: 2,
      maxRetryTime: 30000,
    },
  },
};
