class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;
    this.timestamp  = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError       extends AppError { constructor(m) { super(m, 400, 'VALIDATION_ERROR'); } }
class DuplicateRequestError extends AppError { constructor(m) { super(m, 409, 'DUPLICATE_REQUEST'); } }
class NotFoundError         extends AppError { constructor(m = 'Not found') { super(m, 404, 'NOT_FOUND'); } }
class DatabaseError         extends AppError { constructor(m) { super(m, 500, 'DATABASE_ERROR'); } }
class KafkaPublishError     extends AppError { constructor(m) { super(m, 502, 'KAFKA_ERROR'); } }

module.exports = { AppError, ValidationError, DuplicateRequestError, NotFoundError, DatabaseError, KafkaPublishError };