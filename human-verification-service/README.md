# Human Verification Service

This service handles manual review for flagged transactions and analyst resolution for customer appeals.

## Main Flow

1. Consume flagged transactions from Kafka topic `transaction.flagged`.
2. Store review items in the `manual_reviews` table.
3. Accept analyst decisions through the review API.
4. Publish review results to Kafka topic `transaction.reviewed`.
5. Forward appeal resolutions to the Appeal Service.

## Main Endpoints

- `GET /api/v1/reviews/pending`
- `GET /api/v1/reviews/:transactionId`
- `POST /api/v1/reviews/:transactionId/decision`
- `GET /api/v1/reviews/appeals/pending`
- `POST /api/v1/reviews/appeals/:appealId/resolve`
- `GET /` for the built-in review dashboard

## Example Review Payload

```json
{
  "decision": "APPROVED",
  "reviewedBy": "analyst-01",
  "notes": "False positive, approve"
}
```

Allowed values:

- Review decision: `APPROVED`, `DECLINED`
- Appeal resolution: `UPHOLD`, `REVERSE`

## Environment Variables

Main settings from `.env`:

- `KAFKA_INPUT_TOPIC_FLAGGED`
- `KAFKA_OUTPUT_TOPIC_REVIEWED`
- `APPEAL_SERVICE_URL`
- `APPEAL_SERVICE_TIMEOUT_MS`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Run

The usual project flow is to start it from the repository root:

```bash
docker compose up --build -d
```

Service URLs:

- Dashboard: `http://localhost:3010/`
- Swagger UI: `http://localhost:3010/api-docs`
- Health: `http://localhost:3010/api/v1/health`

## Notes

- The API routes are mounted under `/api/v1`.
- The service publishes transaction review outcomes for the Transaction Service to apply.
- Appeal resolutions are handled through the Appeal Service rather than written directly in this service.
