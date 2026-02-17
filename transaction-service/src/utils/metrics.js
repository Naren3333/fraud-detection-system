const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register });

module.exports = {
  register,

  transactionsTotal: new client.Counter({
    name: 'txn_service_transactions_total', help: 'Transactions received',
    labelNames: ['currency'], registers: [register],
  }),

  transactionAmount: new client.Histogram({
    name: 'txn_service_amount', help: 'Transaction amount distribution',
    labelNames: ['currency'], buckets: [10,50,100,500,1000,5000,10000,50000],
    registers: [register],
  }),

  httpDuration: new client.Histogram({
    name: 'txn_service_http_duration_seconds', help: 'HTTP request latency',
    labelNames: ['method','route','status'], buckets: [0.05,0.1,0.3,0.5,1,2,5],
    registers: [register],
  }),

  idempotencyHits: new client.Counter({
    name: 'txn_service_idempotency_hits_total', help: 'Duplicate requests returned from cache',
    registers: [register],
  }),

  kafkaPublishErrors: new client.Counter({
    name: 'txn_service_kafka_publish_errors_total', help: 'Kafka publish failures (outbox retries)',
    registers: [register],
  }),
};