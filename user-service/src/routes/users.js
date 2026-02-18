const router = require('express').Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateUpdateProfile,
  validateChangePassword,
} = require('../middleware/validate');
const { USER_ROLES } = require('../utils/constants');

// Public routes
router.post('/register', validateRegister, userController.register);
router.post('/login', validateLogin, userController.login);
router.post('/refresh', validateRefresh, userController.refresh);
router.post('/logout', userController.logout);

// Token validation (used by API Gateway)
router.post('/validate', userController.validateToken);

// Protected routes
router.get('/profile', authenticate, userController.getProfile);
router.patch('/profile', authenticate, validateUpdateProfile, userController.updateProfile);
router.post('/change-password', authenticate, validateChangePassword, userController.changePassword);

// Admin only
router.get('/users/:userId', authenticate, authorize(USER_ROLES.ADMIN), userController.getProfile);

module.exports = router;
