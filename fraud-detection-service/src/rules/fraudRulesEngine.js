const config = require('../config');
const logger = require('../config/logger');
const { getClient } = require('../config/redis');

class FraudRulesEngine {
  /**
   * Run all fraud detection rules on a transaction
   * Returns { flagged: boolean, reasons: string[], riskFactors: object }
   */
  async evaluate(transaction) {
    const riskFactors = {};
    const reasons = [];
    let flagged = false;

    try {
      // Rule 1: Velocity checks (transaction frequency)
      const velocityResult = await this._checkVelocity(transaction);
      if (velocityResult.flagged) {
        flagged = true;
        reasons.push(...velocityResult.reasons);
        riskFactors.velocity = velocityResult.factors;
      }

      // Rule 2: High-risk geography
      const geoResult = this._checkGeography(transaction);
      if (geoResult.flagged) {
        flagged = true;
        reasons.push(...geoResult.reasons);
        riskFactors.geography = geoResult.factors;
      }

      // Rule 3: Suspicious amounts
      const amountResult = this._checkAmount(transaction);
      if (amountResult.flagged) {
        flagged = true;
        reasons.push(...amountResult.reasons);
        riskFactors.amount = amountResult.factors;
      }

      // Rule 4: Card patterns (BIN blacklist, repeated failures)
      const cardResult = this._checkCard(transaction);
      if (cardResult.flagged) {
        flagged = true;
        reasons.push(...cardResult.reasons);
        riskFactors.card = cardResult.factors;
      }

      // Rule 5: Time-based anomalies (unusual transaction times)
      const timeResult = this._checkTime(transaction);
      if (timeResult.flagged) {
        flagged = true;
        reasons.push(...timeResult.reasons);
        riskFactors.time = timeResult.factors;
      }

      logger.info('Fraud rules evaluated', {
        transactionId: transaction.id,
        flagged,
        reasonCount: reasons.length,
      });

      return { flagged, reasons, riskFactors };
    } catch (error) {
      logger.error('Fraud rules evaluation failed', {
        transactionId: transaction.id,
        error: error.message,
      });
      // Return non-flagged on error (fail open to avoid blocking legitimate transactions)
      return { flagged: false, reasons: ['evaluation_error'], riskFactors: {} };
    }
  }

  /**
   * Velocity check: too many transactions in short time window
   */
  async _checkVelocity(transaction) {
    const redis = getClient();
    const { customerId, merchantId, amount } = transaction;
    
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const reasons = [];
    const factors = {};
    let flagged = false;

    try {
      // Count transactions per customer in last hour
      const customerHourKey = `velocity:customer:${customerId}:hour`;
      await redis.zRemRangeByScore(customerHourKey, 0, oneHourAgo);
      await redis.zAdd(customerHourKey, { score: now, value: transaction.id });
      await redis.expire(customerHourKey, 3600);
      
      const customerHourCount = await redis.zCard(customerHourKey);
      factors.customerTransactionsLastHour = customerHourCount;

      if (customerHourCount > config.fraudRules.velocity.maxCountPerHour) {
        flagged = true;
        reasons.push(`Customer exceeded ${config.fraudRules.velocity.maxCountPerHour} transactions per hour`);
      }

      // Sum transaction amounts per customer in last hour
      const customerAmountKey = `velocity:customer:${customerId}:amount:hour`;
      const currentAmount = await redis.get(customerAmountKey) || '0';
      const newAmount = parseFloat(currentAmount) + amount;
      await redis.set(customerAmountKey, newAmount.toString(), { EX: 3600 });
      
      factors.customerAmountLastHour = newAmount;

      if (newAmount > config.fraudRules.velocity.maxAmountPerHour) {
        flagged = true;
        reasons.push(`Customer exceeded $${config.fraudRules.velocity.maxAmountPerHour} in one hour`);
      }

      // Count transactions per customer in last day
      const customerDayKey = `velocity:customer:${customerId}:day`;
      await redis.zRemRangeByScore(customerDayKey, 0, oneDayAgo);
      await redis.zAdd(customerDayKey, { score: now, value: transaction.id });
      await redis.expire(customerDayKey, 86400);
      
      const customerDayCount = await redis.zCard(customerDayKey);
      factors.customerTransactionsLastDay = customerDayCount;

      if (customerDayCount > config.fraudRules.velocity.maxCountPerDay) {
        flagged = true;
        reasons.push(`Customer exceeded ${config.fraudRules.velocity.maxCountPerDay} transactions per day`);
      }

    } catch (error) {
      logger.error('Velocity check failed', { error: error.message });
    }

    return { flagged, reasons, factors };
  }

  /**
   * Geography check: high-risk countries
   */
  _checkGeography(transaction) {
    const { location } = transaction;
    const reasons = [];
    const factors = {};
    let flagged = false;

    if (!location || !location.country) {
      return { flagged, reasons, factors };
    }

    const country = location.country.toUpperCase();
    factors.country = country;

    if (config.fraudRules.geographic.highRiskCountries.includes(country)) {
      flagged = true;
      reasons.push(`Transaction from high-risk country: ${country}`);
    }

    return { flagged, reasons, factors };
  }

  /**
   * Amount check: suspiciously high or round amounts
   */
  _checkAmount(transaction) {
    const { amount, currency } = transaction;
    const reasons = [];
    const factors = { amount, currency };
    let flagged = false;

    // High amount check
    if (amount >= config.fraudRules.amounts.suspiciousAmountThreshold) {
      flagged = true;
      reasons.push(`Amount exceeds suspicious threshold ($${config.fraudRules.amounts.suspiciousAmountThreshold})`);
    } else if (amount >= config.fraudRules.amounts.highAmountThreshold) {
      // High but not suspicious - flag for review but not fraud
      factors.highAmount = true;
    }

    // Round amount check (e.g., exactly $1000.00, $5000.00)
    if (amount >= 100 && amount % 100 === 0) {
      factors.roundAmount = true;
      // Don't flag alone, but contributes to overall risk
    }

    return { flagged, reasons, factors };
  }

  /**
   * Card check: BIN blacklist, card patterns
   */
  _checkCard(transaction) {
    const { cardLastFour, cardType } = transaction;
    const reasons = [];
    const factors = { cardLastFour, cardType };
    let flagged = false;

    // BIN check (first 6 digits - we only have last 4, but this is a placeholder)
    // In production, you'd check the full BIN from the original transaction
    if (config.fraudRules.cards.binBlacklist.length > 0) {
      // This is a simplified check - in reality you'd need the full BIN
      factors.binCheckApplied = true;
    }

    return { flagged, reasons, factors };
  }

  /**
   * Time check: unusual transaction times (e.g., 3am local time)
   */
  _checkTime(transaction) {
    const { createdAt } = transaction;
    const reasons = [];
    const factors = {};
    let flagged = false;

    const hour = new Date(createdAt).getUTCHours();
    factors.transactionHourUTC = hour;

    // Transactions between 2am-5am UTC are slightly suspicious
    if (hour >= 2 && hour < 5) {
      factors.unusualTime = true;
      // Don't flag alone, but contributes to risk
    }

    return { flagged, reasons, factors };
  }
}

module.exports = new FraudRulesEngine();
