const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../config/logger');
const userRepository = require('../repositories/userRepository');
const { UnauthorizedError, ConflictError, TooManyRequestsError, NotFoundError } = require('../utils/errors');
const { USER_ROLES, USER_STATUS } = require('../utils/constants');

class UserService {
  
// Register a new user
  
  async register({ email, password, firstName, lastName, role = USER_ROLES.USER, phone, metadata }) {
    logger.info('Registering new user', { email, role });

    // Check if user already exists
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    // Create user
    const user = await userRepository.create({
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      phone,
      metadata: metadata || {},
    });

    logger.info('User registered successfully', { userId: user.user_id, email });
    return this._sanitizeUser(user);
  }

  
// Login with email + password
  
  async login({ email, password, ipAddress, userAgent }) {
    logger.info('Login attempt', { email, ipAddress });

    // Check for account lockout
    const failedAttempts = await userRepository.getRecentFailedAttempts(
      email,
      config.security.loginLockoutDuration
    );

    if (failedAttempts >= config.security.loginMaxAttempts) {
      logger.warn('Account locked due to too many failed attempts', { email, failedAttempts });
      throw new TooManyRequestsError('Account temporarily locked due to too many failed login attempts');
    }

    // Find user
    const user = await userRepository.findByEmail(email);
    if (!user) {
      await userRepository.recordLoginAttempt({ email, ipAddress, success: false, userAgent });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check status
    if (user.status === USER_STATUS.SUSPENDED) {
      throw new UnauthorizedError('Account suspended');
    }
    if (user.status === USER_STATUS.LOCKED) {
      throw new UnauthorizedError('Account locked');
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await userRepository.recordLoginAttempt({ email, ipAddress, success: false, userAgent });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Success - clear failed attempts and update last login
    await userRepository.recordLoginAttempt({ email, ipAddress, success: true, userAgent });
    await userRepository.clearLoginAttempts(email);
    await userRepository.updateLastLogin(user.user_id);

    // Generate tokens
    const accessToken = this._generateAccessToken(user);
    const refreshToken = this._generateRefreshToken(user);

    // Store refresh token
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + this._parseExpiry(config.jwt.refreshExpiresIn));
    await userRepository.saveRefreshToken({
      userId: user.user_id,
      tokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    });

    logger.info('Login successful', { userId: user.user_id, email });

    return {
      accessToken,
      refreshToken,
      user: this._sanitizeUser(user),
    };
  }

  
// Refresh access token using refresh token
  
  async refreshAccessToken(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find token in DB
    const tokenRecord = await userRepository.findRefreshToken(tokenHash);
    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (tokenRecord.revoked_at) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (new Date() > new Date(tokenRecord.expires_at)) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Verify JWT signature
    try {
      jwt.verify(refreshToken, config.jwt.refreshSecret, { issuer: config.jwt.issuer });
    } catch (err) {
      throw new UnauthorizedError('Invalid refresh token signature');
    }

    // Get user
    const user = await userRepository.findById(tokenRecord.user_id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedError('Account not active');
    }

    // Generate new access token
    const accessToken = this._generateAccessToken(user);

    logger.info('Access token refreshed', { userId: user.user_id });
    return { accessToken, user: this._sanitizeUser(user) };
  }

  
// Logout (revoke refresh token)
  
  async logout(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await userRepository.revokeRefreshToken(tokenHash);
    logger.info('User logged out (refresh token revoked)');
  }

  
// Get user profile by ID
  
  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return this._sanitizeUser(user);
  }

  
// Update user profile
  
  async updateProfile(userId, updates) {
    const user = await userRepository.update(userId, updates);
    logger.info('User profile updated', { userId });
    return this._sanitizeUser(user);
  }

  
// Change password
  
  async changePassword(userId, currentPassword, newPassword) {
    const user = await userRepository.findByEmail((await userRepository.findById(userId)).email);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await userRepository.updatePassword(userId, newPasswordHash);

    // Revoke all refresh tokens (force re-login)
    await userRepository.revokeAllUserTokens(userId);

    logger.info('Password changed', { userId });
  }

  
// Validate JWT access token (used by API gateway)
  
  validateAccessToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });
      return decoded;
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }
  }

  // Private Helpers

  _generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.user_id,
        email: user.email,
        role: user.role,
        permissions: this._getRolePermissions(user.role),
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        issuer: config.jwt.issuer,
      }
    );
  }

  _generateRefreshToken(user) {
    return jwt.sign(
      { userId: user.user_id, type: 'REFRESH' },
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshExpiresIn,
        issuer: config.jwt.issuer,
      }
    );
  }

  _getRolePermissions(role) {
    const permissionMap = {
      [USER_ROLES.ADMIN]: ['read', 'write', 'delete', 'manage_users'],
      [USER_ROLES.ANALYST]: ['read', 'write', 'review_transactions'],
      [USER_ROLES.MERCHANT]: ['read', 'submit_transactions'],
      [USER_ROLES.USER]: ['read'],
    };
    return permissionMap[role] || ['read'];
  }

  _sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  _parseExpiry(expiry) {
    const match = expiry.match(/^(\d+)([dhms])$/);
    if (!match) return 24 * 60 * 60 * 1000; // default 24h

    const [, value, unit] = match;
    const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return parseInt(value, 10) * multipliers[unit];
  }
}

module.exports = new UserService();
