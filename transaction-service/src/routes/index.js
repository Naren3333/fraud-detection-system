const router = require('express').Router();
const { register } = require('../utils/metrics');

router.use(require('./health'));
// Handles USE /transactions.
router.use('/transactions', require('./transactions'));
/**
 * @openapi
 * /api/v1/metrics:
 *   get:
 *     tags: [transaction-service]
 *     summary: Prometheus metrics endpoint
 *     responses:
 *       200:
 *         description: Metrics payload
 */
// Handles GET /metrics.
router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = router;
