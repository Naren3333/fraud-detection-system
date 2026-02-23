const router = require('express').Router();
const auditController = require('../controllers/auditController');
// Handles GET /audit/transaction/:transactionId.
router.get('/audit/transaction/:transactionId', auditController.getTransactionAudit);
// Handles GET /audit/customer/:customerId.
router.get('/audit/customer/:customerId', auditController.getCustomerAudit);
// Handles POST /audit/verify.
router.post('/audit/verify', auditController.verifyIntegrity);
// Handles GET /audit/stats.
router.get('/audit/stats', auditController.getStats);

module.exports = router;