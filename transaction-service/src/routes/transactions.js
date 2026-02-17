const router = require('express').Router();
const ctrl   = require('../controllers/transactionController');
const { validateCreateTransaction } = require('../middleware/validate');

router.post('/',                      validateCreateTransaction, ctrl.create.bind(ctrl));
router.get('/customer/:customerId',   ctrl.getByCustomer.bind(ctrl));
router.get('/:id',                    ctrl.getById.bind(ctrl));

module.exports = router;