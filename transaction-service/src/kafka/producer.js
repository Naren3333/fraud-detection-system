const { Kafka, Partitioners, CompressionTypes } = require('kafkajs');
const config = require('../config');
const logger = require('../config/logger');

let producer = null;
let ready    = false;

const createProducer = async () => {
  if (producer && ready) return producer;

  const kafka = new Kafka({
    clientId:          config.kafka.clientId,
    brokers:           config.kafka.brokers,
    connectionTimeout: 10000,
    requestTimeout:    30000,
    retry:             config.kafka.retry,
  });

  producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: true,   // safety net if kafka-init hasn't finished
    idempotent: true,               // exactly-once delivery within Kafka
    maxInFlightRequests: 1,         // REQUIRED: idempotent producers must use 1
  });

  producer.on(producer.events.CONNECT,    () => { ready = true;  logger.info('Kafka producer connected'); });
  producer.on(producer.events.DISCONNECT, () => { ready = false; logger.warn('Kafka producer disconnected'); });

  await producer.connect();
  return producer;
};

/**
 * Publish one message to a topic.
 * @param {string} topic
 * @param {string} partitionKey  - customerId keeps messages ordered per customer
 * @param {object} payload       - will be JSON-serialised
 * @param {object} headers       - optional tracing headers
 */
const publish = async (topic, partitionKey, payload, headers = {}) => {
  if (!producer || !ready) {
    logger.warn('Producer not ready - reconnecting');
    await createProducer();
  }

  const meta = await producer.send({
    topic,
    compression: CompressionTypes.GZIP,
    messages: [{
      key:   partitionKey,
      value: JSON.stringify(payload),
      headers: {
        'content-type':   'application/json',
        'service-source': config.serviceName,
        'event-type':     payload.eventType || '',
        ...headers,
      },
    }],
  });

  logger.info('Kafka message published', {
    topic,
    partitionKey,
    eventType: payload.eventType,
    partition: meta[0]?.partition,
    offset:    meta[0]?.baseOffset,
  });

  return meta;
};

const disconnectProducer = async () => {
  if (producer) {
    await producer.disconnect();
    producer = null;
    ready    = false;
    logger.info('Kafka producer disconnected cleanly');
  }
};

const isProducerReady = () => ready;

module.exports = { createProducer, publish, disconnectProducer, isProducerReady };
