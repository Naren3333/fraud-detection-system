/**
 Transactional Outbox Pattern relay.

If we publish to Kafka directly inside the HTTP handler and Kafka is down,
the transaction is saved to DB but the event is lost forever.
 
Solution:
   1. The repository writes the Kafka event to the `outbox_events` table
      IN THE SAME DB TRANSACTION as the transaction INSERT (atomic).
   2. This background worker polls `outbox_events` every second and publishes
      pending rows to Kafka.
   3. On success → mark PUBLISHED. On failure → increment attempts.
   4. After MAX_ATTEMPTS → mark FAILED (ops alert, manual intervention).
 
SKIP LOCKED ensures multiple instances of this service don't fight over
the same rows (safe for horizontal scaling).
 */
const { query }          = require('../db/pool');
const { publish, isProducerReady } = require('./producer');
const logger             = require('../config/logger');

const POLL_MS = 1000;
const BATCH = 50;
const MAX_ATTEMPTS = 5;

let timer = null;
let inFlight = false;

const poll = async () => {
  if (inFlight || !isProducerReady()) return;
  inFlight = true;

  try {
    const { rows } = await query(`
      SELECT id, transaction_id, topic, payload, partition_key, attempts
      FROM   outbox_events
      WHERE  status   = 'PENDING'
        AND  attempts < $1
      ORDER  BY created_at
      LIMIT  $2
      FOR UPDATE SKIP LOCKED
    `, [MAX_ATTEMPTS, BATCH]);

    for (const row of rows) {
      try {
        await publish(row.topic, row.partition_key || row.transaction_id, row.payload);
        await query(`
          UPDATE outbox_events
          SET status = 'PUBLISHED', published_at = NOW(), attempts = attempts + 1
          WHERE id = $1
        `, [row.id]);
      } catch (err) {
        const next = row.attempts + 1 >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
        logger.error('Outbox publish failed', { id: row.id, attempt: row.attempts + 1, error: err.message });
        await query(`
          UPDATE outbox_events
          SET attempts = attempts + 1, last_error = $2, status = $3
          WHERE id = $1
        `, [row.id, err.message, next]);
      }
    }
  } catch (err) {
    logger.error('Outbox poll error', { error: err.message });
  } finally {
    inFlight = false;
  }
};

const startOutboxPublisher = () => {
  logger.info('Outbox publisher started', { pollMs: POLL_MS });
  timer = setInterval(poll, POLL_MS);
};

const stopOutboxPublisher = () => {
  if (timer) { clearInterval(timer); timer = null; logger.info('Outbox publisher stopped'); }
};

module.exports = { startOutboxPublisher, stopOutboxPublisher };