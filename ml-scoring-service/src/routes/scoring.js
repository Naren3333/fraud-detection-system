const router = require('express').Router();
const mlScoringController = require('../controllers/mlScoringController');
const { validateScoreRequest, validateBatchScoreRequest } = require('../middleware/validate');
const { requestTimeout } = require('../middleware/requestTimeout');
router.post(
  '/score',
  requestTimeout,
  validateScoreRequest,
  mlScoringController.score
);
router.post(
  '/score/batch',
  requestTimeout,
  validateBatchScoreRequest,
  mlScoringController.scoreBatch
);
// Handles GET /model/info.
router.get('/model/info', mlScoringController.getModelInfo);

module.exports = router;