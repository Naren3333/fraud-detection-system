const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../config/logger');
const { publish } = require('../config/kafka');
const reviewRepository = require('../repositories/reviewRepository');

class ReviewService {
  constructor() {
    this.producer = null;
  }

  // Handles producer binding.
  setProducer(producer) {
    this.producer = producer;
  }

  // Handles enqueue flagged.
  async enqueueFlagged(event, sourceTopic) {
    if (!event?.transactionId || !event?.customerId) {
      throw new Error('transactionId and customerId are required from flagged event');
    }
    return reviewRepository.upsertFromFlagged(event, sourceTopic);
  }

  // Handles list pending.
  async listPending(limit, offset) {
    return reviewRepository.listPending(limit, offset);
  }

  // Handles get review by transaction.
  async getReviewByTransaction(transactionId) {
    return reviewRepository.getByTransactionId(transactionId);
  }

  // Handles apply decision.
  async applyDecision({ transactionId, decision, reviewedBy, notes }) {
    const existing = await reviewRepository.getByTransactionId(transactionId);
    if (!existing) {
      throw new Error(`No manual review record for transaction ${transactionId}`);
    }
    if (!this.producer) {
      throw new Error('Kafka producer is not ready');
    }

    const updated = await reviewRepository.applyReviewDecision(
      transactionId,
      decision,
      reviewedBy,
      notes
    );

    const correlationId = existing.correlationId || uuidv4();
    const reviewedEvent = {
      eventType: 'transaction.reviewed',
      transactionId: updated.transactionId,
      customerId: updated.customerId,
      merchantId: updated.merchantId,
      previousDecision: 'FLAGGED',
      reviewDecision: decision,
      decision, // keep for compatibility with existing consumers
      reviewNotes: notes || null,
      reviewedBy,
      reviewedAt: updated.reviewedAt,
      correlationId,
      sourceService: config.serviceName,
    };

    await publish(
      this.producer,
      config.kafka.outputTopicReviewed,
      updated.customerId,
      reviewedEvent,
      {
        'x-correlation-id': correlationId,
        'x-review-decision': decision,
      }
    );

    logger.info('Manual review decision published', {
      transactionId: updated.transactionId,
      decision,
      reviewedBy,
      outputTopic: config.kafka.outputTopicReviewed,
    });

    return updated;
  }
}

module.exports = new ReviewService();
