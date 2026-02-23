const config = require('../config');
const logger = require('../config/logger');


class FraudModel {
  constructor() {
    this.modelVersion = config.model.version;
    this.isLoaded = false;
    this.weights = null;
    this.intercept = null;
    this.featureImportance = null;
    
    this._loadModel();
  }

  
  // Handles load model.
  _loadModel() {
    try {
      this.weights = {
        amount_log: 0.35,
        amount_bin: 0.12,
        amount_suspicious: 0.42,
        amount_high: 0.18,
        amount_is_round: 0.08,
        amount_x_velocity: 0.28,
        velocity_txn_hour_norm: 0.48,
        velocity_amount_hour_norm: 0.52,
        velocity_txn_day_norm: 0.31,
        velocity_txn_hour: 0.22,
        velocity_amount_hour: 0.25,
        velocity_txn_day: 0.15,
        rules_flagged: 0.55,
        rules_score: 0.38,
        rules_reason_count: 0.29,
        rules_x_velocity: 0.33,
        country_risk: 0.41,
        geo_high_risk: 0.47,
        country_sg: -0.15,
        country_us: -0.10,
        country_gb: -0.12,
        hour_of_day: 0.05,
        hour_bin: 0.09,
        is_night: 0.21,
        is_weekend: 0.07,
        time_unusual: 0.16,
        night_x_high_amount: 0.24,
        card_type_visa: -0.05,
        card_type_mastercard: -0.03,
        card_type_amex: 0.08,
        currency_usd: -0.04,
        currency_eur: -0.02,
        currency_gbp: -0.03,
        day_of_week: 0.02,
      };
      this.intercept = -2.94;
      this.featureImportance = Object.entries(this.weights)
        .map(([feature, weight]) => ({ feature, importance: Math.abs(weight) }))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);

      this.isLoaded = true;
      
      logger.info('ML model loaded successfully', {
        modelVersion: this.modelVersion,
        featureCount: Object.keys(this.weights).length,
        topFeatures: this.featureImportance.slice(0, 5).map(f => f.feature),
      });
    } catch (error) {
      logger.error('Failed to load ML model', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  
  // Handles predict.
  predict(features) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded');
    }

    try {
      let logit = this.intercept;
      let totalWeight = 0;
      let matchedFeatures = 0;

      for (const [feature, value] of Object.entries(features)) {
        if (this.weights[feature] !== undefined) {
          const weight = this.weights[feature];
          logit += weight * value;
          totalWeight += Math.abs(weight);
          matchedFeatures++;
        }
      }
      const probability = this._sigmoid(logit);
      const featureCoverage = matchedFeatures / Object.keys(this.weights).length;
      const confidence = Math.min(featureCoverage * 1.2, 1.0);
      const score = Math.round(probability * 100);

      return {
        score,
        probability,
        confidence,
        logit,
        matchedFeatures,
      };
    } catch (error) {
      logger.error('Model prediction failed', { error: error.message });
      throw error;
    }
  }

  
  // Handles explain.
  explain(features, prediction) {
    const contributions = [];

    for (const [feature, value] of Object.entries(features)) {
      if (this.weights[feature] !== undefined && value !== 0) {
        const weight = this.weights[feature];
        const contribution = weight * value;
        
        contributions.push({
          feature,
          value,
          weight,
          contribution,
          impact: contribution > 0 ? 'increases_risk' : 'decreases_risk',
        });
      }
    }
    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return {
      topContributors: contributions.slice(0, 10),
      totalContributions: contributions.length,
      explanation: this._generateExplanation(contributions.slice(0, 5)),
    };
  }

  
  // Handles get metadata.
  getMetadata() {
    return {
      modelVersion: this.modelVersion,
      modelType: 'gradient_boosted_trees_simulated',
      featureCount: Object.keys(this.weights || {}).length,
      isLoaded: this.isLoaded,
      topFeatures: this.featureImportance?.slice(0, 10),
      lastLoadedAt: new Date().toISOString(),
    };
  }

  // Handles sigmoid.
  _sigmoid(x) {
    if (x >= 0) {
      const z = Math.exp(-x);
      return 1 / (1 + z);
    } else {
      const z = Math.exp(x);
      return z / (1 + z);
    }
  }

  // Handles generate explanation.
  _generateExplanation(topContributions) {
    const reasons = [];

    for (const contrib of topContributions) {
      if (contrib.contribution > 0.1) {
        if (contrib.feature.includes('velocity')) {
          reasons.push(`High transaction velocity detected`);
        } else if (contrib.feature.includes('rules')) {
          reasons.push(`Fraud rules flagged the transaction`);
        } else if (contrib.feature.includes('amount')) {
          reasons.push(`Suspicious transaction amount pattern`);
        } else if (contrib.feature.includes('country') || contrib.feature.includes('geo')) {
          reasons.push(`Geographic risk factors present`);
        } else if (contrib.feature.includes('time') || contrib.feature.includes('night')) {
          reasons.push(`Unusual transaction timing`);
        }
      }
    }

    return reasons.length > 0 ? reasons : ['Standard risk assessment'];
  }
}

module.exports = new FraudModel();