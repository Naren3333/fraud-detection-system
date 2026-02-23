const express = require('express');
const healthRoutes = require('./health');
const metricsRoutes = require('./metrics');
const scoringRoutes = require('./scoring');

const router = express.Router();

router.use(healthRoutes);
router.use(metricsRoutes);
router.use(scoringRoutes);

module.exports = router;