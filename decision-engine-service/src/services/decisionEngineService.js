const config = require('../config');
const logger = require('../config/logger');

/**
 * Enterprise Decision Engine
 * 
 * Applies multi-layered decision logic:
 * 1. Blacklist/whitelist overrides
 * 2. Threshold-based scoring
 * 3. Confidence-based adjustments
 * 4. Business rule overrides (high-value, geography, etc.)
 */
class DecisionEngineService {
  constructor() {
    this.decisionVersion = '1.0.0';
  }

  /**
   * Main decision pipeline
   * Returns: { decision, reason, factors, override }
   */
  makeDecision(fraudAnalysis, originalTransaction) {
    const log = logger.child({
      transactionId: fraudAnalysis.transactionId,
      customerId: fraudAnalysis.customerId,
    });

    log.info('Making decision', {
      riskScore: fraudAnalysis.riskScore,
      flagged: fraudAnalysis.flagged,
    });

    const decisionFactors = {};
    let decision = null;
    let reasons = [];
    let override = null;

    // ─── Step 1: Blacklist/Whitelist Overrides ──────────────────────────────
    const listOverride = this._checkLists(fraudAnalysis.customerId);
    if (listOverride) {
      decision = listOverride.decision;
      reasons.push(listOverride.reason);
      override = listOverride;
      decisionFactors.listOverride = true;
      
      log.info('List override applied', {
        decision,
        reason: listOverride.reason,
      });

      return this._buildDecisionResult(decision, reasons, decisionFactors, override);
    }

    // ─── Step 2: Rules Engine Hard Flags ────────────────────────────────────
    if (config.thresholds.rulesFlaggedAutoDecline && fraudAnalysis.ruleResults?.flagged) {
      decision = 'DECLINED';
      reasons.push('Rules engine flagged transaction');
      decisionFactors.rulesFlagged = true;

      log.info('Auto-declined by rules engine', {
        ruleReasons: fraudAnalysis.ruleResults.reasons,
      });

      return this._buildDecisionResult(decision, reasons, decisionFactors, null);
    }

    // ─── Step 3: High-Value Transaction Override ─────────────────────────────
    const highValueOverride = this._checkHighValue(originalTransaction);
    if (highValueOverride) {
      decision = highValueOverride.decision;
      reasons.push(highValueOverride.reason);
      decisionFactors.highValue = true;

      log.info('High-value override applied', {
        amount: originalTransaction.amount,
        decision,
      });

      return this._buildDecisionResult(decision, reasons, decisionFactors, highValueOverride);
    }

    // ─── Step 4: Geographic Risk Override ────────────────────────────────────
    const geoOverride = this._checkGeography(originalTransaction);
    if (geoOverride) {
      decision = geoOverride.decision;
      reasons.push(geoOverride.reason);
      decisionFactors.geographicRisk = true;

      log.info('Geographic override applied', {
        country: originalTransaction.location?.country,
        decision,
      });

      return this._buildDecisionResult(decision, reasons, decisionFactors, geoOverride);
    }

    // ─── Step 5: Confidence-Based Adjustments ────────────────────────────────
    const confidenceAdjustment = this._applyConfidenceAdjustment(
      fraudAnalysis.riskScore,
      fraudAnalysis.mlResults?.confidence
    );

    const adjustedScore = confidenceAdjustment.adjustedScore;
    decisionFactors.confidenceAdjustment = confidenceAdjustment;

    // ─── Step 6: Threshold-Based Decision ────────────────────────────────────
    if (adjustedScore <= config.thresholds.approveMax) {
      decision = 'APPROVED';
      reasons.push(`Risk score ${adjustedScore} below approval threshold (${config.thresholds.approveMax})`);
    } else if (adjustedScore >= config.thresholds.declineMin) {
      decision = 'DECLINED';
      reasons.push(`Risk score ${adjustedScore} exceeds decline threshold (${config.thresholds.declineMin})`);
    } else {
      decision = 'FLAGGED';
      reasons.push(`Risk score ${adjustedScore} in manual review range (${config.thresholds.flagMin}-${config.thresholds.flagMax})`);
    }

    decisionFactors.thresholdBased = true;
    decisionFactors.adjustedScore = adjustedScore;
    decisionFactors.originalScore = fraudAnalysis.riskScore;

    log.info('Decision made', {
      decision,
      originalScore: fraudAnalysis.riskScore,
      adjustedScore,
      confidence: fraudAnalysis.mlResults?.confidence,
    });

    return this._buildDecisionResult(decision, reasons, decisionFactors, override);
  }

  // ─── Override Checks ─────────────────────────────────────────────────────

  _checkLists(customerId) {
    // Whitelist (auto-approve)
    if (config.businessRules.autoApproveWhitelist.includes(customerId)) {
      return {
        decision: 'APPROVED',
        reason: 'Customer on auto-approve whitelist',
        type: 'WHITELIST',
      };
    }

    // Blacklist (auto-decline)
    if (config.businessRules.autoDeclineBlacklist.includes(customerId)) {
      return {
        decision: 'DECLINED',
        reason: 'Customer on auto-decline blacklist',
        type: 'BLACKLIST',
      };
    }

    return null;
  }

  _checkHighValue(transaction) {
    if (
      config.thresholds.highValueAutoFlag &&
      transaction.amount >= config.thresholds.highValueAmount
    ) {
      return {
        decision: 'FLAGGED',
        reason: `High-value transaction ($${transaction.amount}) requires manual review`,
        type: 'HIGH_VALUE',
      };
    }

    return null;
  }

  _checkGeography(transaction) {
    const country = transaction.location?.country?.toUpperCase();

    if (country && config.businessRules.requireManualReviewCountries.includes(country)) {
      return {
        decision: 'FLAGGED',
        reason: `Transaction from high-risk country (${country}) requires manual review`,
        type: 'GEOGRAPHIC_RISK',
      };
    }

    return null;
  }

  // ─── Confidence Adjustment ───────────────────────────────────────────────

  _applyConfidenceAdjustment(riskScore, confidence) {
    if (!confidence || typeof confidence !== 'number') {
      // No confidence data → no adjustment
      return {
        adjustedScore: riskScore,
        confidenceUsed: false,
        adjustment: 0,
      };
    }

    let adjustment = 0;

    // High confidence (>= 0.95) in a low score → approve more aggressively
    if (confidence >= config.thresholds.highConfidenceApprove && riskScore <= 60) {
      adjustment = -5; // Reduce score by 5 points
    }

    // Low confidence (< 0.60) → escalate to manual review
    if (confidence < config.thresholds.lowConfidenceFlag && riskScore >= 40) {
      adjustment = +10; // Increase score by 10 points
    }

    const adjustedScore = Math.max(0, Math.min(100, riskScore + adjustment));

    return {
      adjustedScore,
      confidenceUsed: true,
      adjustment,
      originalConfidence: confidence,
    };
  }

  // ─── Result Builder ──────────────────────────────────────────────────────

  _buildDecisionResult(decision, reasons, decisionFactors, override) {
    return {
      decision,
      decisionReason: reasons.join('; '),
      decisionFactors,
      overrideApplied: override !== null,
      overrideReason: override?.reason || null,
      overrideType: override?.type || null,
      decisionVersion: this.decisionVersion,
    };
  }

  /**
   * Get decision thresholds (for transparency/debugging)
   */
  getThresholds() {
    return {
      approve: { max: config.thresholds.approveMax },
      flag: { min: config.thresholds.flagMin, max: config.thresholds.flagMax },
      decline: { min: config.thresholds.declineMin },
      highValue: { amount: config.thresholds.highValueAmount },
      confidence: {
        highApprove: config.thresholds.highConfidenceApprove,
        lowFlag: config.thresholds.lowConfidenceFlag,
      },
    };
  }
}

module.exports = new DecisionEngineService();
