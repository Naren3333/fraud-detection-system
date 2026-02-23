const { Kafka, Partitioners, CompressionTypes } = require('kafkajs');
const config = require('../config');
const logger = require('../config/logger');

let producer = null;
let ready    = false;

// Handles create producer.
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
    allowAutoTopicCreation: true,
    idempotent: true,
    maxInFlightRequests: 1,
  });

  producer.on(producer.events.CONNECT,    () => { ready = true;  logger.info('Kafka producer connected'); });
  producer.on(producer.events.DISCONNECT, () => { ready = false; logger.warn('Kafka producer disconnected'); });

  await producer.connect();
  return producer;
};


// Handles publish.
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

// Handles disconnect producer.
const disconnectProducer = async () => {
  if (producer) {
    await producer.disconnect();
    producer = null;
    ready    = false;
    logger.info('Kafka producer disconnected cleanly');
  }
};

// Handles is producer ready.
const isProducerReady = () => ready;

module.exports = { createProducer, publish, disconnectProducer, isProducerReady };