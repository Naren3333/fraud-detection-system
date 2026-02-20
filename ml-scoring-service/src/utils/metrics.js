const client = require('prom-client');
const config = require('../config');

const register = new client.Registry();

// Default Node.js metrics
client.collectDefaultMetrics({
  register,
  prefix: `${config.metrics.prefix}_`,
  labels: {
    service: config.serviceName,
    version: config.serviceVersion,
    env: config.env,
  },
});

// ─── Scoring Metrics ─────────────────────────────────────────────────────────

const scoringRequestsTotal = new client.Counter({
  name: `${config.metrics.prefix}_scoring_requests_total`,
  help: 'Total number of scoring requests',
  labelNames: ['status'], // success | error
  registers: [register],
});

const scoringDuration = new client.Histogram({
  name: `${config.metrics.prefix}_scoring_duration_ms`,
  help: 'Scoring request duration (ms)',
  labelNames: ['cached'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [register],
});

const scoreDistribution = new client.Histogram({
  name: `${config.metrics.prefix}_score_distribution`,
  help: 'Distribution of risk scores',
  buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  registers: [register],
});

const confidenceDistribution = new client.Histogram({
  name: `${config.metrics.prefix}_confidence_distribution`,
  help: 'Distribution of prediction confidence',
  buckets: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [register],
});

// ─── Feature Engineering Metrics ─────────────────────────────────────────────

const featureExtractionDuration = new client.Histogram({
  name: `${config.metrics.prefix}_feature_extraction_duration_ms`,
  help: 'Feature extraction duration (ms)',
  buckets: [1, 5, 10, 25, 50, 100],
  registers: [register],
});

const featureCount = new client.Gauge({
  name: `${config.metrics.prefix}_feature_count`,
  help: 'Number of features extracted per request',
  registers: [register],
});

// ─── Model Metrics ───────────────────────────────────────────────────────────

const modelInferenceDuration = new client.Histogram({
  name: `${config.metrics.prefix}_model_inference_duration_ms`,
  help: 'Model inference duration (ms)',
  buckets: [1, 5, 10, 25, 50, 100],
  registers: [register],
});

const modelVersion = new client.Gauge({
  name: `${config.metrics.prefix}_model_version_info`,
  help: 'Model version information',
  labelNames: ['version'],
  registers: [register],
});

// ─── Cache Metrics ───────────────────────────────────────────────────────────

const cacheHits = new client.Counter({
  name: `${config.metrics.prefix}_cache_hits_total`,
  help: 'Total cache hits',
  registers: [register],
});

const cacheMisses = new client.Counter({
  name: `${config.metrics.prefix}_cache_misses_total`,
  help: 'Total cache misses',
  registers: [register],
});

// ─── Error Metrics ───────────────────────────────────────────────────────────

const errorsTotal = new client.Counter({
  name: `${config.metrics.prefix}_errors_total`,
  help: 'Total errors encountered',
  labelNames: ['component', 'type'],
  registers: [register],
});

module.exports = {
  register,
  scoringRequestsTotal,
  scoringDuration,
  scoreDistribution,
  confidenceDistribution,
  featureExtractionDuration,
  featureCount,
  modelInferenceDuration,
  modelVersion,
  cacheHits,
  cacheMisses,
  errorsTotal,
};
