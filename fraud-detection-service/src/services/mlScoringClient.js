const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');
const { CircuitBreaker } = require('./circuitBreaker');
const {
  mlScoringRequestsTotal,
  mlScoringDuration,
  errorsTotal,
} = require('../metrics');

const circuitBreaker = new CircuitBreaker('ml-scoring-service', config.mlScoring.circuitBreaker);

class MLScoringClient {
  constructor() {
    this.httpClient = axios.create({
      baseURL: config.mlScoring.url,
      timeout: config.mlScoring.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': config.serviceName,
        'X-Service-Version': config.serviceVersion,
      },
    });
  }

  /**
   * Get ML risk score (0–100) for a transaction.
   * Automatically falls back to a rule-derived score if the service is unavailable.
   */
  async getScore(transaction, ruleResults, childLogger) {
    const log = childLogger || logger;
    const startTime = Date.now();

    // Short-circuit immediately if circuit is open — no need to even try
    if (circuitBreaker.isOpen()) {
      log.warn('ML scoring skipped — circuit breaker is OPEN', {
        transactionId: transaction.id,
        circuitStats: circuitBreaker.getStats(),
      });
      mlScoringRequestsTotal.inc({ status: 'circuit_open' });
      return this._fallback(ruleResults, 'circuit_open');
    }

    try {
      const score = await circuitBreaker.execute(() =>
        this._callScoringService(transaction, ruleResults, log)
      );

      const durationMs = Date.now() - startTime;
      mlScoringRequestsTotal.inc({ status: 'success' });
      mlScoringDuration.observe({ status: 'success' }, durationMs);

      log.info('ML score received', {
        transactionId: transaction.id,
        score: score.score,
        modelVersion: score.modelVersion,
        durationMs,
      });

      return score;
    } catch (err) {
      const durationMs = Date.now() - startTime;

      // Don't double-log circuit breaker open errors
      if (!err.circuitOpen) {
        log.error('ML scoring failed', {
          transactionId: transaction.id,
          error: err.message,
          code: err.code,
          httpStatus: err.response?.status,
          durationMs,
        });
        errorsTotal.inc({ component: 'ml_scoring', type: err.code || 'http_error' });
      }

      mlScoringRequestsTotal.inc({ status: 'fallback' });
      mlScoringDuration.observe({ status: 'fallback' }, durationMs);

      const fallback = this._fallback(ruleResults, err.message);

      log.warn('Using fallback ML score', {
        transactionId: transaction.id,
        fallbackScore: fallback.score,
        reason: err.message,
      });

      return fallback;
    }
  }

  /**
   * Actual HTTP call to the ML scoring service.
   */
  async _callScoringService(transaction, ruleResults, log) {
    const response = await this.httpClient.post('/api/v1/score', {
      transaction: {
        id: transaction.id,
        customerId: transaction.customerId,
        merchantId: transaction.merchantId,
        amount: transaction.amount,
        currency: transaction.currency,
        cardType: transaction.cardType,
        deviceId: transaction.deviceId,
        ipAddress: transaction.ipAddress,
        location: transaction.location,
        metadata: transaction.metadata,
        createdAt: transaction.createdAt,
      },
      ruleResults: {
        flagged: ruleResults.flagged,
        reasons: ruleResults.reasons,
        riskFactors: ruleResults.riskFactors,
        ruleScore: ruleResults.ruleScore,
      },
    });

    const { data } = response;

    if (!data || typeof data.score !== 'number' || data.score < 0 || data.score > 100) {
      throw new Error(`Invalid ML scoring response: ${JSON.stringify(data)}`);
    }

    return {
      score: data.score,
      modelVersion: data.modelVersion || 'unknown',
      features: data.features || {},
      confidence: data.confidence || null,
    };
  }

  /**
   * Graduated fallback score derived from rule-based signals.
   *
   * Score breakdown:
   *   30  — base score for any transaction
   *   +40 — if rules engine flagged the transaction
   *   +5  — per distinct rule reason (max +20)
   *   +5  — if transaction is high-value (amount >= highAmountThreshold)
   *
   * Capped at 95 to distinguish from the ML model's potential 100.
   */
  _fallback(ruleResults, reason) {
    let score = 30;

    if (ruleResults.flagged) {
      score += 40;
    }

    if (ruleResults.reasons?.length) {
      score += Math.min(ruleResults.reasons.length * 5, 20);
    }

    // High-amount factor
    if (ruleResults.riskFactors?.amount?.highAmount) {
      score += 5;
    }

    return {
      score: Math.min(score, 95),
      modelVersion: 'fallback-v1',
      confidence: null,
      features: {
        fallbackReason: reason,
        derivedFromRules: true,
      },
    };
  }

  /**
   * Expose circuit breaker state for health checks.
   */
  getCircuitBreakerStats() {
    return circuitBreaker.getStats();
  }
}

module.exports = new MLScoringClient();