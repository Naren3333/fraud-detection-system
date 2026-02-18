const logger = require('../config/logger');
const fraudRulesEngine = require('../rules/fraudRulesEngine');
const mlScoringClient = require('./mlScoringClient');

class FraudDetectionService {
  /**
   * Main fraud detection pipeline
   * 1. Run rule-based checks
   * 2. Call ML scoring service
   * 3. Combine results
   */
  async analyzeTransaction(transaction) {
    const startTime = Date.now();
    
    logger.info('Starting fraud analysis', {
      transactionId: transaction.id,
      customerId: transaction.customerId,
      amount: transaction.amount,
    });

    try {
      // Step 1: Rule-based fraud detection
      const ruleResults = await fraudRulesEngine.evaluate(transaction);

      // Step 2: ML-based risk scoring
      const mlResults = await mlScoringClient.getScore(transaction, ruleResults);

      // Step 3: Combine results
      const combinedResults = this._combineResults(transaction, ruleResults, mlResults);

      const duration = Date.now() - startTime;

      logger.info('Fraud analysis completed', {
        transactionId: transaction.id,
        finalScore: combinedResults.riskScore,
        flagged: combinedResults.flagged,
        durationMs: duration,
      });

      return combinedResults;
    } catch (error) {
      logger.error('Fraud analysis failed', {
        transactionId: transaction.id,
        error: error.message,
        stack: error.stack,
      });

      // Return safe defaults on error
      return {
        transactionId: transaction.id,
        riskScore: 50, // Neutral score
        flagged: false,
        reasons: ['analysis_error'],
        ruleResults: { flagged: false, reasons: [], riskFactors: {} },
        mlResults: { score: 50, modelVersion: 'error', features: {} },
        analysisError: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Combine rule-based and ML results into final risk assessment
   */
  _combineResults(transaction, ruleResults, mlResults) {
    // Weighted combination: 40% rules, 60% ML
    const ruleScore = ruleResults.flagged ? 80 : 20;
    const mlScore = mlResults.score;
    
    const combinedScore = Math.round(
      (ruleScore * 0.4) + (mlScore * 0.6)
    );

    // Final flagged status: either rules flagged OR ML score > 70
    const finalFlagged = ruleResults.flagged || mlScore > 70;

    return {
      transactionId: transaction.id,
      customerId: transaction.customerId,
      merchantId: transaction.merchantId,
      amount: transaction.amount,
      currency: transaction.currency,
      
      // Risk assessment
      riskScore: combinedScore,
      flagged: finalFlagged,
      reasons: ruleResults.reasons,
      
      // Detailed breakdown
      ruleResults: {
        flagged: ruleResults.flagged,
        reasons: ruleResults.reasons,
        riskFactors: ruleResults.riskFactors,
      },
      mlResults: {
        score: mlResults.score,
        modelVersion: mlResults.modelVersion,
        features: mlResults.features,
      },
      
      // Metadata
      analyzedAt: new Date().toISOString(),
      analysisVersion: '1.0.0',
    };
  }
}

module.exports = new FraudDetectionService();
