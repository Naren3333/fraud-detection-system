# Human Verification Service

Backend-only manual review service for `FLAGGED` transactions.

## Data Flow

1. Consumes from Kafka topic: `transaction.flagged`
2. Stores pending items in table: `manual_reviews`
3. Reviewer submits decision via API
4. Publishes reviewed event to Kafka topic: `transaction.reviewed`

## API Endpoints

- `GET /api/v1/reviews/pending?limit=20&offset=0`
- `GET /api/v1/reviews/:transactionId`
- `POST /api/v1/reviews/:transactionId/decision`

### Submit Decision Payload

```json
{
  "decision": "APPROVED",
  "reviewedBy": "analyst-01",
  "notes": "False positive, approve"
}
```

Allowed `decision` values:
- `APPROVED`
- `DECLINED`
- `FLAGGED` (keep held)

## Important Integration Points

### Where data comes from

- Decision Engine publishes flagged events:
  - `decision-engine-service/src/consumers/transactionConsumer.js`
  - topic `transaction.flagged`

### Where reviewed decision is sent

- This service publishes to `transaction.reviewed`

### Where transaction status is updated

- Transaction Service consumer applies reviewed decisions:
  - `transaction-service/src/kafka/decisionConsumer.js`
  - update status via `transactionRepository.updateStatus(...)`

## Env knobs

Set in `.env`:

- `KAFKA_INPUT_TOPIC_FLAGGED`
- `KAFKA_OUTPUT_TOPIC_REVIEWED`
- `DB_*`
- `KAFKA_*`