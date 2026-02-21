const router = require('express').Router();
const analyticsController = require('./analyticsController');

// Get dashboard metrics
router.get('/analytics/dashboard', analyticsController.getDashboard);

// Get real-time stats
router.get('/analytics/realtime', analyticsController.getRealTime);

module.exports = router;
