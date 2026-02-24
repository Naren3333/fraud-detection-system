const router = require('express').Router();
const mlScoringController = require('../controllers/mlScoringController');
const { validateScoreRequest, validateBatchScoreRequest } = require('../middleware/validate');
const { requestTimeout } = require('../middleware/requestTimeout');
/**
 * @openapi
 * /api/v1/score:
 *   post:
 *     tags: [ml-scoring-service]
 *     summary: Score a single transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transactionId, customerId, amount, currency]
 *             properties:
 *               transactionId:
 *                 type: string
 *               customerId:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               merchantId:
 *                 type: string
 *               country:
 *                 type: string
 *           example:
 *             transactionId: txn-2001
 *             customerId: cust-1001
 *             amount: 420.5
 *             currency: SGD
 *             merchantId: merch-22
 *             country: SG
 *     responses:
 *       200:
 *         description: Score result returned
 *       400:
 *         description: Invalid input
 */
router.post(
  '/score',
  requestTimeout,
  validateScoreRequest,
  mlScoringController.score
);
/**
 * @openapi
 * /api/v1/score/batch:
 *   post:
 *     tags: [ml-scoring-service]
 *     summary: Score multiple transactions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transactions]
 *             properties:
 *               transactions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     customerId:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     currency:
 *                       type: string
 *           example:
 *             transactions:
 *               - transactionId: txn-2001
 *                 customerId: cust-1001
 *                 amount: 420.5
 *                 currency: SGD
 *               - transactionId: txn-2002
 *                 customerId: cust-1002
 *                 amount: 99.99
 *                 currency: SGD
 *     responses:
 *       200:
 *         description: Batch score result returned
 *       400:
 *         description: Invalid input
 */
router.post(
  '/score/batch',
  requestTimeout,
  validateBatchScoreRequest,
  mlScoringController.scoreBatch
);
/**
 * @openapi
 * /api/v1/model/info:
 *   get:
 *     tags: [ml-scoring-service]
 *     summary: Get loaded model metadata
 *     responses:
 *       200:
 *         description: Model metadata returned
 */
// Handles GET /model/info.
router.get('/model/info', mlScoringController.getModelInfo);

module.exports = router;
