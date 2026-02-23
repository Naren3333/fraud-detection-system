const { query } = require('../db/pool');
const logger = require('../config/logger');

class UserRepository {
  
  // Handles create.
  async create({ email, passwordHash, firstName, lastName, role, phone, metadata = {} }) {
    const sql = `
      INSERT INTO users (email, password_hash, first_name, last_name, role, phone, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        user_id, email, first_name, last_name, role, status, phone,
        email_verified, phone_verified, metadata, created_at, updated_at
    `;
    const values = [email, passwordHash, firstName, lastName, role, phone, JSON.stringify(metadata)];
    
    try {
      const result = await query(sql, values);
      logger.info('User created', { userId: result.rows[0].user_id, email });
      return result.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new Error('EMAIL_ALREADY_EXISTS');
      }
      throw err;
    }
  }
  
  // Handles find by email.
  async findByEmail(email) {
    const sql = `
      SELECT 
        user_id, email, password_hash, first_name, last_name, role, status, phone,
        email_verified, phone_verified, metadata, created_at, updated_at, last_login_at
      FROM users
      WHERE email = $1
    `;
    const result = await query(sql, [email]);
    return result.rows[0] || null;
  }
  
  // Handles find by id.
  async findById(userId) {
    const sql = `
      SELECT 
        user_id, email, first_name, last_name, role, status, phone,
        email_verified, phone_verified, metadata, created_at, updated_at, last_login_at
      FROM users
      WHERE user_id = $1
    `;
    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  }
  
  // Handles update.
  async update(userId, updates) {
    const allowedFields = ['first_name', 'last_name', 'phone', 'status', 'metadata', 'email_verified', 'phone_verified'];
    const setFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setFields.push(`${key} = $${paramIndex++}`);
        values.push(key === 'metadata' ? JSON.stringify(value) : value);
      }
    }

    if (setFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    setFields.push(`updated_at = NOW()`);
    values.push(userId);

    const sql = `
      UPDATE users
      SET ${setFields.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING 
        user_id, email, first_name, last_name, role, status, phone,
        email_verified, phone_verified, metadata, created_at, updated_at
    `;

    const result = await query(sql, values);
    logger.info('User updated', { userId });
    return result.rows[0];
  }
  
  // Handles update last login.
  async updateLastLogin(userId) {
    const sql = `UPDATE users SET last_login_at = NOW() WHERE user_id = $1`;
    await query(sql, [userId]);
  }
  
  // Handles update password.
  async updatePassword(userId, newPasswordHash) {
    const sql = `
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE user_id = $2
    `;
    await query(sql, [newPasswordHash, userId]);
    logger.info('Password updated', { userId });
  }
  
  // Handles soft delete.
  async softDelete(userId) {
    const sql = `
      UPDATE users
      SET status = 'SUSPENDED', updated_at = NOW()
      WHERE user_id = $1
    `;
    await query(sql, [userId]);
    logger.info('User soft deleted', { userId });
  }

  // Handles record login attempt.
  async recordLoginAttempt({ email, ipAddress, success, userAgent }) {
    const sql = `
      INSERT INTO login_attempts (email, ip_address, success, user_agent)
      VALUES ($1, $2, $3, $4)
    `;
    await query(sql, [email, ipAddress, success, userAgent]);
  }

  // Handles get recent failed attempts.
  async getRecentFailedAttempts(email, windowMs) {
    const sql = `
      SELECT COUNT(*) as count
      FROM login_attempts
      WHERE email = $1
        AND success = FALSE
        AND attempted_at > NOW() - INTERVAL '1 millisecond' * $2
    `;
    const result = await query(sql, [email, windowMs]);
    return parseInt(result.rows[0].count, 10);
  }

  // Handles clear login attempts.
  async clearLoginAttempts(email) {
    const sql = `DELETE FROM login_attempts WHERE email = $1`;
    await query(sql, [email]);
  }

  // Handles save refresh token.
  async saveRefreshToken({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
    const sql = `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING token_id
    `;
    const result = await query(sql, [userId, tokenHash, expiresAt, ipAddress, userAgent]);
    return result.rows[0].token_id;
  }

  // Handles find refresh token.
  async findRefreshToken(tokenHash) {
    const sql = `
      SELECT token_id, user_id, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_hash = $1
    `;
    const result = await query(sql, [tokenHash]);
    return result.rows[0] || null;
  }

  // Handles revoke refresh token.
  async revokeRefreshToken(tokenHash) {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1
    `;
    await query(sql, [tokenHash]);
  }

  // Handles revoke all user tokens.
  async revokeAllUserTokens(userId) {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL
    `;
    await query(sql, [userId]);
    logger.info('All refresh tokens revoked', { userId });
  }
}

module.exports = new UserRepository();