const fs = require('fs');
const path = require('path');

const config = require('../config');
const logger = require('../config/logger');

class FraudModel {
  constructor() {
    this.modelVersion = config.model.version;
    this.modelType = 'logistic_regression';
    this.isLoaded = false;
    this.weights = {};
    this.intercept = 0;
    this.featureNames = [];
    this.normalizer = { mean: {}, std: {} };
    this.threshold = 0.5;
    this.featureImportance = [];
    this.loadedArtifactPath = null;
    this.loadedAt = null;

    this._loadModel();
  }

  _resolveArtifactPath() {
    const configured = config.model.artifactPath;
    if (!configured) {
      return path.resolve(__dirname, '..', '..', 'data', 'models', 'latest', 'model.json');
    }

    if (path.isAbsolute(configured)) return configured;
    return path.resolve(__dirname, '..', '..', configured);
  }

  _loadModel() {
    const artifactPath = this._resolveArtifactPath();

    try {
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Model artifact not found at ${artifactPath}. Run: node scripts/trainOfflineModel.js`);
      }

      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      if (!artifact.weights || typeof artifact.intercept !== 'number') {
        throw new Error('Invalid model artifact format: missing weights/intercept');
      }

      this.weights = artifact.weights;
      this.intercept = artifact.intercept;
      this.featureNames = Array.isArray(artifact.featureNames) ? artifact.featureNames : Object.keys(artifact.weights);
      this.normalizer = artifact.normalizer || { mean: {}, std: {} };
      this.threshold = typeof artifact.threshold === 'number' ? artifact.threshold : 0.5;
      this.modelVersion = artifact.modelVersion || config.model.version;
      this.modelType = artifact.modelType || 'logistic_regression';
      this.loadedArtifactPath = artifactPath;
      this.loadedAt = new Date().toISOString();

      this.featureImportance = Object.entries(this.weights)
        .map(([feature, weight]) => ({ feature, importance: Math.abs(weight) }))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);

      this.isLoaded = true;

      logger.info('ML model artifact loaded', {
        modelVersion: this.modelVersion,
        modelType: this.modelType,
        featureCount: this.featureNames.length,
        threshold: this.threshold,
        artifactPath: artifactPath,
      });
    } catch (error) {
      this.isLoaded = false;
      logger.error('Failed to load ML artifact', {
        error: error.message,
        artifactPath,
      });
      throw error;
    }
  }

  _normalize(feature, value) {
    const mean = this.normalizer.mean?.[feature] ?? 0;
    const std = this.normalizer.std?.[feature] ?? 1;
    const safeStd = Math.abs(std) < 1e-9 ? 1 : std;
    return (value - mean) / safeStd;
  }

  predict(features) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded');
    }

    try {
      let logit = this.intercept;
      let matchedFeatures = 0;

      for (const featureName of this.featureNames) {
        if (this.weights[featureName] === undefined) continue;
        const raw = Number(features[featureName] ?? 0);
        const value = Number.isFinite(raw) ? raw : 0;
        const normalized = this._normalize(featureName, value);
        logit += this.weights[featureName] * normalized;

        if (features[featureName] !== undefined) matchedFeatures++;
      }

      const probability = this._sigmoid(logit);
      const score = Math.round(probability * 100);
      const confidence = Math.min(1, Math.abs(probability - 0.5) * 2);

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

  explain(features, prediction) {
    const contributions = [];

    for (const featureName of this.featureNames) {
      if (this.weights[featureName] === undefined) continue;

      const raw = Number(features[featureName] ?? 0);
      const value = Number.isFinite(raw) ? raw : 0;
      const normalized = this._normalize(featureName, value);
      const weight = this.weights[featureName];
      const contribution = weight * normalized;

      if (Math.abs(contribution) < 1e-6) continue;

      contributions.push({
        feature: featureName,
        value,
        normalized,
        weight,
        contribution,
        impact: contribution > 0 ? 'increases_risk' : 'decreases_risk',
      });
    }

    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return {
      topContributors: contributions.slice(0, 10),
      totalContributions: contributions.length,
      explanation: this._generateExplanation(contributions.slice(0, 5), prediction),
    };
  }

  getMetadata() {
    return {
      modelVersion: this.modelVersion,
      modelType: this.modelType,
      featureCount: this.featureNames.length,
      isLoaded: this.isLoaded,
      threshold: this.threshold,
      topFeatures: this.featureImportance,
      artifactPath: this.loadedArtifactPath,
      lastLoadedAt: this.loadedAt,
    };
  }

  _sigmoid(x) {
    if (x >= 0) {
      const z = Math.exp(-x);
      return 1 / (1 + z);
    }

    const z = Math.exp(x);
    return z / (1 + z);
  }

  _generateExplanation(topContributions, prediction) {
    const reasons = [];

    for (const contrib of topContributions) {
      if (contrib.contribution <= 0) continue;
      if (contrib.feature.includes('velocity')) reasons.push('High transaction velocity detected');
      else if (contrib.feature.includes('rules')) reasons.push('Rule-based risk indicators are strong');
      else if (contrib.feature.includes('amount')) reasons.push('Amount pattern increases fraud risk');
      else if (contrib.feature.includes('country') || contrib.feature.includes('geo')) reasons.push('Geographic risk factors present');
      else if (contrib.feature.includes('time') || contrib.feature.includes('night') || contrib.feature.includes('hour')) reasons.push('Transaction timing is unusual');
    }

    if (!reasons.length) {
      reasons.push(prediction.score >= 50 ? 'Moderate fraud signals detected' : 'Low fraud signals detected');
    }

    return reasons;
  }
}

module.exports = new FraudModel();
