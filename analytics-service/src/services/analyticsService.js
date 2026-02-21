const { query } = require('../config/db');
const { getClient: getRedis } = require('../config/redis');
const logger = require('../config/logger');
const config = require('../config');

/**
 * Enterprise Analytics Service
 * Aggregates fraud detection metrics from PostgreSQL and caches in Redis
 */
class AnalyticsService {
  constructor() {
    this.metricsCache = new Map();
    this.lastAggregation = null;
  }

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(timeRange = '24h') {
    const now = new Date();
    const since = this._getTimeRangeDate(timeRange);

    const [
      overviewStats,
      decisionBreakdown,
      riskScoreDistribution,
      timeSeriesData,
      topCustomers,
      topMerchants,
      geographicDistribution,
    ] = await Promise.all([
      this._getOverviewStats(since),
      this._getDecisionBreakdown(since),
      this._getRiskScoreDistribution(since),
      this._getTimeSeriesData(timeRange),
      this._getTopCustomers(since, 10),
      this._getTopMerchants(since, 10),
      this._getGeographicDistribution(since),
    ]);

    return {
      overview: overviewStats,
      decisions: decisionBreakdown,
      riskScores: riskScoreDistribution,
      timeSeries: timeSeriesData,
      topCustomers,
      topMerchants,
      geography: geographicDistribution,
      metadata: {
        timeRange,
        since: since.toISOString(),
        generatedAt: now.toISOString(),
      },
    };
  }

  /**
   * Get real-time stats (last 5 minutes)
   */
  async getRealTimeStats() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const sql = `
      SELECT 
        COUNT(*) as total_decisions,
        COUNT(*) FILTER (WHERE decision = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE decision = 'DECLINED') as declined,
        COUNT(*) FILTER (WHERE decision = 'FLAGGED') as flagged,
        AVG(risk_score) as avg_risk_score,
        MAX(risk_score) as max_risk_score,
        COUNT(*) FILTER (WHERE override_applied = true) as overrides
      FROM decisions
      WHERE decided_at >= $1
    `;

    const result = await query(sql, [fiveMinutesAgo]);
    const stats = result.rows[0];

    return {
      totalDecisions: parseInt(stats.total_decisions) || 0,
      approved: parseInt(stats.approved) || 0,
      declined: parseInt(stats.declined) || 0,
      flagged: parseInt(stats.flagged) || 0,
      avgRiskScore: parseFloat(stats.avg_risk_score)?.toFixed(1) || 0,
      maxRiskScore: parseInt(stats.max_risk_score) || 0,
      overrides: parseInt(stats.overrides) || 0,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  async _getOverviewStats(since) {
    const sql = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE decision = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE decision = 'DECLINED') as declined,
        COUNT(*) FILTER (WHERE decision = 'FLAGGED') as flagged,
        AVG(risk_score) as avg_risk_score,
        AVG(ml_score) as avg_ml_score,
        AVG(rule_score) as avg_rule_score,
        COUNT(*) FILTER (WHERE fraud_flagged = true) as fraud_flagged_count,
        COUNT(*) FILTER (WHERE override_applied = true) as override_count,
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(DISTINCT merchant_id) as unique_merchants
      FROM decisions
      WHERE decided_at >= $1
    `;

    const result = await query(sql, [since]);
    const stats = result.rows[0];

    const total = parseInt(stats.total_transactions) || 0;
    const approved = parseInt(stats.approved) || 0;
    const declined = parseInt(stats.declined) || 0;
    const flagged = parseInt(stats.flagged) || 0;

    return {
      totalTransactions: total,
      approved,
      declined,
      flagged,
      approvalRate: total > 0 ? ((approved / total) * 100).toFixed(1) : 0,
      declineRate: total > 0 ? ((declined / total) * 100).toFixed(1) : 0,
      flagRate: total > 0 ? ((flagged / total) * 100).toFixed(1) : 0,
      avgRiskScore: parseFloat(stats.avg_risk_score)?.toFixed(1) || 0,
      avgMlScore: parseFloat(stats.avg_ml_score)?.toFixed(1) || 0,
      avgRuleScore: parseFloat(stats.avg_rule_score)?.toFixed(1) || 0,
      fraudFlaggedCount: parseInt(stats.fraud_flagged_count) || 0,
      overrideCount: parseInt(stats.override_count) || 0,
      uniqueCustomers: parseInt(stats.unique_customers) || 0,
      uniqueMerchants: parseInt(stats.unique_merchants) || 0,
    };
  }

  async _getDecisionBreakdown(since) {
    const sql = `
      SELECT 
        decision,
        COUNT(*) as count,
        AVG(risk_score) as avg_risk_score,
        MIN(risk_score) as min_risk_score,
        MAX(risk_score) as max_risk_score
      FROM decisions
      WHERE decided_at >= $1
      GROUP BY decision
    `;

    const result = await query(sql, [since]);
    
    return result.rows.map(row => ({
      decision: row.decision,
      count: parseInt(row.count),
      avgRiskScore: parseFloat(row.avg_risk_score)?.toFixed(1) || 0,
      minRiskScore: parseInt(row.min_risk_score) || 0,
      maxRiskScore: parseInt(row.max_risk_score) || 0,
    }));
  }

  async _getRiskScoreDistribution(since) {
    const sql = `
      SELECT 
        CASE 
          WHEN risk_score < 20 THEN '0-19'
          WHEN risk_score < 40 THEN '20-39'
          WHEN risk_score < 60 THEN '40-59'
          WHEN risk_score < 80 THEN '60-79'
          ELSE '80-100'
        END as score_range,
        COUNT(*) as count,
        decision
      FROM decisions
      WHERE decided_at >= $1
      GROUP BY score_range, decision
      ORDER BY score_range, decision
    `;

    const result = await query(sql, [since]);
    
    // Group by score range
    const distribution = {};
    for (const row of result.rows) {
      if (!distribution[row.score_range]) {
        distribution[row.score_range] = { range: row.score_range, total: 0 };
      }
      distribution[row.score_range][row.decision.toLowerCase()] = parseInt(row.count);
      distribution[row.score_range].total += parseInt(row.count);
    }

    return Object.values(distribution);
  }

  async _getTimeSeriesData(timeRange) {
    const bucketSeconds = timeRange === '1h' ? 5 * 60 :
      timeRange === '24h' ? 60 * 60 :
      timeRange === '7d' ? 6 * 60 * 60 :
      24 * 60 * 60;

    const since = this._getTimeRangeDate(timeRange);

    const sql = `
      SELECT 
        to_timestamp(floor(extract(epoch FROM decided_at) / $1) * $1) as time_bucket,
        decision,
        COUNT(*) as count,
        AVG(risk_score) as avg_risk_score
      FROM decisions
      WHERE decided_at >= $2
      GROUP BY time_bucket, decision
      ORDER BY time_bucket ASC
    `;

    const result = await query(sql, [bucketSeconds, since]);
    
    // Group by time bucket
    const timeSeries = {};
    for (const row of result.rows) {
      const bucket = new Date(row.time_bucket).toISOString();
      if (!timeSeries[bucket]) {
        timeSeries[bucket] = { timestamp: bucket, total: 0 };
      }
      timeSeries[bucket][row.decision.toLowerCase()] = parseInt(row.count);
      timeSeries[bucket].total += parseInt(row.count);
      timeSeries[bucket].avgRiskScore = parseFloat(row.avg_risk_score)?.toFixed(1) || 0;
    }

    return Object.values(timeSeries);
  }

  async _getTopCustomers(since, limit) {
    const sql = `
      SELECT 
        customer_id,
        COUNT(*) as transaction_count,
        COUNT(*) FILTER (WHERE decision = 'DECLINED') as declined_count,
        COUNT(*) FILTER (WHERE decision = 'FLAGGED') as flagged_count,
        AVG(risk_score) as avg_risk_score
      FROM decisions
      WHERE decided_at >= $1
      GROUP BY customer_id
      ORDER BY transaction_count DESC
      LIMIT $2
    `;

    const result = await query(sql, [since, limit]);
    
    return result.rows.map(row => ({
      customerId: row.customer_id,
      transactionCount: parseInt(row.transaction_count),
      declinedCount: parseInt(row.declined_count) || 0,
      flaggedCount: parseInt(row.flagged_count) || 0,
      avgRiskScore: parseFloat(row.avg_risk_score)?.toFixed(1) || 0,
    }));
  }

  async _getTopMerchants(since, limit) {
    const sql = `
      SELECT 
        merchant_id,
        COUNT(*) as transaction_count,
        COUNT(*) FILTER (WHERE decision = 'DECLINED') as declined_count,
        AVG(risk_score) as avg_risk_score
      FROM decisions
      WHERE decided_at >= $1 AND merchant_id IS NOT NULL
      GROUP BY merchant_id
      ORDER BY transaction_count DESC
      LIMIT $2
    `;

    const result = await query(sql, [since, limit]);
    
    return result.rows.map(row => ({
      merchantId: row.merchant_id,
      transactionCount: parseInt(row.transaction_count),
      declinedCount: parseInt(row.declined_count) || 0,
      avgRiskScore: parseFloat(row.avg_risk_score)?.toFixed(1) || 0,
    }));
  }

  async _getGeographicDistribution(since) {
    // This would require extracting country from decision_history.original_transaction JSONB
    // Simplified version for now
    return [
      { country: 'US', count: 0, declined: 0 },
      { country: 'GB', count: 0, declined: 0 },
      { country: 'SG', count: 0, declined: 0 },
    ];
  }

  _getTimeRangeDate(timeRange) {
    const now = new Date();
    switch (timeRange) {
      case '1h':
        return new Date(now.getTime() - 1 * 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}

module.exports = new AnalyticsService();
