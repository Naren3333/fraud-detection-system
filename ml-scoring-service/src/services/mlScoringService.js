const logger = require('../config/logger');
const config = require('../config');
const featureEngineer = require('./featureEngineer');
const fraudModel = require('../models/fraudModel');
const { getClient } = require('../config/redis');

/**
 * Enterprise ML Scoring Service
 * Orchestrates feature engineering, model inference, and result caching
 */
class MLScoringService {
  constructor() {
    this.requestCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Score a transaction with full feature engineering and model inference.
   * 
   * @param {object} transaction - Raw transaction data
   * @param {object} ruleResults - Results from fraud detection rules engine
   * @param {object} childLogger - Optional correlation-aware logger
   * @returns {object} - { score, probability, confidence, modelVersion, features, explanation }
   */
  async score(transaction, ruleResults, childLogger = null) {
    const log = childLogger || logger;
    const startTime = Date.now();
    this.requestCount++;

    const transactionId = transaction.id;
    const cacheKey = this._getCacheKey(transaction, ruleResults);

    try {
      // ─── Cache Check ───────────────────────────────────────────────────────
      const cached = await this._getFromCache(cacheKey);
      if (cached) {
        this.cacheHits++;
        log.info('ML score cache hit', {
          transactionId,
          score: cached.score,
          durationMs: Date.now() - startTime,
        });
        return cached;
      }

      this.cacheMisses++;

      // ─── Feature Engineering ───────────────────────────────────────────────
      log.debug('Extracting features', { transactionId });
      const featureData = featureEngineer.extract(transaction, ruleResults);
      featureEngineer.validate(featureData);

      log.debug('Features extracted', {
        transactionId,
        featureCount: featureData.featureCount,
        featureVersion: featureData.featureVersion,
      });

      // ─── Model Inference ───────────────────────────────────────────────────
      log.debug('Running model inference', { transactionId });
      const prediction = fraudModel.predict(featureData.features);

      // ─── Explainability ────────────────────────────────────────────────────
      const explanation = fraudModel.explain(featureData.features, prediction);

      // ─── Build Response ────────────────────────────────────────────────────
      const result = {
        score: prediction.score,
        probability: prediction.probability,
        confidence: prediction.confidence,
        modelVersion: fraudModel.modelVersion,
        features: featureData.features,
        featureVersion: featureData.featureVersion,
        explanation: {
          topContributors: explanation.topContributors,
          reasons: explanation.explanation,
        },
        metadata: {
          inferenceTimeMs: Date.now() - startTime,
          featureCount: featureData.featureCount,
          matchedFeatures: prediction.matchedFeatures,
        },
      };

      // ─── Cache Result ──────────────────────────────────────────────────────
      await this._saveToCache(cacheKey, result);

      const durationMs = Date.now() - startTime;

      log.info('ML score computed', {
        transactionId,
        score: result.score,
        probability: result.probability.toFixed(4),
        confidence: result.confidence.toFixed(2),
        durationMs,
        cached: false,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      log.error('ML scoring failed', {
        transactionId,
        error: error.message,
        stack: error.stack,
        durationMs,
      });

      throw error;
    }
  }

  /**
   * Batch scoring for multiple transactions (future enhancement)
   */
  async scoreBatch(transactions, ruleResultsArray) {
    if (transactions.length > config.performance.maxBatchSize) {
      throw new Error(`Batch size ${transactions.length} exceeds maximum ${config.performance.maxBatchSize}`);
    }

    const results = await Promise.all(
      transactions.map((txn, idx) => 
        this.score(txn, ruleResultsArray[idx]).catch(err => ({
          error: err.message,
          transactionId: txn.id,
        }))
      )
    );

    return results;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: this.requestCount > 0 
        ? (this.cacheHits / this.requestCount).toFixed(3)
        : 0,
      modelVersion: fraudModel.modelVersion,
      modelMetadata: fraudModel.getMetadata(),
    };
  }

  // ─── Cache Helpers ───────────────────────────────────────────────────────

  _getCacheKey(transaction, ruleResults) {
    // Hash of transaction ID + rules hash (for cache invalidation on rule changes)
    const rulesHash = this._hashRules(ruleResults);
    return `ml_score:${transaction.id}:${rulesHash}`;
  }

  _hashRules(ruleResults) {
    // Simple hash of rule results for cache key
    const parts = [
      ruleResults.flagged ? '1' : '0',
      ruleResults.ruleScore || 0,
      ruleResults.reasons?.length || 0,
    ];
    return parts.join(':');
  }

  async _getFromCache(key) {
    try {
      const redis = getClient();
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Cache read failed', { error: error.message });
    }
    return null;
  }

  async _saveToCache(key, result) {
    try {
      const redis = getClient();
      await redis.setEx(key, config.model.cacheTtl, JSON.stringify(result));
    } catch (error) {
      logger.warn('Cache write failed', { error: error.message });
    }
  }
}

module.exports = new MLScoringService();
