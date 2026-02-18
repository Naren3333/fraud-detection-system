const { Kafka, Partitioners, CompressionTypes } = require('kafkajs');
const config = require('./index');
const logger = require('./logger');

let kafka = null;

const createKafka = () => {
  if (kafka) return kafka;

  kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    connectionTimeout: 10000,
    requestTimeout: 30000,
    retry: config.kafka.retry,
    logCreator: () => ({ namespace, level, label, log }) => {
      const { message, ...extra } = log;
      logger.debug(`[Kafka ${label}] ${message}`, extra);
    },
  });

  return kafka;
};

const createConsumer = async () => {
  const kafka = createKafka();
  
  const consumer = kafka.consumer({
    groupId: config.kafka.groupId,
    sessionTimeout: config.kafka.sessionTimeout,
    heartbeatInterval: config.kafka.heartbeatInterval,
    maxWaitTimeInMs: 100,
    retry: config.kafka.retry,
  });

  consumer.on(consumer.events.CRASH, ({ payload }) => {
    logger.error('Kafka consumer crashed', { error: payload.error });
  });

  consumer.on(consumer.events.DISCONNECT, () => {
    logger.warn('Kafka consumer disconnected');
  });

  consumer.on(consumer.events.CONNECT, () => {
    logger.info('Kafka consumer connected');
  });

  await consumer.connect();
  return consumer;
};

const createProducer = async () => {
  const kafka = createKafka();
  
  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: true,
    idempotent: true,
    maxInFlightRequests: 1,
  });

  producer.on(producer.events.CONNECT, () => {
    logger.info('Kafka producer connected');
  });

  producer.on(producer.events.DISCONNECT, () => {
    logger.warn('Kafka producer disconnected');
  });

  await producer.connect();
  return producer;
};

const publish = async (producer, topic, partitionKey, payload, headers = {}) => {
  const result = await producer.send({
    topic,
    compression: CompressionTypes.GZIP,
    messages: [{
      key: partitionKey,
      value: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
        'service-source': config.serviceName,
        ...headers,
      },
    }],
  });

  logger.info('Kafka message published', {
    topic,
    partitionKey,
    partition: result[0]?.partition,
    offset: result[0]?.baseOffset,
  });

  return result;
};

module.exports = { createKafka, createConsumer, createProducer, publish };
