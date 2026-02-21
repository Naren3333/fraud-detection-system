const config = require('../config');
const logger = require('../config/logger');
const { createConsumer, createProducer, publish } = require('../config/kafka');
const fraudDetectionService = require('../services/fraudDetectionService');
const {
  kafkaMessagesConsumed,
  kafkaConsumerLag,
  kafkaDlqMessagesTotal,
  errorsTotal,
} = require('../metrics');

let consumer = null;
let producer = null;
let isRunning = false;

const start = async () => {
  if (isRunning) {
    logger.warn('Transaction consumer already running');
    return;
  }

  logger.info('Starting transaction consumer...');

  // Producer must be ready before consumer starts so we can publish results
  producer = await createProducer();
  logger.info('Kafka producer ready');

  consumer = await createConsumer();
  await consumer.subscribe({
    topics: [config.kafka.inputTopic],
    fromBeginning: false,
  });

  logger.info('Subscribed to input topic', { topic: config.kafka.inputTopic });

  await consumer.run({
    // Manual offset commits - we only commit AFTER successfully publishing results
    autoCommit: false,
    eachMessage: async ({ topic, partition, message, heartbeat, commitOffsetsIfNecessary }) => {
      await handleMessage({ topic, partition, message, heartbeat, commitOffsetsIfNecessary });
    },
  });

  isRunning = true;
  logger.info('Transaction consumer running', {
    inputTopic: config.kafka.inputTopic,
    outputTopic: config.kafka.outputTopic,
    dlqTopic: config.kafka.dlqTopic,
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
  let transaction = null;
  let correlationId = null;

  try {
    // ── Parse ────────────────────────────────────────────────────────────────
    const raw = message.value?.toString();
    if (!raw) {
      logger.warn('Received empty Kafka message - skipping', { partition, offset });
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'skipped' });
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      logger.error('Malformed JSON in Kafka message - sending to DLQ', {
        partition,
        offset,
        error: parseErr.message,
        preview: raw.substring(0, 200),
      });
      await sendToDlq({ raw, reason: 'parse_error', error: parseErr.message, partition, offset });
      await commitOffset(partition, offset);
      return;
    }

    // ── FIXED: Extract transaction correctly ────────────────────────────────
    // Transaction service publishes with this structure:
    // { data: { transactionId, customerId, ... }, correlationId: "..." }
    transaction = data.data || data.transaction || data;
    
    // Normalize transaction.id field
    if (!transaction.id && transaction.transactionId) {
      transaction.id = transaction.transactionId;
    }

    correlationId = data.correlationId || message.headers?.['x-correlation-id']?.toString() || transaction.id;

    logger.info('Raw Kafka message received', {
      partition,
      offset,
      hasData: !!data.data,
      hasTransaction: !!data.transaction,
      transactionId: transaction?.id || transaction?.transactionId,
      correlationId,
    });

    // ── Validate ─────────────────────────────────────────────────────────────
    const validationError = validateTransaction(transaction);
    if (validationError) {
      logger.error('Invalid transaction payload - sending to DLQ', {
        transactionId: transaction?.id,
        correlationId,
        reason: validationError,
        partition,
        offset,
      });
      await sendToDlq({
        transaction,
        correlationId,
        reason: 'validation_error',
        error: validationError,
        partition,
        offset,
      });
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'dlq' });
      return;
    }

    // Periodic heartbeat to prevent session timeout on slow ML calls
    await heartbeat();

    logger.info('Processing transaction', {
      transactionId: transaction.id,
      customerId: transaction.customerId,
      amount: transaction.amount,
      correlationId,
      partition,
      offset,
    });

    // ── Analyse ──────────────────────────────────────────────────────────────
    const fraudResults = await fraudDetectionService.analyzeTransaction(transaction, correlationId);

    // Heartbeat again after analysis (can take seconds)
    await heartbeat();

    // ── Publish Result ───────────────────────────────────────────────────────
    await publish(
      producer,
      config.kafka.outputTopic,
      transaction.customerId, // Partition by customer to preserve ordering
      {
        eventType: 'transaction.scored',
        transactionId: transaction.id,
        customerId: transaction.customerId,
        merchantId: transaction.merchantId,
        originalTransaction: transaction,
        fraudAnalysis: fraudResults,
        processedAt: new Date().toISOString(),
      },
      {
        'x-correlation-id': correlationId,
        'x-source-service': config.serviceName,
      }
    );

    // ── Commit Offset ────────────────────────────────────────────────────────
    // Only commit AFTER successfully publishing - guarantees at-least-once delivery
    await commitOffset(partition, offset);

    const durationMs = Date.now() - startTime;
    kafkaMessagesConsumed.inc({ topic, status: 'success' });

    logger.info('Transaction processed successfully', {
      transactionId: transaction.id,
      correlationId,
      riskScore: fraudResults.riskScore,
      flagged: fraudResults.flagged,
      durationMs,
      partition,
      offset,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('Unhandled error processing transaction', {
      transactionId: transaction?.id,
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
        transaction,
        correlationId,
        reason: 'processing_error',
        error: error.message,
        partition,
        offset,
      });
      await commitOffset(partition, offset);
      kafkaMessagesConsumed.inc({ topic, status: 'dlq' });
    } catch (dlqErr) {
      logger.error('Failed to send message to DLQ - offset NOT committed', {
        transactionId: transaction?.id,
        dlqError: dlqErr.message,
        partition,
        offset,
      });
      errorsTotal.inc({ component: 'transaction_consumer', type: 'dlq_failure' });
      // Do NOT commit - Kafka will redeliver this message on restart
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

const sendToDlq = async ({ raw, transaction, correlationId, reason, error, partition, offset }) => {
  const dlqPayload = {
    eventType: 'transaction.fraud.dlq',
    reason,
    error,
    originalTransaction: transaction || null,
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
    transaction?.id || 'unknown',
    dlqPayload,
    {
      'x-dlq-reason': reason,
      'x-correlation-id': correlationId || 'unknown',
    }
  );

  kafkaDlqMessagesTotal.inc({ reason });

  logger.warn('Message sent to DLQ', {
    transactionId: transaction?.id,
    correlationId,
    reason,
    partition,
    offset,
  });
};

const validateTransaction = (transaction) => {
  if (!transaction) return 'Transaction payload is null or undefined';
  if (!transaction.id) return 'Missing required field: id';
  if (!transaction.customerId) return 'Missing required field: customerId';
  if (typeof transaction.amount !== 'number') return 'Field amount must be a number';
  if (transaction.amount < 0) return 'Field amount must be non-negative';
  if (!transaction.currency) return 'Missing required field: currency';
  if (!transaction.createdAt) return 'Missing required field: createdAt';
  return null; // valid
};

module.exports = { start, stop };
