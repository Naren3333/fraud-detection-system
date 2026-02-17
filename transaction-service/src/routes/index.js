const router = require('express').Router();
const { register } = require('../utils/metrics');

router.use(require('./health'));
router.use('/transactions', require('./transactions'));

// Prometheus scrape endpoint
router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = router;