const router = require('express').Router();
const mlScoringController = require('../controllers/mlScoringController');
const { validateScoreRequest, validateBatchScoreRequest } = require('../middleware/validate');
const { requestTimeout } = require('../middleware/requestTimeout');

// Single transaction scoring
router.post(
  '/score',
  requestTimeout,
  validateScoreRequest,
  mlScoringController.score
);

// Batch scoring (future enhancement)
router.post(
  '/score/batch',
  requestTimeout,
  validateBatchScoreRequest,
  mlScoringController.scoreBatch
);

// Model information
router.get('/model/info', mlScoringController.getModelInfo);

module.exports = router;
