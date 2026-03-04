const reviewService = require('../services/reviewService');

class ReviewController {
  // Handles list pending.
  async listPending(req, res) {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const data = await reviewService.listPending(limit, offset);
    res.json({ success: true, data, meta: { limit, offset, count: data.length } });
  }

  // Handles get by transaction.
  async getByTransaction(req, res) {
    const data = await reviewService.getReviewByTransaction(req.params.transactionId);
    if (!data) {
      return res.status(404).json({
        success: false,
        error: `Manual review for transaction ${req.params.transactionId} not found`,
      });
    }
    res.json({ success: true, data });
  }

  // Handles submit decision.
  async submitDecision(req, res) {
    const { decision, reviewedBy, notes } = req.body;
    const allowed = new Set(['APPROVED', 'DECLINED']);
    if (!allowed.has(decision)) {
      return res.status(400).json({
        success: false,
        error: 'decision must be APPROVED or DECLINED',
      });
    }
    if (!reviewedBy || typeof reviewedBy !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'reviewedBy is required',
      });
    }

    try {
      const data = await reviewService.applyDecision({
        transactionId: req.params.transactionId,
        decision,
        reviewedBy,
        notes,
      });

      res.json({ success: true, data });
    } catch (err) {
      if (err.message.startsWith('No manual review record')) {
        return res.status(404).json({
          success: false,
          error: err.message,
        });
      }
      throw err;
    }
  }
}

module.exports = new ReviewController();
