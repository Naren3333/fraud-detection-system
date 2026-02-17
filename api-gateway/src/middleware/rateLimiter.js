const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');
const config = require('../config');
const logger = require('../config/logger');
const { TooManyRequestsError } = require('../utils/errors');
const MetricsService = require('../utils/metrics');

const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
    handler: (req, res) => {
      MetricsService.recordRateLimitHit(req.path);
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.user?.userId,
      });
      throw new TooManyRequestsError('Too many requests, please try again later');
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.userId || req.ip;
    },
  };

  try {
    const redisClient = getRedisClient();
    
    return rateLimit({
      ...defaults,
      ...options,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:',
      }),
    });
  } catch (error) {
    logger.error('Failed to create Redis-based rate limiter, falling back to memory store', error);
    
    // Fallback to memory store if Redis is unavailable
    return rateLimit({
      ...defaults,
      ...options,
    });
  }
};

// Different rate limiters for different endpoints
const standardLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from this IP, please try again later',
});

const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'Too many requests, please slow down',
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later',
});

const transactionLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 transactions per minute
  message: 'Transaction rate limit exceeded',
  keyGenerator: (req) => {
    // Rate limit per user for transactions
    return req.user?.userId || req.ip;
  },
});

module.exports = {
  standardLimiter,
  strictLimiter,
  authLimiter,
  transactionLimiter,
  createRateLimiter,
};