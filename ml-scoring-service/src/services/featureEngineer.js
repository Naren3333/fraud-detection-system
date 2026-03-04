const config = require('../config');
const logger = require('../config/logger');


class FeatureEngineer {
  constructor() {
    this.featureVersion = '2.1.0';
  }

  
  // Handles extract.
  extract(transaction, ruleResults) {
    const features = {};
    features.amount = parseFloat(transaction.amount) || 0;
    features.amount_log = Math.log10(Math.max(features.amount, 0.01));
    features.amount_bin = this._binAmount(features.amount);
    features.amount_is_round = features.amount >= 100 && features.amount % 100 === 0 ? 1 : 0;

    features.currency_usd = transaction.currency === 'USD' ? 1 : 0;
    features.currency_eur = transaction.currency === 'EUR' ? 1 : 0;
    features.currency_gbp = transaction.currency === 'GBP' ? 1 : 0;
    const timestamp = new Date(transaction.createdAt);
    features.hour_of_day = timestamp.getUTCHours();
    features.day_of_week = timestamp.getUTCDay();
    features.is_weekend = features.day_of_week === 0 || features.day_of_week === 6 ? 1 : 0;
    features.is_night = (features.hour_of_day >= 0 && features.hour_of_day < 6) ? 1 : 0;
    features.hour_bin = this._binHour(features.hour_of_day);
    features.card_type_visa = transaction.cardType === 'visa' ? 1 : 0;
    features.card_type_mastercard = transaction.cardType === 'mastercard' ? 1 : 0;
    features.card_type_amex = transaction.cardType === 'amex' ? 1 : 0;
    const country = transaction.location?.country?.toUpperCase() || 'UNKNOWN';
    features.country_risk = this._getCountryRiskScore(country);
    features.country_sg = country === 'SG' ? 1 : 0;
    features.country_us = country === 'US' ? 1 : 0;
    features.country_gb = country === 'GB' ? 1 : 0;
    features.rules_flagged = ruleResults.flagged ? 1 : 0;
    const rawRuleScore = ruleResults.ruleScore || 0;
    const rawRuleReasonCount = ruleResults.reasons?.length || 0;
    features.rules_score = Math.min(rawRuleScore / 100, 1);
    features.rules_reason_count = Math.min(rawRuleReasonCount / 10, 1);
    const velocityFactors = ruleResults.riskFactors?.velocity || {};
    const rawVelocityTxnHour = velocityFactors.customerTransactionsLastHour || 0;
    const rawVelocityAmountHour = velocityFactors.customerAmountLastHour || 0;
    const rawVelocityTxnDay = velocityFactors.customerTransactionsLastDay || 0;
    features.velocity_txn_hour = Math.min(rawVelocityTxnHour / 10, 1);
    features.velocity_amount_hour = Math.min(rawVelocityAmountHour / 10000, 1);
    features.velocity_txn_day = Math.min(rawVelocityTxnDay / 50, 1);
    features.velocity_txn_hour_norm = this._normalizeVelocity(rawVelocityTxnHour, 10);
    features.velocity_amount_hour_norm = this._normalizeVelocity(rawVelocityAmountHour, 10000);
    features.velocity_txn_day_norm = this._normalizeVelocity(rawVelocityTxnDay, 50);
    const geoFactors = ruleResults.riskFactors?.geography || {};
    const geoCountry = (geoFactors.country || country || '').toUpperCase();
    features.geo_high_risk = config.features.highRiskCountries.includes(geoCountry) ? 1 : 0;
    const amountFactors = ruleResults.riskFactors?.amount || {};
    features.amount_suspicious = amountFactors.suspicious ? 1 : 0;
    features.amount_high = amountFactors.highAmount ? 1 : 0;
    const timeFactors = ruleResults.riskFactors?.time || {};
    features.time_unusual = timeFactors.unusualTime ? 1 : 0;
    features.amount_x_velocity = features.amount_log * features.velocity_txn_hour_norm;
    features.night_x_high_amount = features.is_night * features.amount_high;
    features.rules_x_velocity = features.rules_flagged * features.velocity_txn_hour_norm;
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

  // Handles bin amount.
  _binAmount(amount) {
    const bins = config.features.amountBins;
    for (let i = 0; i < bins.length; i++) {
      if (amount < bins[i]) return i;
    }
    return bins.length;
  }

  // Handles bin hour.
  _binHour(hour) {
    const bins = config.features.hourBins;
    for (let i = 0; i < bins.length - 1; i++) {
      if (hour >= bins[i] && hour < bins[i + 1]) return i;
    }
    return bins.length - 1;
  }

  // Handles get country risk score.
  _getCountryRiskScore(country) {
    const highRiskCountries = ['NG', 'RU', 'CN', 'PK', 'VN', 'KP', 'IR'];
    const mediumRiskCountries = ['BR', 'IN', 'ID', 'PH', 'UA'];

    if (highRiskCountries.includes(country)) return 1.0;
    if (mediumRiskCountries.includes(country)) return 0.5;
    return 0.1;
  }

  // Handles normalize velocity.
  _normalizeVelocity(value, threshold) {
    const decay = config.features.velocityDecay;
    return 1 - Math.exp(-decay * value / threshold);
  }

  
  // Handles validate.
  validate(featureData) {
    const { features, featureCount } = featureData;

    if (featureCount < config.model.minFeaturesRequired) {
      throw new Error(`Insufficient features: ${featureCount} < ${config.model.minFeaturesRequired}`);
    }
    for (const [key, value] of Object.entries(features)) {
      if (typeof value === 'number' && (!isFinite(value) || isNaN(value))) {
        throw new Error(`Invalid feature value: ${key} = ${value}`);
      }
    }

    return true;
  }
}

module.exports = new FeatureEngineer();
