const logger = require('../config/logger');
const { mlCircuitBreakerState } = require('../metrics');

const STATE = {
  CLOSED: 'CLOSED',       // Normal operation — requests flow through
  OPEN: 'OPEN',           // Failing — requests short-circuit immediately
  HALF_OPEN: 'HALF_OPEN', // Testing — limited requests allowed through
};

const STATE_METRICS = {
  [STATE.CLOSED]: 0,
  [STATE.OPEN]: 1,
  [STATE.HALF_OPEN]: 2,
};

class CircuitBreaker {
  /**
   * @param {string} name - Human-readable name for logging/metrics
   * @param {object} options
   * @param {number} options.failureThreshold  - Consecutive failures before opening
   * @param {number} options.successThreshold  - Consecutive successes in HALF_OPEN before closing
   * @param {number} options.timeout           - Milliseconds to stay OPEN before trying HALF_OPEN
   */
  constructor(name, { failureThreshold = 5, successThreshold = 2, timeout = 30000 } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.timeout = timeout;

    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this._updateMetric();
  }

  /**
   * Execute a function through the circuit breaker.
   * @param {Function} fn - Async function to protect
   * @returns {Promise<*>} Result of fn()
   * @throws Will throw if circuit is OPEN or fn() throws and threshold is exceeded
   */
  async execute(fn) {
    if (this.state === STATE.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        const err = new Error(`Circuit breaker [${this.name}] is OPEN`);
        err.circuitOpen = true;
        throw err;
      }
      this._transitionTo(STATE.HALF_OPEN);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  isOpen() {
    if (this.state === STATE.OPEN && Date.now() >= this.nextAttemptTime) {
      this._transitionTo(STATE.HALF_OPEN);
    }
    return this.state === STATE.OPEN;
  }

  getState() {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  _onSuccess() {
    if (this.state === STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this._transitionTo(STATE.CLOSED);
      }
    } else {
      this.failureCount = 0;
    }
  }

  _onFailure(err) {
    this.failureCount++;
    this.successCount = 0;
    this.lastFailureTime = new Date().toISOString();

    logger.warn(`Circuit breaker [${this.name}] failure recorded`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      error: err.message,
      state: this.state,
    });

    if (this.state === STATE.HALF_OPEN || this.failureCount >= this.failureThreshold) {
      this._transitionTo(STATE.OPEN);
    }
  }

  _transitionTo(newState) {
    const prevState = this.state;
    this.state = newState;

    if (newState === STATE.OPEN) {
      this.nextAttemptTime = Date.now() + this.timeout;
      this.failureCount = 0;
    }

    if (newState === STATE.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    }

    this._updateMetric();

    logger.warn(`Circuit breaker [${this.name}] state transition`, {
      from: prevState,
      to: newState,
      nextAttemptTime: this.nextAttemptTime,
    });
  }

  _updateMetric() {
    mlCircuitBreakerState.set(STATE_METRICS[this.state] ?? 0);
  }
}

module.exports = { CircuitBreaker, STATE };