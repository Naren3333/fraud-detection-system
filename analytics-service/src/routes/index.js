const express = require('express');
const healthRoutes = require('./health');
const analyticsRoutes = require('./analytics');

const router = express.Router();

router.use(healthRoutes);
router.use(analyticsRoutes);

module.exports = router;