const { query, withTransaction } = require('../db/pool');
const { v4: uuidv4 }  = require('uuid');
const logger          = require('../config/logger');
const { DatabaseError } = require('../utils/errors');

class TransactionRepository {

  /**
   * Create transaction + outbox event atomically.
   * The outbox guarantees the Kafka event is published even if the broker is down.
   */
  async createWithOutbox(transactionData, kafkaEventPayload) {
    try {
      return await withTransaction(async (client) => {
        const txnResult = await client.query(`
          INSERT INTO transactions (
            id, customer_id, merchant_id, amount, currency,
            card_number, card_last_four, card_type,
            device_id, ip_address, user_agent,
            location, metadata, status,
            idempotency_key, correlation_id, request_id
          ) VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,
            $9,$10,$11,
            $12,$13,$14,
            $15,$16,$17
          )
          RETURNING *
        `, [
          transactionData.id            || uuidv4(),
          transactionData.customerId,
          transactionData.merchantId,
          transactionData.amount,
          transactionData.currency,
          transactionData.cardNumber,
          transactionData.cardLastFour,
          transactionData.cardType,
          transactionData.deviceId,
          transactionData.ipAddress,
          transactionData.userAgent,
          JSON.stringify(transactionData.location  || {}),
          JSON.stringify(transactionData.metadata  || {}),
          transactionData.status         || 'PENDING',
          transactionData.idempotencyKey,
          transactionData.correlationId,
          transactionData.requestId,
        ]);

        const txn = txnResult.rows[0];
        await client.query(`
          INSERT INTO outbox_events (
            id, transaction_id, topic, event_type,
            payload, partition_key, status
          ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
        `, [
          uuidv4(),
          txn.id,
          kafkaEventPayload.topic,
          kafkaEventPayload.eventType,
          JSON.stringify(kafkaEventPayload.payload),
          txn.customer_id,
        ]);

        if (transactionData.idempotencyKey) {
          await client.query(`
            INSERT INTO idempotency_keys (key, transaction_id, status_code, response_body)
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (key) DO NOTHING
          `, [
            transactionData.idempotencyKey,
            txn.id,
            201,
            JSON.stringify({ transactionId: txn.id, status: txn.status }),
          ]);
        }

        logger.info('Transaction created with outbox event', { transactionId: txn.id });
        return this._mapRow(txn);
      });
    } catch (err) {
      logger.error('TransactionRepository.createWithOutbox failed', { error: err.message });
      throw new DatabaseError(`Failed to create transaction: ${err.message}`);
    }
  }

  async findIdempotencyKey(key) {
    try {
      const { rows } = await query(`
        SELECT ik.*, t.status as txn_status
        FROM   idempotency_keys ik
        JOIN   transactions t ON t.id = ik.transaction_id
        WHERE  ik.key = $1
          AND  ik.expires_at > NOW()
      `, [key]);
      return rows[0] || null;
    } catch (err) {
      throw new DatabaseError(`Idempotency lookup failed: ${err.message}`);
    }
  }

  async findById(id) {
    try {
      const { rows } = await query('SELECT * FROM transactions WHERE id = $1', [id]);
      return rows[0] ? this._mapRow(rows[0]) : null;
    } catch (err) {
      throw new DatabaseError(`Transaction lookup failed: ${err.message}`);
    }
  }

  async findByCustomerId(customerId, { limit = 20, offset = 0 } = {}) {
    try {
      const { rows } = await query(`
        SELECT * FROM transactions
        WHERE  customer_id = $1
        ORDER  BY created_at DESC
        LIMIT  $2 OFFSET $3
      `, [customerId, limit, offset]);
      return rows.map(r => this._mapRow(r));
    } catch (err) {
      throw new DatabaseError(`Customer transactions lookup failed: ${err.message}`);
    }
  }

  async updateStatus(id, status, client = null) {
    const execute = client ? client.query.bind(client) : query;
    try {
      const { rows } = await execute(`
        UPDATE transactions
        SET    status = $2, updated_at = NOW()
        WHERE  id = $1
        RETURNING *
      `, [id, status]);
      return rows[0] ? this._mapRow(rows[0]) : null;
    } catch (err) {
      throw new DatabaseError(`Status update failed: ${err.message}`);
    }
  }

  _mapRow(row) {
    return {
      id:             row.id,
      customerId:     row.customer_id,
      merchantId:     row.merchant_id,
      amount:         parseFloat(row.amount),
      currency:       row.currency,
      cardNumber:     row.card_number,
      cardLastFour:   row.card_last_four,
      cardType:       row.card_type,
      deviceId:       row.device_id,
      ipAddress:      row.ip_address,
      userAgent:      row.user_agent,
      location:       row.location,
      metadata:       row.metadata,
      status:         row.status,
      idempotencyKey: row.idempotency_key,
      correlationId:  row.correlation_id,
      requestId:      row.request_id,
      createdAt:      row.created_at,
      updatedAt:      row.updated_at,
    };
  }
}

module.exports = new TransactionRepository();