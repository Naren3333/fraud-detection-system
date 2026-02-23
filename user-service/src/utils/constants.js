module.exports = {
  USER_ROLES: {
    ADMIN: 'admin',
    USER: 'user',
    MERCHANT: 'merchant',
    ANALYST: 'analyst',
  },

  USER_STATUS: {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    LOCKED: 'LOCKED',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  },

  HEADERS: {
    REQUEST_ID: 'x-request-id',
    CORRELATION_ID: 'x-correlation-id',
  },

  TOKEN_TYPES: {
    ACCESS: 'ACCESS',
    REFRESH: 'REFRESH',
  },
};