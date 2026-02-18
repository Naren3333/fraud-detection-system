const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

class MLScoringClient {
  /**
   * Call ML Scoring Service to get risk score (0-100)
   */
  async getScore(transaction, ruleResults) {
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${config.mlScoring.url}/api/v1/score`,
        {
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
          },
        },
        {
          timeout: config.mlScoring.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Source': config.serviceName,
          },
        }
      );

      const duration = Date.now() - startTime;

      if (response.data && typeof response.data.score === 'number') {
        logger.info('ML score received', {
          transactionId: transaction.id,
          score: response.data.score,
          durationMs: duration,
        });

        return {
          score: response.data.score,
          modelVersion: response.data.modelVersion || 'unknown',
          features: response.data.features || {},
        };
      }

      throw new Error('Invalid ML scoring response format');
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('ML scoring failed', {
        transactionId: transaction.id,
        error: error.message,
        code: error.code,
        durationMs: duration,
      });

      // Fallback: return a base score derived from rule-based flags
      const fallbackScore = this._calculateFallbackScore(ruleResults);
      
      logger.warn('Using fallback score', {
        transactionId: transaction.id,
        fallbackScore,
      });

      return {
        score: fallbackScore,
        modelVersion: 'fallback',
        features: { fallbackReason: error.message },
      };
    }
  }

  /**
   * Calculate fallback score based on rule flags
   * Score range: 0-100 (higher = more risky)
   */
  _calculateFallbackScore(ruleResults) {
    let score = 30; // Base score

    if (ruleResults.flagged) {
      score += 40; // Flagged transactions start at 70
    }

    // Add points for each reason
    score += Math.min(ruleResults.reasons.length * 5, 20);

    // Cap at 100
    return Math.min(score, 100);
  }
}

module.exports = new MLScoringClient();
