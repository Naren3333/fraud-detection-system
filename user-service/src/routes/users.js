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
// Handles POST /register.
router.post('/register', validateRegister, userController.register);
// Handles POST /login.
router.post('/login', validateLogin, userController.login);
// Handles POST /refresh.
router.post('/refresh', validateRefresh, userController.refresh);
// Handles POST /logout.
router.post('/logout', userController.logout);
// Handles POST /validate.
router.post('/validate', userController.validateToken);
// Handles GET /profile.
router.get('/profile', authenticate, userController.getProfile);
// Handles PATCH /profile.
router.patch('/profile', authenticate, validateUpdateProfile, userController.updateProfile);
// Handles POST /change-password.
router.post('/change-password', authenticate, validateChangePassword, userController.changePassword);
// Handles GET /users/:userId.
router.get('/users/:userId', authenticate, authorize(USER_ROLES.ADMIN), userController.getProfile);

module.exports = router;