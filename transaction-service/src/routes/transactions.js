const router = require('express').Router();
const ctrl   = require('../controllers/transactionController');
const { validateCreateTransaction } = require('../middleware/validate');

// Handles POST /.
router.post('/',                      validateCreateTransaction, ctrl.create.bind(ctrl));
// Handles GET /customer/:customerId.
router.get('/customer/:customerId',   ctrl.getByCustomer.bind(ctrl));
// Handles GET /:id.
router.get('/:id',                    ctrl.getById.bind(ctrl));

module.exports = router;