const router = require('express').Router();
const analyticsController = require('./analyticsController');
// Handles GET /analytics/dashboard.
router.get('/analytics/dashboard', analyticsController.getDashboard);
// Handles GET /analytics/realtime.
router.get('/analytics/realtime', analyticsController.getRealTime);

module.exports = router;