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
  
  // Handles analyze transaction.
  async analyzeTransaction(transaction, correlationId) {
    const startTime = Date.now();
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
      const ruleResults = await fraudRulesEngine.evaluate(transaction, log);
      const mlResults = await mlScoringClient.getScore(transaction, ruleResults, log);
      const combined = this._combineResults(transaction, ruleResults, mlResults);

      const durationMs = Date.now() - startTime;
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
      return this._safeDefault(transaction, error.message);
    }
  }

  
  // Handles combine results.
  _combineResults(transaction, ruleResults, mlResults) {
    const { rulesWeight, mlWeight, mlFlagThreshold } = config.fraudRules.combination;

    const combinedScore = Math.round(
      ruleResults.ruleScore * rulesWeight + mlResults.score * mlWeight
    );

    const finalFlagged = ruleResults.flagged || mlResults.score > mlFlagThreshold;
    const allReasons = [...ruleResults.reasons];
    if (mlResults.score > mlFlagThreshold) {
      allReasons.push(`ML model score ${mlResults.score} exceeds threshold (${mlFlagThreshold})`);
    }

    return {
      transactionId: transaction.id,
      customerId: transaction.customerId,
      merchantId: transaction.merchantId,
      amount: transaction.amount,
      currency: transaction.currency,
      riskScore: combinedScore,
      flagged: finalFlagged,
      reasons: allReasons,
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
      analyzedAt: new Date().toISOString(),
      analysisVersion: ANALYSIS_VERSION,
    };
  }

  // Handles safe default.
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