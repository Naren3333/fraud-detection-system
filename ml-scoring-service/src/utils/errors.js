class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class ModelError extends AppError {
  constructor(message) {
    super(message, 500, 'MODEL_ERROR');
  }
}

class TimeoutError extends AppError {
  constructor(message = 'Request timeout') {
    super(message, 504, 'TIMEOUT_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  ModelError,
  TimeoutError,
};
