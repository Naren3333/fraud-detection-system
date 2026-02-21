const config = require('../config');
const logger = require('../config/logger');
const fraudRulesEngine = require('../rules/fraudRulesEngine');
const mlScoringClient = require('./mlScoringClient');
const {
  transactionsProcessedTotal,
  transactionProcessingDuration,
  riskScoreDistribution,
  errorsTotal,
} = require('../metrics');

const ANALYSIS_VERSION = '2.0.0';

class FraudDetectionService {
  /**
   * Main fraud detection pipeline:
   *  1. Rule-based evaluation (parallel rules, graduated scores)
   *  2. ML risk scoring (with circuit breaker + fallback)
   *  3. Weighted combination with configurable thresholds
   */
  async analyzeTransaction(transaction, correlationId) {
    const startTime = Date.now();

    // Per-transaction child logger carries correlationId through all downstream calls
    const log = logger.child({
      transactionId: transaction.id,
      customerId: transaction.customerId,
      correlationId,
    });

    log.info('Starting fraud analysis', {
      amount: transaction.amount,
      currency: transaction.currency,
      merchantId: transaction.merchantId,
    });

    try {
      // Step 1: Rule-based detection (runs all rules in parallel internally)
      const ruleResults = await fraudRulesEngine.evaluate(transaction, log);

      // Step 2: ML risk scoring (circuit-breaker protected, falls back gracefully)
      const mlResults = await mlScoringClient.getScore(transaction, ruleResults, log);

      // Step 3: Combine into final assessment
      const combined = this._combineResults(transaction, ruleResults, mlResults);

      const durationMs = Date.now() - startTime;

      // Metrics
      transactionsProcessedTotal.inc({
        status: 'success',
        flagged: combined.flagged ? 'true' : 'false',
      });
      transactionProcessingDuration.observe({ status: 'success' }, durationMs);
      riskScoreDistribution.observe({ source: 'combined' }, combined.riskScore);
      riskScoreDistribution.observe({ source: 'rules' }, ruleResults.ruleScore);
      riskScoreDistribution.observe({ source: 'ml' }, mlResults.score);

      log.info('Fraud analysis completed', {
        riskScore: combined.riskScore,
        flagged: combined.flagged,
        ruleScore: ruleResults.ruleScore,
        mlScore: mlResults.score,
        mlModelVersion: mlResults.modelVersion,
        durationMs,
      });

      return combined;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      transactionsProcessedTotal.inc({ status: 'error', flagged: 'false' });
      transactionProcessingDuration.observe({ status: 'error' }, durationMs);
      errorsTotal.inc({ component: 'fraud_detection_service', type: 'analysis_failure' });

      log.error('Fraud analysis failed - returning safe defaults', {
        error: error.message,
        stack: error.stack,
        durationMs,
      });

      // Safe defaults: neutral score, not flagged, so we don't block the transaction
      return this._safeDefault(transaction, error.message);
    }
  }

  // Result Combination

  /**
   * Weighted combination of rule and ML scores.
   *
   * Formula:  combinedScore = (ruleScore * rulesWeight) + (mlScore * mlWeight)
   *
   * Flagged if:
   *   - Rules engine hard-flagged the transaction, OR
   *   - ML score exceeds mlFlagThreshold
   */
  _combineResults(transaction, ruleResults, mlResults) {
    // FIX: config is now a direct require at the top of the file.
    // Previously it was a lazy function `const config = () => require('../config')`
    // defined AFTER the class body - confusing, unnecessary, and fragile.
    const { rulesWeight, mlWeight, mlFlagThreshold } = config.fraudRules.combination;

    const combinedScore = Math.round(
      ruleResults.ruleScore * rulesWeight + mlResults.score * mlWeight
    );

    const finalFlagged = ruleResults.flagged || mlResults.score > mlFlagThreshold;

    // Merge rule reasons and any ML-provided reasons
    const allReasons = [...ruleResults.reasons];
    if (mlResults.score > mlFlagThreshold) {
      allReasons.push(`ML model score ${mlResults.score} exceeds threshold (${mlFlagThreshold})`);
    }

    return {
      // Identity
      transactionId: transaction.id,
      customerId: transaction.customerId,
      merchantId: transaction.merchantId,
      amount: transaction.amount,
      currency: transaction.currency,

      // Risk assessment
      riskScore: combinedScore,
      flagged: finalFlagged,
      reasons: allReasons,

      // Full audit trail for downstream consumers / compliance
      ruleResults: {
        flagged: ruleResults.flagged,
        ruleScore: ruleResults.ruleScore,
        reasons: ruleResults.reasons,
        riskFactors: ruleResults.riskFactors,
      },
      mlResults: {
        score: mlResults.score,
        modelVersion: mlResults.modelVersion,
        confidence: mlResults.confidence ?? null,
        features: mlResults.features,
        isFallback: mlResults.modelVersion === 'fallback-v1',
      },

      // Metadata
      analyzedAt: new Date().toISOString(),
      analysisVersion: ANALYSIS_VERSION,
    };
  }

  _safeDefault(transaction, errorMessage) {
    return {
      transactionId: transaction.id,
      customerId: transaction.customerId,
      merchantId: transaction.merchantId,
      amount: transaction.amount,
      currency: transaction.currency,
      riskScore: 50,
      flagged: false,
      reasons: ['analysis_error'],
      ruleResults: { flagged: false, ruleScore: 0, reasons: [], riskFactors: {} },
      mlResults: {
        score: 50,
        modelVersion: 'error',
        confidence: null,
        features: {},
        isFallback: true,
      },
      analysisError: errorMessage,
      analyzedAt: new Date().toISOString(),
      analysisVersion: ANALYSIS_VERSION,
    };
  }
}

module.exports = new FraudDetectionService();
