require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3011,
  serviceName: process.env.SERVICE_NAME || 'appeal-service',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'appeal_db',
    user: process.env.DB_USER || 'appeal_admin',
    password: process.env.DB_PASSWORD || 'appeal_password',
    max: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 2000,
  },

  transactionServiceUrl: process.env.TRANSACTION_SERVICE_URL || 'http://transaction-service:3001',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'appeal-service',
    sessionTimeout: parseInt(process.env.KAFKA_CONSUMER_SESSION_TIMEOUT, 10) || 30000,
    heartbeatInterval: parseInt(process.env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL, 10) || 3000,
    outputTopicCreated: process.env.KAFKA_OUTPUT_TOPIC_APPEAL_CREATED || 'appeal.created',
    outputTopicResolved: process.env.KAFKA_OUTPUT_TOPIC_APPEAL_RESOLVED || 'appeal.resolved',
    dlqTopic: process.env.KAFKA_DLQ_TOPIC || 'appeal.dlq',
    retry: {
      initialRetryTime: 100,
      retries: 8,
      multiplier: 2,
      maxRetryTime: 30000,
    },
  },
};
