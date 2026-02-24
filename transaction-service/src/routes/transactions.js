const router = require('express').Router();
const ctrl   = require('../controllers/transactionController');
const { validateCreateTransaction } = require('../middleware/validate');

/**
 * @openapi
 * /api/v1/transactions:
 *   post:
 *     tags: [transaction-service]
 *     summary: Create a transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, amount, currency]
 *             properties:
 *               customerId:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               merchantId:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *           example:
 *             customerId: cust-1001
 *             amount: 250.75
 *             currency: SGD
 *             merchantId: merch-22
 *             paymentMethod: card
 *     responses:
 *       201:
 *         description: Transaction created
 *       400:
 *         description: Invalid request
 */
// Handles POST /.
router.post('/',                      validateCreateTransaction, ctrl.create.bind(ctrl));
/**
 * @openapi
 * /api/v1/transactions/customer/{customerId}:
 *   get:
 *     tags: [transaction-service]
 *     summary: List transactions by customer
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer transactions
 */
// Handles GET /customer/:customerId.
router.get('/customer/:customerId',   ctrl.getByCustomer.bind(ctrl));
/**
 * @openapi
 * /api/v1/transactions/{id}:
 *   get:
 *     tags: [transaction-service]
 *     summary: Get transaction by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction found
 *       404:
 *         description: Transaction not found
 */
// Handles GET /:id.
router.get('/:id',                    ctrl.getById.bind(ctrl));

module.exports = router;
