const { query } = require('../db/pool');

class ReviewRepository {
  // Handles upsert from flagged event.
  async upsertFromFlagged(event, sourceTopic = 'transaction.flagged') {
    const transactionId = event.transactionId;
    const customerId = event.customerId || event.originalTransaction?.customerId;
    const merchantId = event.merchantId || event.originalTransaction?.merchantId || null;
    const riskScore = event.fraudAnalysis?.riskScore ?? null;
    const decisionReason = event.decisionReason || 'Flagged for manual review';
    const correlationId = event.correlationId || null;

    const sql = `
      INSERT INTO manual_reviews (
        transaction_id, customer_id, merchant_id, source_topic,
        previous_decision, decision_reason, risk_score, payload, correlation_id
      ) VALUES (
        $1, $2, $3, $4,
        'FLAGGED', $5, $6, $7::jsonb, $8
      )
      ON CONFLICT (transaction_id) DO UPDATE SET
        decision_reason = EXCLUDED.decision_reason,
        risk_score = EXCLUDED.risk_score,
        payload = EXCLUDED.payload,
        correlation_id = EXCLUDED.correlation_id,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      transactionId,
      customerId,
      merchantId,
      sourceTopic,
      decisionReason,
      riskScore,
      JSON.stringify(event || {}),
      correlationId,
    ];

    const { rows } = await query(sql, values);
    return this._map(rows[0]);
  }

  // Handles list pending.
  async listPending(limit = 20, offset = 0) {
    const { rows } = await query(`
      SELECT *
      FROM manual_reviews
      WHERE queue_status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT $1 OFFSET $2;
    `, [limit, offset]);
    return rows.map((row) => this._map(row));
  }

  // Handles get by transaction id.
  async getByTransactionId(transactionId) {
    const { rows } = await query(`
      SELECT *
      FROM manual_reviews
      WHERE transaction_id = $1;
    `, [transactionId]);
    return rows[0] ? this._map(rows[0]) : null;
  }

  // Handles apply review decision.
  async applyReviewDecision(transactionId, decision, reviewedBy, reviewNotes) {
    const { rows } = await query(`
      UPDATE manual_reviews
      SET
        queue_status = 'REVIEWED',
        final_decision = $2,
        reviewed_by = $3,
        review_notes = $4,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE transaction_id = $1
      RETURNING *;
    `, [transactionId, decision, reviewedBy, reviewNotes || null]);
    return rows[0] ? this._map(rows[0]) : null;
  }

  // Handles map.
  _map(row) {
    return {
      reviewId: row.review_id,
      transactionId: row.transaction_id,
      customerId: row.customer_id,
      merchantId: row.merchant_id,
      queueStatus: row.queue_status,
      previousDecision: row.previous_decision,
      finalDecision: row.final_decision,
      decisionReason: row.decision_reason,
      riskScore: row.risk_score === null ? null : parseFloat(row.risk_score),
      payload: row.payload,
      reviewedBy: row.reviewed_by,
      reviewNotes: row.review_notes,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = new ReviewRepository();
