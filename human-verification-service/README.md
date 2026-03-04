
# Human Verification Service

Backend-only analyst review service for `FLAGGED` transactions and customer appeals.

## Data Flow

1. Consumes from Kafka topic: `transaction.flagged`
2. Stores pending items in table: `manual_reviews`
3. Reviewer submits decision via API
4. Publishes reviewed event to Kafka topic: `transaction.reviewed`
5. For appeals, proxies analyst actions to Appeal Service and triggers `appeal.resolved`

## API Endpoints

-`GET /api/v1/reviews/pending?limit=20&offset=0`

-`GET /api/v1/reviews/:transactionId`

-`POST /api/v1/reviews/:transactionId/decision`

-`GET /api/v1/reviews/appeals/pending?limit=20&offset=0`

-`POST /api/v1/reviews/appeals/:appealId/resolve`

- Dashboard: `GET /` (human review UI using the above APIs)
- Dashboard supports pending queue view, client-side filtering, decision notes, and approve/decline actions.

### Submit Decision Payload

```json

{

  "decision": "APPROVED",

  "reviewedBy": "analyst-01",

  "notes": "False positive, approve"

}

```

Allowed `decision` values:

-`APPROVED`

-`DECLINED`

Allowed `resolution` values for appeals:

-`UPHOLD`

-`REVERSE`

## Important Integration Points

### Where data comes from

- Decision Engine publishes flagged events:

  -`decision-engine-service/src/consumers/transactionConsumer.js`

  - topic `transaction.flagged`

### Where reviewed decision is sent

- This service publishes to `transaction.reviewed`

### Where transaction status is updated

- Transaction Service consumer applies reviewed decisions:

  -`transaction-service/src/kafka/decisionConsumer.js`

  - update status via `transactionRepository.updateStatus(...)`

## Env knobs

Set in `.env`:

-`KAFKA_INPUT_TOPIC_FLAGGED`

-`KAFKA_OUTPUT_TOPIC_REVIEWED`

-`DB_*`

-`KAFKA_*`

-`APPEAL_SERVICE_URL`

-`APPEAL_SERVICE_TIMEOUT_MS`
