const config = require('../config');
const logger = require('../config/logger');
const { createConsumer, createProducer, publish } = require('../config/kafka');
const decisionEngineService = require('../services/decisionEngineService');
const decisionRepository = require('../repositories/decisionRepository');
const {
  decisionsTotal,
  decisionDuration,
  kafkaMessagesConsumed,
  errorsTotal,
} = require('../utils/metrics');

let consumer = null;
let producer = null;
let isRunning = false;

const start = async () => {
  if (isRunning) {
    logger.warn('Transaction consumer already running');
    return;
  }

  logger.info('Starting transaction consumer...');

  // Producer must be ready before consumer starts
  producer = await createProducer();
  logger.info('Kafka producer ready');

  consumer = await createConsumer();
  await consumer.subscribe({
    topics: [config.kafka.inputTopic],
    fromBeginning: false,
  });

  logger.info('Subscribed to input topic', { topic: config.kafka.inputTopic });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      await handleMessage({ topic, partition, message, heartbeat });
    },
  });

  isRunning = true;
  logger.info('Transaction consumer running', {
    inputTopic: config.kafka.inputTopic,
    outputTopicApproved: config.kafka.outputTopicApproved,
    outputTopicFlagged: config.kafka.outputTopicFlagged,
  });
};

const stop = async () => {
  if (!isRunning) return;

  logger.info('Stopping transaction consumer...');
  isRunning = false;

  const errors = [];

  if (consumer) {
    try {
      await consumer.disconnect();
      consumer = null;
      logger.info('Kafka consumer disconnected');
    } catch (err) {
      errors.push(err);
      logger.error('Error disconnecting Kafka consumer', { error: err.message });
    }
  }

  if (producer) {
    try {
      await producer.disconnect();
      producer = null;
      logger.info('Kafka producer disconnected');
    } catch (err) {
      errors.push(err);
      logger.error('Error disconnecting Kafka producer', { error: err.message });
    }
  }

  if (errors.length > 0) {
    throw errors[0];
  }
};

// ─── Message Handler ─────────────────────────────────────────────────────────

const handleMessage = async ({ topic, partition, message, heartbeat }) => {
  const startTime = Date.now();
  const offset = message.offset;
  let transactionId = null;
  let correlationId = null;

  try {
    // ── Parse ────────────────────────────────────────────────────────────────
    const raw = message.value?.toString();
    if (!raw) {
      logger.warn('Received empty Kafka message — skipping', { partition, offset });
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'skipped' });
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      logger.error('Malformed JSON in Kafka message — sending to DLQ', {
        partition,
        offset,
        error: parseErr.message,
        preview: raw.substring(0, 200),
      });
      await sendToDlq({ raw, reason: 'parse_error', error: parseErr.message, partition, offset });
      await commitOffset(partition, offset);
      return;
    }

    transactionId = data.transactionId || data.fraudAnalysis?.transactionId;
    correlationId = data.correlationId || message.headers?.['x-correlation-id']?.toString() || transactionId;

    const fraudAnalysis = data.fraudAnalysis;
    const originalTransaction = data.originalTransaction;

    if (!fraudAnalysis || !transactionId) {
      logger.error('Invalid message structure — missing fraudAnalysis', {
        transactionId,
        correlationId,
        partition,
        offset,
      });
      await sendToDlq({
        data,
        correlationId,
        reason: 'missing_fraud_analysis',
        error: 'fraudAnalysis field is required',
        partition,
        offset,
      });
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'dlq' });
      return;
    }

    // Heartbeat to prevent session timeout
    await heartbeat();

    logger.info('Processing scored transaction', {
      transactionId,
      customerId: fraudAnalysis.customerId,
      riskScore: fraudAnalysis.riskScore,
      correlationId,
      partition,
      offset,
    });

    // ── Make Decision ────────────────────────────────────────────────────────
    const decisionResult = decisionEngineService.makeDecision(fraudAnalysis, originalTransaction);

    logger.info('Decision made', {
      transactionId,
      decision: decisionResult.decision,
      riskScore: fraudAnalysis.riskScore,
      overrideApplied: decisionResult.overrideApplied,
    });

    const existingDecision = await decisionRepository.findByTransactionId(transactionId);
    if (existingDecision && existingDecision.decision === decisionResult.decision) {
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'skipped' });
      logger.warn('Duplicate scored event detected; skipping decision republish', {
        transactionId,
        decision: decisionResult.decision,
        existingDecisionId: existingDecision.decision_id,
        partition,
        offset,
      });
      return;
    }

    // ── Save to Database ─────────────────────────────────────────────────────
    const dbResult = await decisionRepository.saveDecision({
      transactionId,
      customerId: fraudAnalysis.customerId,
      merchantId: fraudAnalysis.merchantId,
      riskScore: fraudAnalysis.riskScore,
      mlScore: fraudAnalysis.mlResults?.score,
      ruleScore: fraudAnalysis.ruleResults?.ruleScore,
      fraudFlagged: fraudAnalysis.flagged,
      confidence: fraudAnalysis.mlResults?.confidence,
      decision: decisionResult.decision,
      decisionReason: decisionResult.decisionReason,
      decisionFactors: decisionResult.decisionFactors,
      overrideApplied: decisionResult.overrideApplied,
      overrideReason: decisionResult.overrideReason,
      overrideType: decisionResult.overrideType,
      correlationId,
      decisionVersion: decisionResult.decisionVersion,
      fraudAnalysis,
      originalTransaction,
      decisionMetadata: {
        processedAt: new Date().toISOString(),
        kafkaPartition: partition,
        kafkaOffset: offset,
      },
    });

    // Heartbeat again after DB write
    await heartbeat();

    // ── Publish Decision ─────────────────────────────────────────────────────
    const outputPayload = {
      eventType: decisionResult.decision === 'FLAGGED' ? 'transaction.flagged' : 'transaction.finalised',
      transactionId,
      customerId: fraudAnalysis.customerId,
      merchantId: fraudAnalysis.merchantId,
      
      // Decision details
      decision: decisionResult.decision,
      decisionReason: decisionResult.decisionReason,
      decisionFactors: decisionResult.decisionFactors,
      decisionId: dbResult.decisionId,
      decidedAt: dbResult.decidedAt,
      
      // Full context for downstream services
      originalTransaction,
      fraudAnalysis,
      
      // Metadata
      processedAt: new Date().toISOString(),
      correlationId,
    };

    // Publish to appropriate topic
    const outputTopic = decisionResult.decision === 'FLAGGED'
      ? config.kafka.outputTopicFlagged
      : config.kafka.outputTopicApproved;

    await publish(
      producer,
      outputTopic,
      fraudAnalysis.customerId, // Partition by customer
      outputPayload,
      {
        'x-correlation-id': correlationId,
        'x-decision': decisionResult.decision,
        'x-source-service': config.serviceName,
      }
    );

    // ── Commit Offset ────────────────────────────────────────────────────────
    await commitOffset(partition, offset);

    const durationMs = Date.now() - startTime;
    
    // Metrics
    decisionsTotal.inc({ decision: decisionResult.decision });
    decisionDuration.observe({ decision: decisionResult.decision }, durationMs);
    kafkaMessagesConsumed.inc({ topic, status: 'success' });

    logger.info('Transaction decision completed', {
      transactionId,
      decision: decisionResult.decision,
      decisionId: dbResult.decisionId,
      durationMs,
      partition,
      offset,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('Unhandled error processing transaction', {
      transactionId,
      correlationId,
      error: error.message,
      stack: error.stack,
      partition,
      offset,
      durationMs,
    });

    errorsTotal.inc({ component: 'transaction_consumer', type: 'unhandled' });

    try {
      await sendToDlq({
        transactionId,
        correlationId,
        reason: 'processing_error',
        error: error.message,
        partition,
        offset,
      });
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'dlq' });
    } catch (dlqErr) {
      logger.error('Failed to send message to DLQ — offset NOT committed', {
        transactionId,
        dlqError: dlqErr.message,
        partition,
        offset,
      });
      errorsTotal.inc({ component: 'transaction_consumer', type: 'dlq_failure' });
    }
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const commitOffset = async (partition, offset) => {
  if (!consumer) return;
  try {
    await consumer.commitOffsets([
      {
        topic: config.kafka.inputTopic,
        partition,
        offset: (BigInt(offset) + 1n).toString(),
      },
    ]);
  } catch (err) {
    logger.error('Failed to commit Kafka offset', {
      partition,
      offset,
      error: err.message,
    });
    errorsTotal.inc({ component: 'transaction_consumer', type: 'commit_failure' });
    throw err;
  }
};

const sendToDlq = async ({ raw, data, transactionId, correlationId, reason, error, partition, offset }) => {
  const dlqPayload = {
    eventType: 'transaction.decision.dlq',
    reason,
    error,
    transactionId: transactionId || 'unknown',
    originalData: data || null,
    rawPayload: raw || null,
    correlationId,
    failedAt: new Date().toISOString(),
    sourcePartition: partition,
    sourceOffset: offset,
    serviceName: config.serviceName,
  };

  await publish(
    producer,
    config.kafka.dlqTopic,
    transactionId || 'unknown',
    dlqPayload,
    {
      'x-dlq-reason': reason,
      'x-correlation-id': correlationId || 'unknown',
    }
  );

  logger.warn('Message sent to DLQ', {
    transactionId,
    correlationId,
    reason,
    partition,
    offset,
  });
};

module.exports = { start, stop };
