const config = require('../config');
const logger = require('../config/logger');

/**
 * Retry an async operation with exponential backoff
 * 
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {Object} context - Context for logging
 * @returns {Promise} - Result of successful operation
 */
async function retryWithBackoff(operation, options = {}, context = {}) {
  const {
    maxAttempts = config.retry.maxAttempts,
    initialDelayMs = config.retry.initialDelayMs,
    backoffMultiplier = config.retry.backoffMultiplier,
    maxDelayMs = config.retry.maxDelayMs,
  } = options;

  let lastError;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      const result = await operation();
      
      if (attempt > 1) {
        logger.info('Retry succeeded', {
          ...context,
          attempt,
          totalAttempts: maxAttempts,
        });
      }

      return { success: true, result, attempt };
    } catch (error) {
      lastError = error;

      logger.warn('Retry attempt failed', {
        ...context,
        attempt,
        maxAttempts,
        error: error.message,
      });

      if (attempt >= maxAttempts) {
        logger.error('All retry attempts exhausted', {
          ...context,
          totalAttempts: maxAttempts,
          finalError: error.message,
        });
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      logger.debug('Waiting before retry', {
        ...context,
        attempt,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempt,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { retryWithBackoff, sleep };
