require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3008,
  serviceName: process.env.SERVICE_NAME || 'analytics-service',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'decision_db',
    user: process.env.DB_USER || 'decision_admin',
    password: process.env.DB_PASSWORD || 'decision_password',
    max: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 10,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 2000,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    db: parseInt(process.env.REDIS_DB, 10) || 5,
    password: process.env.REDIS_PASSWORD || undefined,
    connectTimeout: 10000,
    commandTimeout: 3000,
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'analytics-service',
    groupId: process.env.KAFKA_GROUP_ID || 'analytics-group',
    enableConsumer: process.env.KAFKA_ENABLE_CONSUMER === 'true',
    topics: (process.env.KAFKA_TOPICS || 'transaction.finalised,transaction.flagged').split(','),
  },

  analytics: {
    retentionHours: parseInt(process.env.METRICS_RETENTION_HOURS, 10) || 168, // 7 days
    aggregationIntervalSeconds: parseInt(process.env.METRICS_AGGREGATION_INTERVAL_SECONDS, 10) || 60,
    enableRealTimeUpdates: process.env.ENABLE_REAL_TIME_UPDATES !== 'false',
  },

  websocket: {
    enabled: process.env.WS_ENABLED !== 'false',
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 30000,
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT, 10) || 9098,
    prefix: 'analytics',
  },
};
