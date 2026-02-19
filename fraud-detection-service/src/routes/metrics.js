const router = require('express').Router();
const { register } = require('../metrics');
const config = require('../config');

// Prometheus scrape endpoint
// In production, restrict access to this endpoint to your internal network / scraper only.
router.get('/metrics', async (req, res) => {
  if (!config.metrics.enabled) {
    return res.status(404).json({ error: 'Metrics disabled' });
  }

  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;