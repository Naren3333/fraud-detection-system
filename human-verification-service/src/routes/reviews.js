const express = require('express');
const controller = require('../controllers/reviewController');

const router = express.Router();

/**
 * @openapi
 * /api/v1/reviews/pending:
 *   get:
 *     tags: [human-verification-service]
 *     summary: List pending review cases
 *     responses:
 *       200:
 *         description: Pending cases returned
 */
router.get('/reviews/pending', controller.listPending.bind(controller));
/**
 * @openapi
 * /api/v1/reviews/{transactionId}:
 *   get:
 *     tags: [human-verification-service]
 *     summary: Get review record by transaction id
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review record returned
 *       404:
 *         description: Review record not found
 */
router.get('/reviews/:transactionId', controller.getByTransaction.bind(controller));
/**
 * @openapi
 * /api/v1/reviews/{transactionId}/decision:
 *   post:
 *     tags: [human-verification-service]
 *     summary: Submit manual review decision
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approve, decline]
 *               reviewerId:
 *                 type: string
 *               reason:
 *                 type: string
 *           example:
 *             decision: approve
 *             reviewerId: reviewer-1
 *             reason: customer confirmed transaction
 *       200:
 *         description: Decision submitted
 *       400:
 *         description: Invalid decision payload
 */
router.post('/reviews/:transactionId/decision', controller.submitDecision.bind(controller));

module.exports = router;
