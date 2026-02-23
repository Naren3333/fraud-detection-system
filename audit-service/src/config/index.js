require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3007,
  serviceName: process.env.SERVICE_NAME || 'audit-service',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'audit_db',
    user: process.env.DB_USER || 'audit_admin',
    password: process.env.DB_PASSWORD || 'audit_password',
    max: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 2000,
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'audit-service',
    groupId: process.env.KAFKA_GROUP_ID || 'audit-group',
    sessionTimeout: parseInt(process.env.KAFKA_CONSUMER_SESSION_TIMEOUT, 10) || 30000,
    heartbeatInterval: parseInt(process.env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL, 10) || 3000,
    topics: (process.env.KAFKA_TOPICS || 'transaction.created,transaction.scored,transaction.finalised,transaction.flagged').split(','),
    retry: {
      initialRetryTime: 100,
      retries: 8,
      multiplier: 2,
      maxRetryTime: 30000,
    },
  },

  audit: {
    enableHashVerification: process.env.ENABLE_HASH_VERIFICATION !== 'false',
    retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS, 10) || 2555,
    enableChainValidation: process.env.ENABLE_CHAIN_VALIDATION !== 'false',
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT, 10) || 9097,
    prefix: 'audit',
  },
};