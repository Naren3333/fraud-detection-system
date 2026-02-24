require('dotenv').config();

module.exports = {
  env:         process.env.NODE_ENV     || 'development',
  port:        parseInt(process.env.PORT, 10) || 3001,
  serviceName: process.env.SERVICE_NAME || 'transaction-service',
  logLevel:    process.env.LOG_LEVEL    || 'info',

  db: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME     || 'transaction_db',
    user:     process.env.DB_USER     || 'txn_user',
    password: process.env.DB_PASSWORD || 'txn_password',
    pool: { min: 2, max: 10 },
  },

  kafka: {
    brokers:  (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'transaction-service',
    topics: {
      transactionCreated: process.env.KAFKA_TOPIC_TRANSACTION_CREATED || 'transaction.created',
      transactionFinalised: process.env.KAFKA_TOPIC_TRANSACTION_FINALISED || 'transaction.finalised',
      transactionFlagged: process.env.KAFKA_TOPIC_TRANSACTION_FLAGGED || 'transaction.flagged',
      transactionReviewed: process.env.KAFKA_TOPIC_TRANSACTION_REVIEWED || 'transaction.reviewed',
    },
    retry: { attempts: 8, initialRetryTime: 300 },
  },

  metrics: {
    port: parseInt(process.env.METRICS_PORT, 10) || 9091,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
  },
};
