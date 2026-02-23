const mlScoringService = require('../services/mlScoringService');
const logger = require('../config/logger');

class MLScoringController {
  
  // Handles score.
  async score(req, res) {
    const correlationId = req.correlationId || req.body.correlationId;
    const log = logger.child({ correlationId });

    const { transaction, ruleResults } = req.body;

    log.info('ML scoring request received', {
      transactionId: transaction.id,
      customerId: transaction.customerId,
    });

    const result = await mlScoringService.score(transaction, ruleResults, log);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  
  // Handles score batch.
  async scoreBatch(req, res) {
    const { transactions, ruleResults } = req.body;

    logger.info('Batch ML scoring request', { count: transactions.length });

    const results = await mlScoringService.scoreBatch(transactions, ruleResults);

    res.status(200).json({
      success: true,
      data: {
        results,
        count: results.length,
      },
    });
  }

  
  // Handles get model info.
  async getModelInfo(req, res) {
    const stats = mlScoringService.getStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  }
}

module.exports = new MLScoringController();