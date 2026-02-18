const express = require('express');
const healthRoutes = require('./health');

const router = express.Router();

router.use(healthRoutes);

module.exports = router;
