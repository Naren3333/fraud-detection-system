const router = require('express').Router();
const decisionController = require('../controllers/decisionController');
// Handles GET /decisions/:transactionId.
router.get('/decisions/:transactionId', decisionController.getDecisionByTransaction);
// Handles GET /decisions/stats.
router.get('/decisions/stats', decisionController.getStats);
// Handles GET /thresholds.
router.get('/thresholds', decisionController.getThresholds);

module.exports = router;