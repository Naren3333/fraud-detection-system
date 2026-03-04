const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../config/logger');
const userRepository = require('../repositories/userRepository');
const { UnauthorizedError, ConflictError, TooManyRequestsError, NotFoundError, ValidationError } = require('../utils/errors');
const { USER_ROLES, USER_STATUS } = require('../utils/constants');

class UserService {
  
  // Handles register.
  async register({ email, password, firstName, lastName, role = USER_ROLES.USER, phone, metadata }) {
    logger.info('Registering new user', { email, role });
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);
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
  
  // Handles login.
  async login({ email, password, ipAddress, userAgent }) {
    logger.info('Login attempt', { email, ipAddress });
    const failedAttempts = await userRepository.getRecentFailedAttempts(
      email,
      config.security.loginLockoutDuration
    );

    if (failedAttempts >= config.security.loginMaxAttempts) {
      logger.warn('Account locked due to too many failed attempts', { email, failedAttempts });
      throw new TooManyRequestsError('Account temporarily locked due to too many failed login attempts');
    }
    const user = await userRepository.findByEmail(email);
    if (!user) {
      await userRepository.recordLoginAttempt({ email, ipAddress, success: false, userAgent });
      throw new UnauthorizedError('Invalid email or password');
    }
    if (user.status === USER_STATUS.SUSPENDED) {
      throw new UnauthorizedError('Account suspended');
    }
    if (user.status === USER_STATUS.LOCKED) {
      throw new UnauthorizedError('Account locked');
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await userRepository.recordLoginAttempt({ email, ipAddress, success: false, userAgent });
      throw new UnauthorizedError('Invalid email or password');
    }
    await userRepository.recordLoginAttempt({ email, ipAddress, success: true, userAgent });
    await userRepository.clearLoginAttempts(email);
    await userRepository.updateLastLogin(user.user_id);
    const accessToken = this._generateAccessToken(user);
    const refreshToken = this._generateRefreshToken(user);
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
  
  // Handles refresh access token.
  async refreshAccessToken(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
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
    try {
      jwt.verify(refreshToken, config.jwt.refreshSecret, { issuer: config.jwt.issuer });
    } catch (err) {
      throw new UnauthorizedError('Invalid refresh token signature');
    }
    const user = await userRepository.findById(tokenRecord.user_id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedError('Account not active');
    }
    const accessToken = this._generateAccessToken(user);

    logger.info('Access token refreshed', { userId: user.user_id });
    return { accessToken, user: this._sanitizeUser(user) };
  }
  
  // Handles logout.
  async logout(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await userRepository.revokeRefreshToken(tokenHash);
    logger.info('User logged out (refresh token revoked)');
  }
  
  // Handles get profile.
  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return this._sanitizeUser(user);
  }
  
  // Handles update profile.
  async updateProfile(userId, updates) {
    const mappedUpdates = {};
    if (typeof updates.firstName === 'string') mappedUpdates.first_name = updates.firstName;
    if (typeof updates.lastName === 'string') mappedUpdates.last_name = updates.lastName;
    if (typeof updates.phone === 'string') mappedUpdates.phone = updates.phone;
    if (updates.metadata && typeof updates.metadata === 'object') mappedUpdates.metadata = updates.metadata;

    if (Object.keys(mappedUpdates).length === 0) {
      throw new ValidationError('No valid profile fields provided');
    }

    const user = await userRepository.update(userId, mappedUpdates);
    logger.info('User profile updated', { userId });
    return this._sanitizeUser(user);
  }
  
  // Handles change password.
  async changePassword(userId, currentPassword, newPassword) {
    const user = await userRepository.findByEmail((await userRepository.findById(userId)).email);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await userRepository.updatePassword(userId, newPasswordHash);
    await userRepository.revokeAllUserTokens(userId);

    logger.info('Password changed', { userId });
  }
  
  // Handles validate access token.
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

  // Handles generate access token.
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

  // Handles generate refresh token.
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

  // Handles get role permissions.
  _getRolePermissions(role) {
    const permissionMap = {
      [USER_ROLES.ADMIN]: ['read', 'write', 'delete', 'manage_users'],
      [USER_ROLES.ANALYST]: ['read', 'write', 'review_transactions'],
      [USER_ROLES.MERCHANT]: ['read', 'submit_transactions'],
      [USER_ROLES.USER]: ['read'],
    };
    return permissionMap[role] || ['read'];
  }

  // Handles sanitize user.
  _sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  // Handles parse expiry.
  _parseExpiry(expiry) {
    const match = expiry.match(/^(\d+)([dhms])$/);
    if (!match) return 24 * 60 * 60 * 1000;

    const [, value, unit] = match;
    const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return parseInt(value, 10) * multipliers[unit];
  }
}

module.exports = new UserService();
