const router = require('express').Router();
const { register } = require('../utils/metrics');

router.use(require('./health'));
// Handles USE /transactions.
router.use('/transactions', require('./transactions'));
// Handles GET /metrics.
router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = router;