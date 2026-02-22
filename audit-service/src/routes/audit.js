const router = require('express').Router();
const auditController = require('../controllers/auditController');

// Get transaction audit trail
router.get('/audit/transaction/:transactionId', auditController.getTransactionAudit);

// Get customer audit trail
router.get('/audit/customer/:customerId', auditController.getCustomerAudit);

// Verify chain integrity
router.post('/audit/verify', auditController.verifyIntegrity);

// Get audit statistics
router.get('/audit/stats', auditController.getStats);

module.exports = router;
