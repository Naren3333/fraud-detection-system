require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3003,
  serviceName: process.env.SERVICE_NAME || 'fraud-detection-service',
  logLevel: process.env.LOG_LEVEL || 'info',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'fraud-detection-service',
    groupId: process.env.KAFKA_GROUP_ID || 'fraud-detection-group',
    sessionTimeout: parseInt(process.env.KAFKA_CONSUMER_SESSION_TIMEOUT, 10) || 30000,
    heartbeatInterval: parseInt(process.env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL, 10) || 3000,
    inputTopic: process.env.KAFKA_INPUT_TOPIC || 'transaction.created',
    outputTopic: process.env.KAFKA_OUTPUT_TOPIC || 'transaction.scored',
    retry: {
      initialRetryTime: 100,
      retries: 8,
      multiplier: 2,
    },
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    db: parseInt(process.env.REDIS_DB, 10) || 3,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  mlScoring: {
    url: process.env.ML_SCORING_SERVICE_URL || 'http://localhost:3004',
    timeout: parseInt(process.env.ML_SCORING_TIMEOUT, 10) || 5000,
  },

  fraudRules: {
    velocity: {
      maxAmountPerHour: parseFloat(process.env.VELOCITY_MAX_AMOUNT_PER_HOUR) || 10000,
      maxCountPerHour: parseInt(process.env.VELOCITY_MAX_COUNT_PER_HOUR, 10) || 10,
      maxCountPerDay: parseInt(process.env.VELOCITY_MAX_COUNT_PER_DAY, 10) || 50,
    },
    geographic: {
      highRiskCountries: (process.env.HIGH_RISK_COUNTRIES || '').split(',').filter(Boolean),
    },
    amounts: {
      highAmountThreshold: parseFloat(process.env.HIGH_AMOUNT_THRESHOLD) || 5000,
      suspiciousAmountThreshold: parseFloat(process.env.SUSPICIOUS_AMOUNT_THRESHOLD) || 10000,
    },
    cards: {
      binBlacklist: (process.env.BIN_BLACKLIST || '').split(',').filter(Boolean),
    },
  },
};
