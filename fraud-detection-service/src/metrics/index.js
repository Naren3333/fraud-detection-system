const client = require('prom-client');
const config = require('../config');

const register = new client.Registry();

// Add default Node.js metrics (event loop lag, heap, GC, etc.)
client.collectDefaultMetrics({
  register,
  prefix: `${config.metrics.prefix}_`,
  labels: {
    service: config.serviceName,
    version: config.serviceVersion,
    env: config.env,
  },
});

const transactionsProcessedTotal = new client.Counter({
  name: `${config.metrics.prefix}_transactions_processed_total`,
  help: 'Total number of transactions processed',
  labelNames: ['status', 'flagged'],
  registers: [register],
});

const transactionProcessingDuration = new client.Histogram({
  name: `${config.metrics.prefix}_transaction_processing_duration_ms`,
  help: 'Time taken to process a transaction end-to-end (ms)',
  labelNames: ['status'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});


const ruleEvaluationsTotal = new client.Counter({
  name: `${config.metrics.prefix}_rule_evaluations_total`,
  help: 'Total number of individual rule evaluations',
  labelNames: ['rule', 'triggered'],
  registers: [register],
});

const ruleEvaluationDuration = new client.Histogram({
  name: `${config.metrics.prefix}_rule_evaluation_duration_ms`,
  help: 'Time taken to evaluate all fraud rules (ms)',
  labelNames: ['flagged'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [register],
});


const mlScoringRequestsTotal = new client.Counter({
  name: `${config.metrics.prefix}_ml_scoring_requests_total`,
  help: 'Total ML scoring service requests',
  labelNames: ['status'], // success | fallback | circuit_open
  registers: [register],
});

const mlScoringDuration = new client.Histogram({
  name: `${config.metrics.prefix}_ml_scoring_duration_ms`,
  help: 'ML scoring HTTP request duration (ms)',
  labelNames: ['status'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

const mlCircuitBreakerState = new client.Gauge({
  name: `${config.metrics.prefix}_ml_circuit_breaker_state`,
  help: 'ML circuit breaker state: 0=closed, 1=open, 2=half-open',
  registers: [register],
});


const riskScoreDistribution = new client.Histogram({
  name: `${config.metrics.prefix}_risk_score_distribution`,
  help: 'Distribution of final risk scores',
  labelNames: ['source'], // rules | ml | combined
  buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  registers: [register],
});


const kafkaMessagesConsumed = new client.Counter({
  name: `${config.metrics.prefix}_kafka_messages_consumed_total`,
  help: 'Total Kafka messages consumed',
  labelNames: ['topic', 'status'], // success | error | dlq
  registers: [register],
});

const kafkaConsumerLag = new client.Gauge({
  name: `${config.metrics.prefix}_kafka_consumer_lag`,
  help: 'Estimated Kafka consumer lag (messages behind)',
  labelNames: ['topic', 'partition'],
  registers: [register],
});

const kafkaDlqMessagesTotal = new client.Counter({
  name: `${config.metrics.prefix}_kafka_dlq_messages_total`,
  help: 'Total messages sent to the dead letter queue',
  labelNames: ['reason'],
  registers: [register],
});


const redisCommandDuration = new client.Histogram({
  name: `${config.metrics.prefix}_redis_command_duration_ms`,
  help: 'Redis command execution duration (ms)',
  labelNames: ['command', 'status'],
  buckets: [1, 5, 10, 25, 50, 100, 250],
  registers: [register],
});


const errorsTotal = new client.Counter({
  name: `${config.metrics.prefix}_errors_total`,
  help: 'Total errors encountered',
  labelNames: ['component', 'type'],
  registers: [register],
});

module.exports = {
  register,
  transactionsProcessedTotal,
  transactionProcessingDuration,
  ruleEvaluationsTotal,
  ruleEvaluationDuration,
  mlScoringRequestsTotal,
  mlScoringDuration,
  mlCircuitBreakerState,
  riskScoreDistribution,
  kafkaMessagesConsumed,
  kafkaConsumerLag,
  kafkaDlqMessagesTotal,
  redisCommandDuration,
  errorsTotal,
};