const express = require('express');
const healthRoutes = require('./health');
const proxyRoutes = require('./proxy');

const router = express.Router();

router.use(healthRoutes);
router.use(proxyRoutes);

module.exports = router;
