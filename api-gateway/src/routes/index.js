const express = require('express');
const healthRoutes = require('./health');
const proxyRoutes = require('./proxy');
const AuthService = require('../services/authService');
const MetricsService = require('../utils/metrics');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateRequest } = require('../middleware/requestValidator');
const Joi = require('joi');
const { BadRequestError } = require('../utils/errors');

const router = express.Router();

// Health check routes (no auth required)
router.use(healthRoutes);

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', MetricsService.getContentType());
  res.end(await MetricsService.getMetrics());
});

// Auth endpoints (mock - in production, would call user service)
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

router.post('/auth/login', authLimiter, validateRequest(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await AuthService.validateCredentials(email, password);

    if (!user) {
      throw new BadRequestError('Invalid credentials');
    }

    const token = AuthService.generateToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    });

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Proxied routes (auth required)
router.use(proxyRoutes);

module.exports = router;