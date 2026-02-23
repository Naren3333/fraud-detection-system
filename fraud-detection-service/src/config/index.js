require('dotenv').config();

// Handles required.
const required = (key) => {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3003,
  serviceName: process.env.SERVICE_NAME || 'fraud-detection-service',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'fraud-detection-service',
    groupId: process.env.KAFKA_GROUP_ID || 'fraud-detection-group',
    sessionTimeout: parseInt(process.env.KAFKA_CONSUMER_SESSION_TIMEOUT, 10) || 30000,
    heartbeatInterval: parseInt(process.env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL, 10) || 3000,
    inputTopic: process.env.KAFKA_INPUT_TOPIC || 'transaction.created',
    outputTopic: process.env.KAFKA_OUTPUT_TOPIC || 'transaction.scored',
    dlqTopic: process.env.KAFKA_DLQ_TOPIC || 'transaction.fraud.dlq',
    retry: {
      initialRetryTime: 100,
      retries: 8,
      multiplier: 2,
      maxRetryTime: 30000,
    },
    autoCommit: false,
    maxBatchSize: parseInt(process.env.KAFKA_MAX_BATCH_SIZE, 10) || 10,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    db: parseInt(process.env.REDIS_DB, 10) || 3,
    password: process.env.REDIS_PASSWORD || undefined,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryAttempts: 5,
    retryDelay: 500,
  },

  mlScoring: {
    url: process.env.ML_SCORING_SERVICE_URL || 'http://localhost:3004',
    timeout: parseInt(process.env.ML_SCORING_TIMEOUT, 10) || 3000,
    circuitBreaker: {
      failureThreshold: parseInt(process.env.ML_CB_FAILURE_THRESHOLD, 10) || 5,
      successThreshold: parseInt(process.env.ML_CB_SUCCESS_THRESHOLD, 10) || 2,
      timeout: parseInt(process.env.ML_CB_TIMEOUT, 10) || 30000,
    },
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
    scoring: {
      velocityCountHourWeight: parseFloat(process.env.SCORING_VELOCITY_COUNT_HOUR) || 15,
      velocityAmountHourWeight: parseFloat(process.env.SCORING_VELOCITY_AMOUNT_HOUR) || 20,
      velocityCountDayWeight: parseFloat(process.env.SCORING_VELOCITY_COUNT_DAY) || 10,
      highRiskCountryWeight: parseFloat(process.env.SCORING_HIGH_RISK_COUNTRY) || 25,
      suspiciousAmountWeight: parseFloat(process.env.SCORING_SUSPICIOUS_AMOUNT) || 30,
      highAmountWeight: parseFloat(process.env.SCORING_HIGH_AMOUNT) || 10,
      unusualTimeWeight: parseFloat(process.env.SCORING_UNUSUAL_TIME) || 5,
      roundAmountWeight: parseFloat(process.env.SCORING_ROUND_AMOUNT) || 5,
      binBlacklistWeight: parseFloat(process.env.SCORING_BIN_BLACKLIST) || 40,
    },
    combination: {
      rulesWeight: parseFloat(process.env.COMBINATION_RULES_WEIGHT) || 0.4,
      mlWeight: parseFloat(process.env.COMBINATION_ML_WEIGHT) || 0.6,
      mlFlagThreshold: parseFloat(process.env.ML_FLAG_THRESHOLD) || 70,
    },
  },

  dlq: {
    maxRetries: parseInt(process.env.DLQ_MAX_RETRIES, 10) || 3,
    retryDelayMs: parseInt(process.env.DLQ_RETRY_DELAY_MS, 10) || 1000,
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    prefix: process.env.METRICS_PREFIX || 'fraud_detection',
  },
};