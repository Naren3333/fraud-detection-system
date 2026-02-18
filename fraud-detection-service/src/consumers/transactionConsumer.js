const config = require('../config');
const logger = require('../config/logger');
const { createConsumer, createProducer, publish } = require('../config/kafka');
const fraudDetectionService = require('../services/fraudDetectionService');

let consumer = null;
let producer = null;
let isRunning = false;

const start = async () => {
  if (isRunning) {
    logger.warn('Consumer already running');
    return;
  }

  try {
    logger.info('Starting Kafka consumer...');

    // Initialize producer first (needed for publishing results)
    producer = await createProducer();
    logger.info('Kafka producer ready');

    // Initialize consumer
    consumer = await createConsumer();
    await consumer.subscribe({
      topics: [config.kafka.inputTopic],
      fromBeginning: false, // Only new messages
    });

    logger.info('Subscribed to topic', { topic: config.kafka.inputTopic });

    // Start consuming
    await consumer.run({
      autoCommit: true,
      autoCommitInterval: 5000,
      eachMessage: async ({ topic, partition, message }) => {
        await handleMessage(topic, partition, message);
      },
    });

    isRunning = true;
    logger.info('Kafka consumer running');
  } catch (error) {
    logger.error('Failed to start Kafka consumer', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

const stop = async () => {
  if (!isRunning) return;

  logger.info('Stopping Kafka consumer...');
  isRunning = false;

  try {
    if (consumer) {
      await consumer.disconnect();
      consumer = null;
      logger.info('Kafka consumer disconnected');
    }

    if (producer) {
      await producer.disconnect();
      producer = null;
      logger.info('Kafka producer disconnected');
    }
  } catch (error) {
    logger.error('Error stopping Kafka consumer', { error: error.message });
    throw error;
  }
};

const handleMessage = async (topic, partition, message) => {
  const startTime = Date.now();
  let transaction = null;

  try {
    // Parse message
    const value = message.value.toString();
    const data = JSON.parse(value);

    // Extract transaction from message
    transaction = data.transaction || data;

    logger.info('Processing transaction', {
      transactionId: transaction.id,
      offset: message.offset,
      partition,
    });

    // Run fraud analysis
    const fraudResults = await fraudDetectionService.analyzeTransaction(transaction);

    // Publish results to output topic
    await publish(
      producer,
      config.kafka.outputTopic,
      transaction.customerId, // Partition by customer to maintain order
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
        'x-correlation-id': data.correlationId || transaction.id,
        'x-source-service': 'fraud-detection-service',
      }
    );

    const duration = Date.now() - startTime;

    logger.info('Transaction processed successfully', {
      transactionId: transaction.id,
      riskScore: fraudResults.riskScore,
      flagged: fraudResults.flagged,
      durationMs: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Failed to process transaction', {
      transactionId: transaction?.id,
      error: error.message,
      stack: error.stack,
      durationMs: duration,
      offset: message.offset,
      partition,
    });

    // Optionally: publish to DLQ (dead letter queue)
    // For now, we just log and continue
  }
};

module.exports = { start, stop };
