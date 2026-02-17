require('dotenv').config();
const fs     = require('fs');
const path   = require('path');
const { createPool, closePool, query } = require('./pool');
const logger = require('../config/logger');

(async () => {
  logger.info('Running database migrations...');
  try {
    createPool();
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_initial_schema.sql'),
      'utf8'
    );
    await query(sql);
    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
  } finally {
    await closePool();
  }
})();