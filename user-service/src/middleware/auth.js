const userService = require('../services/userService');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const logger = require('../config/logger');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const token = authHeader.substring(7);
    if (!token) {
      throw new UnauthorizedError('Invalid authentication token');
    }

    const decoded = userService.validateAccessToken(token);

    // Attach user info to request
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userRole = decoded.role;
    req.permissions = decoded.permissions || [];

    logger.debug('User authenticated', { userId: decoded.userId, role: decoded.role });
    next();
  } catch (error) {
    next(error);
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.userRole) {
        throw new UnauthorizedError('User not authenticated');
      }

      if (!allowedRoles.includes(req.userRole)) {
        logger.warn('Authorization failed', {
          userId: req.userId,
          userRole: req.userRole,
          requiredRoles: allowedRoles,
        });
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { authenticate, authorize };
