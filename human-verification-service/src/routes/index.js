const express = require('express');
const healthRoutes = require('./health');
const reviewRoutes = require('./reviews');

const router = express.Router();

router.use(healthRoutes);
router.use(reviewRoutes);

module.exports = router;
