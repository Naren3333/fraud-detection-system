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

  async listCases({ status, assignee, limit, offset }) {
    const statuses = status
      ? String(status).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : ['PENDING', 'IN_REVIEW'];

    return reviewRepository.listCases({ statuses, assignee, limit, offset });
  }

  // Backward-compatible endpoint.
  async listPending(limit, offset) {
    return reviewRepository.listPending(limit, offset);
  }

  async getReviewByTransaction(transactionId) {
    return reviewRepository.getByTransactionId(transactionId);
  }

  async getCaseHistory(transactionId, limit = 50) {
    return reviewRepository.getHistory(transactionId, limit);
  }

  async claimCase({ transactionId, reviewerId, claimTtlMinutes = 10 }) {
    if (!reviewerId || typeof reviewerId !== 'string') {
      throw new Error('reviewerId is required');
    }

    return reviewRepository.claimCase(transactionId, reviewerId.trim(), claimTtlMinutes);
  }

  async releaseCase({ transactionId, reviewerId, notes }) {
    if (!reviewerId || typeof reviewerId !== 'string') {
      throw new Error('reviewerId is required');
    }

    return reviewRepository.releaseCase(transactionId, reviewerId.trim(), notes);
  }

  // Handles apply decision.
  async applyDecision({ transactionId, decision, reviewedBy, notes }) {
    const allowed = new Set(['APPROVED', 'DECLINED']);
    if (!allowed.has(decision)) {
      throw new Error('decision must be APPROVED or DECLINED');
    }

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

    if (!updated) {
      throw new Error(`No manual review record for transaction ${transactionId}`);
    }

    if (updated.conflict) {
      return updated;
    }

    const correlationId = existing.correlationId || uuidv4();
    const reviewedEvent = {
      eventType: 'transaction.reviewed',
      transactionId: updated.transactionId,
      customerId: updated.customerId,
      merchantId: updated.merchantId,
      previousDecision: 'FLAGGED',
      reviewDecision: decision,
      decision,
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
