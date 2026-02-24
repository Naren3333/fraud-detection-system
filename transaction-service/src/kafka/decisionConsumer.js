'use strict';

const { Kafka } = require('kafkajs');
const config = require('../config');
const logger = require('../config/logger');
const transactionRepository = require('../repositories/transactionRepository');
const DECISION_TO_STATUS = {
  APPROVED: 'APPROVED',
  DECLINED: 'REJECTED',
  FLAGGED:  'FLAGGED',
};

let consumer = null;
let isRunning = false;


// Handles start.
const start = async () => {
  if (isRunning) {
    logger.warn('Decision consumer already running');
    return;
  }

  const kafka = new Kafka({
    clientId:          `${config.kafka.clientId}-decision-consumer`,
    brokers:           config.kafka.brokers,
    connectionTimeout: 10000,
    requestTimeout:    30000,
    retry:             config.kafka.retry,
  });

  consumer = kafka.consumer({
    groupId:           `${config.kafka.clientId}-decision-group`,
    sessionTimeout:    30000,
    heartbeatInterval: 3000,
    autoCommit:        false,
  });

  consumer.on(consumer.events.CRASH, ({ payload }) => {
    logger.error('Decision consumer crashed', { error: payload.error?.message });
  });

  consumer.on(consumer.events.CONNECT, () => {
    logger.info('Decision consumer connected');
  });

  await consumer.connect();

  await consumer.subscribe({
    topics: [
      config.kafka.topics.transactionFinalised,
      config.kafka.topics.transactionFlagged,
      config.kafka.topics.transactionReviewed,
    ],
    fromBeginning: false,
  });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      await handleMessage({ topic, partition, message, heartbeat });
    },
  });

  isRunning = true;
  logger.info('Decision consumer running', {
    topics: [
      config.kafka.topics.transactionFinalised,
      config.kafka.topics.transactionFlagged,
      config.kafka.topics.transactionReviewed,
    ],
  });
};


// Handles stop.
const stop = async () => {
  if (!isRunning || !consumer) return;
  isRunning = false;
  await consumer.disconnect();
  consumer = null;
  logger.info('Decision consumer disconnected');
};


// Handles handle message.
const handleMessage = async ({ topic, partition, message, heartbeat }) => {
  const offset = message.offset;
  let transactionId = null;

  try {
    const raw = message.value?.toString();
    if (!raw) {
      logger.warn('Empty message received on decision topic - skipping', { topic, partition, offset });
      await commitOffset(topic, partition, offset);
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      logger.error('Malformed JSON in decision message - skipping', {
        topic, partition, offset, error: err.message,
      });
      await commitOffset(topic, partition, offset);
      return;
    }

    transactionId = data.transactionId;
    const decision = data.reviewDecision || data.decision;

    if (!transactionId || !decision) {
      logger.error('Decision message missing transactionId or decision - skipping', {
        topic, partition, offset, data,
      });
      await commitOffset(topic, partition, offset);
      return;
    }

    await heartbeat();

    const newStatus = DECISION_TO_STATUS[decision];
    if (!newStatus) {
      logger.error('Unknown decision value - skipping', {
        transactionId, decision, topic, partition, offset,
      });
      await commitOffset(topic, partition, offset);
      return;
    }

    const updated = await transactionRepository.updateStatus(transactionId, newStatus);

    if (!updated) {
      logger.warn('Transaction not found for status update', {
        transactionId, decision, newStatus,
      });
    } else {
      logger.info('Transaction status updated from decision', {
        transactionId,
        decision,
        newStatus,
        sourceTopic: topic,
        correlationId: data.correlationId,
      });
    }

    await commitOffset(topic, partition, offset);

  } catch (err) {
    logger.error('Error processing decision message', {
      transactionId,
      topic,
      partition,
      offset,
      error: err.message,
      stack: err.stack,
    });
    await commitOffset(topic, partition, offset);
  }
};


// Handles commit offset.
const commitOffset = async (topic, partition, offset) => {
  if (!consumer) return;
  try {
    await consumer.commitOffsets([{
      topic,
      partition,
      offset: (BigInt(offset) + 1n).toString(),
    }]);
  } catch (err) {
    logger.error('Failed to commit offset on decision consumer', {
      topic, partition, offset, error: err.message,
    });
  }
};

module.exports = { start, stop };
