const { query, getClient } = require('../db/pool');
const logger = require('../config/logger');

class DecisionRepository {
  
  // Handles save decision.
  async saveDecision(decisionData) {
    const client = await getClient();

    try {
      await client.query('BEGIN');
      const decisionSql = `
        INSERT INTO decisions (
          transaction_id, customer_id, merchant_id,
          risk_score, ml_score, rule_score, fraud_flagged, confidence,
          decision, decision_reason, decision_factors,
          override_applied, override_reason, override_type,
          correlation_id, decision_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (transaction_id) DO UPDATE SET
          decision = EXCLUDED.decision,
          decision_reason = EXCLUDED.decision_reason,
          decided_at = NOW()
        RETURNING decision_id, decided_at
      `;

      const decisionValues = [
        decisionData.transactionId,
        decisionData.customerId,
        decisionData.merchantId,
        decisionData.riskScore,
        decisionData.mlScore,
        decisionData.ruleScore,
        decisionData.fraudFlagged,
        decisionData.confidence,
        decisionData.decision,
        decisionData.decisionReason,
        JSON.stringify(decisionData.decisionFactors),
        decisionData.overrideApplied || false,
        decisionData.overrideReason || null,
        decisionData.overrideType || null,
        decisionData.correlationId,
        decisionData.decisionVersion,
      ];

      const decisionResult = await client.query(decisionSql, decisionValues);
      const { decision_id, decided_at } = decisionResult.rows[0];
      const historySql = `
        INSERT INTO decision_history (
          decision_id, transaction_id,
          fraud_analysis, original_transaction,
          decision, decision_metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING history_id
      `;

      const historyValues = [
        decision_id,
        decisionData.transactionId,
        JSON.stringify(decisionData.fraudAnalysis),
        JSON.stringify(decisionData.originalTransaction),
        decisionData.decision,
        JSON.stringify(decisionData.decisionMetadata || {}),
      ];

      await client.query(historySql, historyValues);

      await client.query('COMMIT');

      logger.info('Decision saved', {
        decisionId: decision_id,
        transactionId: decisionData.transactionId,
        decision: decisionData.decision,
      });

      return { decisionId: decision_id, decidedAt: decided_at };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Failed to save decision', { error: err.message, stack: err.stack });
      throw err;
    } finally {
      client.release();
    }
  }

  
  // Handles find by transaction id.
  async findByTransactionId(transactionId) {
    const sql = `
      SELECT 
        decision_id, transaction_id, customer_id, merchant_id,
        risk_score, ml_score, rule_score, fraud_flagged, confidence,
        decision, decision_reason, decision_factors,
        override_applied, override_reason, override_type,
        decided_at, correlation_id, decision_version
      FROM decisions
      WHERE transaction_id = $1
    `;

    const result = await query(sql, [transactionId]);
    return result.rows[0] || null;
  }

  
  // Handles get stats.
  async getStats(since) {
    const sql = `
      SELECT 
        decision,
        COUNT(*) as count,
        AVG(risk_score) as avg_risk_score,
        MIN(decided_at) as earliest,
        MAX(decided_at) as latest
      FROM decisions
      WHERE decided_at >= $1
      GROUP BY decision
    `;

    const result = await query(sql, [since]);
    return result.rows;
  }
}

module.exports = new DecisionRepository();