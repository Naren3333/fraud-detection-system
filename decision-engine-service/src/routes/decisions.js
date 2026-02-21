const router = require('express').Router();
const decisionController = require('../controllers/decisionController');

// Get decision by transaction ID
router.get('/decisions/:transactionId', decisionController.getDecisionByTransaction);

// Get decision statistics
router.get('/decisions/stats', decisionController.getStats);

// Get current thresholds
router.get('/thresholds', decisionController.getThresholds);

module.exports = router;
