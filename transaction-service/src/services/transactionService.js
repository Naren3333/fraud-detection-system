const { v4: uuidv4 }           = require('uuid');
const repo                     = require('../repositories/transactionRepository');
const { publish, isProducerReady } = require('../kafka/producer');
const config                   = require('../config');
const logger                   = require('../config/logger');
const metrics                  = require('../utils/metrics');
const { TRANSACTION_STATUS, EVENT_TYPES } = require('../utils/constants');

class TransactionService {

  // Handles create transaction.
  async createTransaction(body, ctx) {
    const timer = metrics.httpDuration.startTimer({ method: 'POST', route: '/transactions' });

    if (ctx.idempotencyKey) {
      const cached = await repo.findIdempotencyKey(ctx.idempotencyKey);
      if (cached) {
        metrics.idempotencyHits.inc();
        logger.info('Duplicate request - returning cached response', {
          key: ctx.idempotencyKey, transactionId: cached.transaction_id,
        });
        return { idempotent: true, statusCode: cached.status_code,
                 ...JSON.parse(cached.response_body) };
      }
    }

    const cardLastFour = body.cardNumber ? body.cardNumber.slice(-4) : null;
    const maskedCard   = body.cardNumber ? `****${cardLastFour}` : null;

    const transactionId = uuidv4();
    const correlationId = ctx.correlationId || uuidv4();

    const eventPayload = {
      eventId:      uuidv4(),
      eventType:    EVENT_TYPES.TRANSACTION_CREATED,
      eventVersion: '1.0',
      timestamp:    new Date().toISOString(),
      source:       config.serviceName,
      correlationId,
      transactionId,
      data: {
        transactionId,
        customerId:   body.customerId,
        merchantId:   body.merchantId,
        amount:       body.amount,
        currency:     body.currency || 'USD',
        cardLastFour,
        cardType:     body.cardType || null,
        deviceId:     body.deviceId || null,
        ipAddress:    ctx.ipAddress || body.ipAddress || null,
        userAgent:    ctx.userAgent || null,
        location:     body.location  || {},
        metadata:     body.metadata  || {},
        createdAt:    new Date().toISOString(),
      },
    };

    const txn = await repo.createWithOutbox(
      {
        id: transactionId, customerId: body.customerId, merchantId: body.merchantId,
        amount: body.amount, currency: body.currency || 'USD',
        cardNumber: maskedCard, cardLastFour, cardType: body.cardType,
        deviceId: body.deviceId, ipAddress: ctx.ipAddress || body.ipAddress,
        userAgent: ctx.userAgent, location: body.location, metadata: body.metadata,
        status: TRANSACTION_STATUS.PENDING,
        idempotencyKey: ctx.idempotencyKey, correlationId, requestId: ctx.requestId,
      },
      {
        topic:     config.kafka.topics.transactionCreated,
        eventType: EVENT_TYPES.TRANSACTION_CREATED,
        payload:   eventPayload,
      }
    );

    if (isProducerReady()) {
      try {
        await publish(
          config.kafka.topics.transactionCreated,
          body.customerId, 
          eventPayload,
          { 'correlation-id': correlationId }
        );
      } catch (err) {
        metrics.kafkaErrors.inc();
        logger.warn('Live Kafka publish failed - outbox will retry', {
          transactionId, error: err.message,
        });
      }
    }

    metrics.transactionsTotal.inc({ currency: txn.currency });
    metrics.transactionAmount.observe({ currency: txn.currency }, txn.amount);
    timer({ status: '201' });

    logger.info('Transaction created', {
      transactionId, customerId: txn.customerId, amount: txn.amount,
      currency: txn.currency, correlationId,
    });

    return {
      idempotent:    false,
      transactionId: txn.id,
      status:        txn.status,
      amount:        txn.amount,
      currency:      txn.currency,
      customerId:    txn.customerId,
      merchantId:    txn.merchantId,
      cardLastFour:  txn.cardLastFour,
      createdAt:     txn.createdAt,
      correlationId,
      message: 'Transaction received and queued for fraud analysis',
    };
  }

  // Handles get by id.
  async getById(id) {
    return repo.findById(id);
  }

  // Handles get by customer.
  async getByCustomer(customerId, pagination) {
    return repo.findByCustomerId(customerId, pagination);
  }
}

module.exports = new TransactionService();