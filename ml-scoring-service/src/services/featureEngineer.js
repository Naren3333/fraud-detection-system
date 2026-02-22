const config = require('../config');
const logger = require('../config/logger');

/**
 * Enterprise-grade feature engineering for fraud detection ML model.
 * Transforms raw transaction + rule data into normalized model features.
 */
class FeatureEngineer {
  constructor() {
    this.featureVersion = '2.1.0';
  }

  /**
   * Extract and normalize all features from transaction + rule results.
   * Returns: { features: {...}, featureVector: number[], featureNames: string[] }
   */
  extract(transaction, ruleResults) {
    const features = {};

    // ─── Transaction Features ────────────────────────────────────────────────
    features.amount = parseFloat(transaction.amount) || 0;
    features.amount_log = Math.log10(Math.max(features.amount, 0.01));
    features.amount_bin = this._binAmount(features.amount);
    features.amount_is_round = features.amount >= 100 && features.amount % 100 === 0 ? 1 : 0;

    features.currency_usd = transaction.currency === 'USD' ? 1 : 0;
    features.currency_eur = transaction.currency === 'EUR' ? 1 : 0;
    features.currency_gbp = transaction.currency === 'GBP' ? 1 : 0;

    // ─── Temporal Features ───────────────────────────────────────────────────
    const timestamp = new Date(transaction.createdAt);
    features.hour_of_day = timestamp.getUTCHours();
    features.day_of_week = timestamp.getUTCDay(); // 0=Sunday, 6=Saturday
    features.is_weekend = features.day_of_week === 0 || features.day_of_week === 6 ? 1 : 0;
    features.is_night = (features.hour_of_day >= 0 && features.hour_of_day < 6) ? 1 : 0;
    features.hour_bin = this._binHour(features.hour_of_day);

    // ─── Card Features ───────────────────────────────────────────────────────
    features.card_type_visa = transaction.cardType === 'visa' ? 1 : 0;
    features.card_type_mastercard = transaction.cardType === 'mastercard' ? 1 : 0;
    features.card_type_amex = transaction.cardType === 'amex' ? 1 : 0;

    // ─── Geographic Features ─────────────────────────────────────────────────
    const country = transaction.location?.country?.toUpperCase() || 'UNKNOWN';
    features.country_risk = this._getCountryRiskScore(country);
    features.country_sg = country === 'SG' ? 1 : 0;
    features.country_us = country === 'US' ? 1 : 0;
    features.country_gb = country === 'GB' ? 1 : 0;

    // ─── Rule-Based Features (from fraud detection service) ─────────────────
    features.rules_flagged = ruleResults.flagged ? 1 : 0;
    const rawRuleScore = ruleResults.ruleScore || 0;
    const rawRuleReasonCount = ruleResults.reasons?.length || 0;
    // Keep rule-derived continuous features in bounded ranges for stable model output.
    features.rules_score = Math.min(rawRuleScore / 100, 1);
    features.rules_reason_count = Math.min(rawRuleReasonCount / 10, 1);

    // Velocity features from rules
    const velocityFactors = ruleResults.riskFactors?.velocity || {};
    const rawVelocityTxnHour = velocityFactors.customerTransactionsLastHour || 0;
    const rawVelocityAmountHour = velocityFactors.customerAmountLastHour || 0;
    const rawVelocityTxnDay = velocityFactors.customerTransactionsLastDay || 0;

    // Normalize raw velocity magnitudes to 0-1 to avoid overpowering the model logit.
    features.velocity_txn_hour = Math.min(rawVelocityTxnHour / 10, 1);
    features.velocity_amount_hour = Math.min(rawVelocityAmountHour / 10000, 1);
    features.velocity_txn_day = Math.min(rawVelocityTxnDay / 50, 1);

    // Normalize velocity features with decay function
    features.velocity_txn_hour_norm = this._normalizeVelocity(rawVelocityTxnHour, 10);
    features.velocity_amount_hour_norm = this._normalizeVelocity(rawVelocityAmountHour, 10000);
    features.velocity_txn_day_norm = this._normalizeVelocity(rawVelocityTxnDay, 50);

    // Geography risk from rules
    const geoFactors = ruleResults.riskFactors?.geography || {};
    features.geo_high_risk = geoFactors.country && config.fraudRules?.geographic?.highRiskCountries?.includes(geoFactors.country) ? 1 : 0;

    // Amount patterns from rules
    const amountFactors = ruleResults.riskFactors?.amount || {};
    features.amount_suspicious = amountFactors.suspicious ? 1 : 0;
    features.amount_high = amountFactors.highAmount ? 1 : 0;

    // Time patterns from rules
    const timeFactors = ruleResults.riskFactors?.time || {};
    features.time_unusual = timeFactors.unusualTime ? 1 : 0;

    // ─── Interaction Features ────────────────────────────────────────────────
    features.amount_x_velocity = features.amount_log * features.velocity_txn_hour_norm;
    features.night_x_high_amount = features.is_night * features.amount_high;
    features.rules_x_velocity = features.rules_flagged * features.velocity_txn_hour_norm;

    // ─── Feature Vector (for model input) ───────────────────────────────────
    const featureNames = Object.keys(features).sort();
    const featureVector = featureNames.map((name) => features[name]);

    return {
      features,
      featureVector,
      featureNames,
      featureVersion: this.featureVersion,
      featureCount: featureNames.length,
    };
  }

  // ─── Binning Helpers ─────────────────────────────────────────────────────

  _binAmount(amount) {
    const bins = config.features.amountBins;
    for (let i = 0; i < bins.length; i++) {
      if (amount < bins[i]) return i;
    }
    return bins.length;
  }

  _binHour(hour) {
    const bins = config.features.hourBins;
    for (let i = 0; i < bins.length - 1; i++) {
      if (hour >= bins[i] && hour < bins[i + 1]) return i;
    }
    return bins.length - 1;
  }

  // ─── Risk Scoring Helpers ────────────────────────────────────────────────

  _getCountryRiskScore(country) {
    const highRiskCountries = ['NG', 'RU', 'CN', 'PK', 'VN', 'KP', 'IR'];
    const mediumRiskCountries = ['BR', 'IN', 'ID', 'PH', 'UA'];

    if (highRiskCountries.includes(country)) return 1.0;
    if (mediumRiskCountries.includes(country)) return 0.5;
    return 0.1; // Low risk
  }

  _normalizeVelocity(value, threshold) {
    // Sigmoid-like normalization: maps [0, infinity) to [0, 1]
    // Values at threshold map to ~0.5, values >> threshold approach 1
    const decay = config.features.velocityDecay;
    return 1 - Math.exp(-decay * value / threshold);
  }

  /**
   * Validate that all required features are present and within expected ranges.
   */
  validate(featureData) {
    const { features, featureCount } = featureData;

    if (featureCount < config.model.minFeaturesRequired) {
      throw new Error(`Insufficient features: ${featureCount} < ${config.model.minFeaturesRequired}`);
    }

    // Check for NaN/Infinity values
    for (const [key, value] of Object.entries(features)) {
      if (typeof value === 'number' && (!isFinite(value) || isNaN(value))) {
        throw new Error(`Invalid feature value: ${key} = ${value}`);
      }
    }

    return true;
  }
}

module.exports = new FeatureEngineer();
