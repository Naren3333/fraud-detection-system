const config = require('../config');
const logger = require('../config/logger');
const { getClient } = require('../config/redis');
const {
  ruleEvaluationsTotal,
  ruleEvaluationDuration,
  errorsTotal,
} = require('../metrics');

class FraudRulesEngine {
  /**
   * Run all fraud detection rules against a transaction.
   *
   * Returns:
   *   flagged     {boolean}   — true if any hard-flag rule triggered
   *   ruleScore   {number}    — graduated 0–100 risk contribution from rules
   *   reasons     {string[]}  — human-readable descriptions of triggered rules
   *   riskFactors {object}    — raw factor data per rule for audit trail
   */
  async evaluate(transaction, childLogger) {
    const log = childLogger || logger;
    const startTime = Date.now();
    const riskFactors = {};
    const reasons = [];
    let totalRuleScore = 0;
    let flagged = false;

    try {
      const [velocityResult, geoResult, amountResult, cardResult, timeResult] =
        await Promise.allSettled([
          this._checkVelocity(transaction, log),
          Promise.resolve(this._checkGeography(transaction)),
          Promise.resolve(this._checkAmount(transaction)),
          Promise.resolve(this._checkCard(transaction)),
          Promise.resolve(this._checkTime(transaction)),
        ]);

      const results = [
        { name: 'velocity', result: velocityResult },
        { name: 'geography', result: geoResult },
        { name: 'amount', result: amountResult },
        { name: 'card', result: cardResult },
        { name: 'time', result: timeResult },
      ];

      for (const { name, result } of results) {
        if (result.status === 'rejected') {
          log.error(`Rule [${name}] threw an exception`, {
            transactionId: transaction.id,
            error: result.reason?.message,
          });
          errorsTotal.inc({ component: `rule_${name}`, type: 'exception' });
          ruleEvaluationsTotal.inc({ rule: name, triggered: 'error' });
          continue;
        }

        const r = result.value;
        ruleEvaluationsTotal.inc({ rule: name, triggered: r.flagged ? 'true' : 'false' });

        if (r.flagged) {
          flagged = true;
          reasons.push(...r.reasons);
        }

        if (r.factors) {
          riskFactors[name] = r.factors;
        }

        totalRuleScore += r.score || 0;
      }

      // Normalise rule score to 0–100
      const ruleScore = Math.min(Math.round(totalRuleScore), 100);
      const durationMs = Date.now() - startTime;

      ruleEvaluationDuration.observe({ flagged: flagged ? 'true' : 'false' }, durationMs);

      log.info('Fraud rules evaluated', {
        transactionId: transaction.id,
        flagged,
        ruleScore,
        reasonCount: reasons.length,
        durationMs,
      });

      return { flagged, ruleScore, reasons, riskFactors };
    } catch (error) {
      log.error('Fraud rules evaluation critically failed', {
        transactionId: transaction.id,
        error: error.message,
        stack: error.stack,
      });
      errorsTotal.inc({ component: 'rules_engine', type: 'critical' });

      // Fail open - do not block legitimate transactions on evaluation error
      return { flagged: false, ruleScore: 0, reasons: ['evaluation_error'], riskFactors: {} };
    }
  }

  // Velocity Check

  async _checkVelocity(transaction, log) {
    const redis = getClient();
    const { customerId, amount } = transaction;
    const weights = config.fraudRules.scoring;

    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const reasons = [];
    const factors = {};
    let flagged = false;
    let score = 0;

    // --- Hourly count ---
    const customerHourKey = `velocity:customer:${customerId}:hour`;
    await redis.zRemRangeByScore(customerHourKey, 0, oneHourAgo);
    await redis.zAdd(customerHourKey, { score: now, value: transaction.id });
    await redis.expire(customerHourKey, 3600);
    const customerHourCount = await redis.zCard(customerHourKey);
    factors.customerTransactionsLastHour = customerHourCount;

    const maxCountPerHour = config.fraudRules.velocity.maxCountPerHour;
    if (customerHourCount > maxCountPerHour) {
      flagged = true;
      score += weights.velocityCountHourWeight;
      // Scale up proportionally the further over threshold we are
      const overage = (customerHourCount - maxCountPerHour) / maxCountPerHour;
      score += Math.min(weights.velocityCountHourWeight * overage, weights.velocityCountHourWeight);
      reasons.push(
        `Exceeded hourly transaction count (${customerHourCount}/${maxCountPerHour})`
      );
    }

    // --- Hourly amount ---
    const customerAmountKey = `velocity:customer:${customerId}:amount:hour`;
    const currentAmount = parseFloat((await redis.get(customerAmountKey)) || '0');
    const newAmount = currentAmount + amount;
    await redis.set(customerAmountKey, newAmount.toString(), { EX: 3600 });
    factors.customerAmountLastHour = newAmount;

    const maxAmountPerHour = config.fraudRules.velocity.maxAmountPerHour;
    if (newAmount > maxAmountPerHour) {
      flagged = true;
      score += weights.velocityAmountHourWeight;
      reasons.push(
        `Exceeded hourly spend limit ($${newAmount.toFixed(2)}/$${maxAmountPerHour})`
      );
    }

    // --- Daily count ---
    const customerDayKey = `velocity:customer:${customerId}:day`;
    await redis.zRemRangeByScore(customerDayKey, 0, oneDayAgo);
    await redis.zAdd(customerDayKey, { score: now, value: transaction.id });
    await redis.expire(customerDayKey, 86400);
    const customerDayCount = await redis.zCard(customerDayKey);
    factors.customerTransactionsLastDay = customerDayCount;

    const maxCountPerDay = config.fraudRules.velocity.maxCountPerDay;
    if (customerDayCount > maxCountPerDay) {
      flagged = true;
      score += weights.velocityCountDayWeight;
      reasons.push(
        `Exceeded daily transaction count (${customerDayCount}/${maxCountPerDay})`
      );
    }

    return { flagged, score, reasons, factors };
  }

  // Geography Check

  _checkGeography(transaction) {
    const { location } = transaction;
    const reasons = [];
    const factors = {};
    let flagged = false;
    let score = 0;

    if (!location?.country) {
      return { flagged, score, reasons, factors };
    }

    const country = location.country.toUpperCase();
    factors.country = country;

    if (config.fraudRules.geographic.highRiskCountries.includes(country)) {
      flagged = true;
      score += config.fraudRules.scoring.highRiskCountryWeight;
      reasons.push(`Transaction originates from high-risk country: ${country}`);
    }

    return { flagged, score, reasons, factors };
  }

  // Amount Check 

  _checkAmount(transaction) {
    const { amount, currency } = transaction;
    const reasons = [];
    const factors = { amount, currency };
    let flagged = false;
    let score = 0;
    const weights = config.fraudRules.scoring;
    const { suspiciousAmountThreshold, highAmountThreshold } = config.fraudRules.amounts;

    if (amount >= suspiciousAmountThreshold) {
      flagged = true;
      score += weights.suspiciousAmountWeight;
      reasons.push(`Amount $${amount} exceeds suspicious threshold ($${suspiciousAmountThreshold})`);
      factors.suspicious = true;
    } else if (amount >= highAmountThreshold) {
      score += weights.highAmountWeight;
      factors.highAmount = true;
      // Not a hard flag - contributes to score but doesn't flag alone
    }

    // Round-number heuristic (e.g. $1000.00, $5000.00)
    if (amount >= 100 && amount % 100 === 0) {
      score += weights.roundAmountWeight;
      factors.roundAmount = true;
    }

    return { flagged, score, reasons, factors };
  }

  // Card Check 

  _checkCard(transaction) {
    const { cardBin, cardLastFour, cardType } = transaction;
    const reasons = [];
    const factors = { cardLastFour, cardType };
    let flagged = false;
    let score = 0;

    if (cardBin && config.fraudRules.cards.binBlacklist.length > 0) {
      factors.binCheckApplied = true;
      if (config.fraudRules.cards.binBlacklist.includes(cardBin)) {
        flagged = true;
        score += config.fraudRules.scoring.binBlacklistWeight;
        reasons.push(`Card BIN ${cardBin} is on the blacklist`);
        factors.binBlacklisted = true;
      }
    }

    return { flagged, score, reasons, factors };
  }


  _checkTime(transaction) {
    const { createdAt } = transaction;
    const reasons = [];
    const factors = {};
    let flagged = false;
    let score = 0;

    const hour = new Date(createdAt).getUTCHours();
    factors.transactionHourUTC = hour;

    // 02:00–05:00 UTC - elevated risk window
    if (hour >= 2 && hour < 5) {
      score += config.fraudRules.scoring.unusualTimeWeight;
      factors.unusualTime = true;
      // Soft signal - contributes to score but does not hard-flag alone
    }

    return { flagged, score, reasons, factors };
  }
}

module.exports = new FraudRulesEngine();