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

  async getScore(transaction, ruleResults, childLogger) {
    const log = childLogger || logger;
    const startTime = Date.now();

    if (circuitBreaker.isOpen()) {
      log.warn('ML scoring skipped – circuit breaker is OPEN', {
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

      if (!err.circuitOpen) {
        log.error('ML scoring failed', {
          transactionId: transaction.id,
          error: err.message,
          code: err.code,
          httpStatus: err.response?.status,
          responseData: err.response?.data, // ← ADD THIS to see validation errors
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

  async _callScoringService(transaction, ruleResults, log) {
    // ─── FIXED: Normalize transaction data ───────────────────────────────────
    const normalizedTransaction = {
      id: transaction.id,
      customerId: transaction.customerId,
      merchantId: transaction.merchantId || 'unknown',
      amount: parseFloat(transaction.amount),
      currency: transaction.currency || 'USD',
      cardType: transaction.cardType || 'unknown',
      deviceId: transaction.deviceId || null,
      ipAddress: transaction.ipAddress || null,
      location: transaction.location || {},
      metadata: transaction.metadata || {},
      createdAt: transaction.createdAt || new Date().toISOString(),
    };

    // ─── FIXED: Normalize rule results ──────────────────────────────────────
    const normalizedRuleResults = {
      flagged: Boolean(ruleResults.flagged),
      ruleScore: ruleResults.ruleScore || 0,
      reasons: Array.isArray(ruleResults.reasons) ? ruleResults.reasons : [],
      riskFactors: ruleResults.riskFactors || {},
    };

    log.debug('Calling ML scoring service', {
      transactionId: normalizedTransaction.id,
      url: `${config.mlScoring.url}/api/v1/score`,
    });

    const response = await this.httpClient.post('/api/v1/score', {
      transaction: normalizedTransaction,
      ruleResults: normalizedRuleResults,
    });

    const { data } = response;

    if (!data || !data.success || !data.data) {
      throw new Error(`Invalid ML scoring response format: ${JSON.stringify(data)}`);
    }

    const mlData = data.data;

    if (typeof mlData.score !== 'number' || mlData.score < 0 || mlData.score > 100) {
      throw new Error(`Invalid ML score: ${mlData.score}`);
    }

    return {
      score: mlData.score,
      modelVersion: mlData.modelVersion || 'unknown',
      features: mlData.features || {},
      confidence: mlData.confidence || null,
    };
  }

  _fallback(ruleResults, reason) {
    let score = 30;

    if (ruleResults.flagged) {
      score += 40;
    }

    if (ruleResults.reasons?.length) {
      score += Math.min(ruleResults.reasons.length * 5, 20);
    }

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

  getCircuitBreakerStats() {
    return circuitBreaker.getStats();
  }
}

module.exports = new MLScoringClient();