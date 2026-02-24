const express = require('express');
const controller = require('../controllers/reviewController');

const router = express.Router();

router.get('/reviews/pending', controller.listPending.bind(controller));
router.get('/reviews/:transactionId', controller.getByTransaction.bind(controller));
router.post('/reviews/:transactionId/decision', controller.submitDecision.bind(controller));

module.exports = router;
