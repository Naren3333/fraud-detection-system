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
/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [user-service]
 *     summary: Register a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *           example:
 *             email: alice@example.com
 *             password: Passw0rd!
 *             firstName: Alice
 *             lastName: Tan
 *             role: CUSTOMER
 *     responses:
 *       201:
 *         description: User registered
 *       400:
 *         description: Invalid request
 */
// Handles POST /register.
router.post('/register', validateRegister, userController.register);
/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [user-service]
 *     summary: User login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *           example:
 *             email: alice@example.com
 *             password: Passw0rd!
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
// Handles POST /login.
router.post('/login', validateLogin, userController.login);
/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [user-service]
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *           example:
 *             refreshToken: your-refresh-token
 *     responses:
 *       200:
 *         description: Token refreshed
 */
// Handles POST /refresh.
router.post('/refresh', validateRefresh, userController.refresh);
/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [user-service]
 *     summary: User logout
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */
// Handles POST /logout.
router.post('/logout', userController.logout);
/**
 * @openapi
 * /api/v1/auth/validate:
 *   post:
 *     tags: [user-service]
 *     summary: Validate token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *           example:
 *             token: your-jwt-token
 *     responses:
 *       200:
 *         description: Token validation result
 */
// Handles POST /validate.
router.post('/validate', userController.validateToken);
/**
 * @openapi
 * /api/v1/auth/profile:
 *   get:
 *     tags: [user-service]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: Profile returned
 *       401:
 *         description: Unauthorized
 */
// Handles GET /profile.
router.get('/profile', authenticate, userController.getProfile);
/**
 * @openapi
 * /api/v1/auth/profile:
 *   patch:
 *     tags: [user-service]
 *     summary: Update current user profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *           example:
 *             firstName: Alice
 *             lastName: Tan
 *             phone: "+6591234567"
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Unauthorized
 */
// Handles PATCH /profile.
router.patch('/profile', authenticate, validateUpdateProfile, userController.updateProfile);
/**
 * @openapi
 * /api/v1/auth/change-password:
 *   post:
 *     tags: [user-service]
 *     summary: Change current user password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *           example:
 *             currentPassword: Passw0rd!
 *             newPassword: NewPassw0rd!
 *     responses:
 *       200:
 *         description: Password changed
 *       401:
 *         description: Unauthorized
 */
// Handles POST /change-password.
router.post('/change-password', authenticate, validateChangePassword, userController.changePassword);
/**
 * @openapi
 * /api/v1/auth/users/{userId}:
 *   get:
 *     tags: [user-service]
 *     summary: Get a user profile by id (admin only)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile returned
 *       403:
 *         description: Forbidden
 */
// Handles GET /users/:userId.
router.get('/users/:userId', authenticate, authorize(USER_ROLES.ADMIN), userController.getProfile);

module.exports = router;
