require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3004,
  serviceName: process.env.SERVICE_NAME || 'ml-scoring-service',
  serviceVersion: process.env.SERVICE_VERSION || '2.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    db: parseInt(process.env.REDIS_DB, 10) || 4,
    password: process.env.REDIS_PASSWORD || undefined,
    connectTimeout: 10000,
    commandTimeout: 3000,
  },

  model: {
    version: process.env.MODEL_VERSION || 'logreg-offline',
    artifactPath: process.env.MODEL_ARTIFACT_PATH || 'data/models/latest/model.json',
    cacheTtl: parseInt(process.env.MODEL_CACHE_TTL, 10) || 3600,
    warmCache: process.env.MODEL_WARM_CACHE === 'true',
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.6,
    minFeaturesRequired: parseInt(process.env.MIN_FEATURES_REQUIRED, 10) || 8,
  },

  features: {
    amountBins: (process.env.FEATURE_AMOUNT_BINS || '5,10,50,100,500,1000,5000,10000')
      .split(',')
      .map(Number),
    hourBins: (process.env.FEATURE_HOUR_BINS || '0,6,12,18,24')
      .split(',')
      .map(Number),
    velocityDecay: parseFloat(process.env.FEATURE_VELOCITY_DECAY) || 0.5,
    highRiskCountries: (process.env.HIGH_RISK_COUNTRIES || 'NG,RU,CN,PK')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  },

  performance: {
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 2500,
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE, 10) || 100,
    enableModelWarming: process.env.ENABLE_MODEL_WARMING === 'true',
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT, 10) || 9094,
    prefix: 'ml_scoring',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
};
