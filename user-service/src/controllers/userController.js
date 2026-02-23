const userService = require('../services/userService');
const logger = require('../config/logger');

class UserController {
  // Handles register.
  async register(req, res) {
    const { email, password, firstName, lastName, role, phone, metadata } = req.body;

    const user = await userService.register({
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: { user },
      message: 'User registered successfully',
    });
  }

  // Handles login.
  async login(req, res) {
    const { email, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    const result = await userService.login({ email, password, ipAddress, userAgent });

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  // Handles refresh.
  async refresh(req, res) {
    const { refreshToken } = req.body;

    const result = await userService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  // Handles logout.
  async logout(req, res) {
    const { refreshToken } = req.body;

    await userService.logout(refreshToken);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  // Handles get profile.
  async getProfile(req, res) {
    const userId = req.params.userId || req.userId;

    const user = await userService.getProfile(userId);

    res.status(200).json({
      success: true,
      data: { user },
    });
  }

  // Handles update profile.
  async updateProfile(req, res) {
    const userId = req.userId;
    const updates = req.body;

    const user = await userService.updateProfile(userId, updates);

    res.status(200).json({
      success: true,
      data: { user },
      message: 'Profile updated successfully',
    });
  }

  // Handles change password.
  async changePassword(req, res) {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    await userService.changePassword(userId, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  }

  // Handles validate token.
  async validateToken(req, res) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'No token provided',
      });
    }

    const decoded = userService.validateAccessToken(token);

    res.status(200).json({
      success: true,
      data: { valid: true, user: decoded },
    });
  }
}

module.exports = new UserController();