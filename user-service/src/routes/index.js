const express = require('express');
const userRoutes = require('./users');
const healthRoutes = require('./health');

const router = express.Router();

router.use('/auth', userRoutes);
router.use(healthRoutes);

module.exports = router;
