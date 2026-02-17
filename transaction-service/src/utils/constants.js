module.exports = {
  TRANSACTION_STATUS: {
    PENDING:  'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    FLAGGED:  'FLAGGED',
    REVERSED: 'REVERSED',
    ERROR:    'ERROR',
  },

  EVENT_TYPES: {
    TRANSACTION_CREATED: 'transaction.created',
  },

  // Header names - must match API Gateway exactly
  HEADERS: {
    REQUEST_ID:      'x-request-id',
    CORRELATION_ID:  'x-correlation-id',
    IDEMPOTENCY_KEY: 'x-idempotency-key',
    USER_ID:         'x-user-id',
  },

  CURRENCIES: ['USD','EUR','GBP','SGD','JPY','AUD','CAD','CHF','HKD','MYR'],
};