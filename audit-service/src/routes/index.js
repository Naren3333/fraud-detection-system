const express = require('express');
const healthRoutes = require('./health');
const auditRoutes = require('./audit');

const router = express.Router();

router.use(healthRoutes);
router.use(auditRoutes);

// Metrics
const { register } = require('../utils/metrics');
const config = require('../config');

router.get('/metrics', async (req, res) => {
  if (!config.metrics.enabled) {
    return res.status(404).json({ error: 'Metrics disabled' });
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = router;
