const auditRepository = require('../repositories/auditRepository');
const logger = require('../config/logger');

class AuditController {
  /**
   * GET /api/v1/audit/transaction/:transactionId
   * Get full audit trail for a transaction
   */
  async getTransactionAudit(req, res) {
    const { transactionId } = req.params;
    const includePayload = req.query.includePayload !== 'false';
    const queriedBy = req.headers['x-user-id'] || 'anonymous';

    const startTime = Date.now();

    logger.info('Transaction audit query', { transactionId, queriedBy });

    const trail = await auditRepository.getAuditTrail(transactionId, { includePayload });

    const executionTime = Date.now() - startTime;

    // Log the audit query (audit the auditors!)
    await auditRepository.logQuery(
      'transaction_audit',
      { transactionId, includePayload },
      trail.length,
      executionTime,
      queriedBy,
      req.query.reason || 'investigation'
    );

    res.status(200).json({
      success: true,
      data: {
        transactionId,
        eventCount: trail.length,
        events: trail,
      },
      metadata: {
        executionTimeMs: executionTime,
        queriedBy,
      },
    });
  }

  /**
   * GET /api/v1/audit/customer/:customerId
   * Get audit trail for a customer
   */
  async getCustomerAudit(req, res) {
    const { customerId } = req.params;
    const { since, until, eventTypes, limit } = req.query;
    const queriedBy = req.headers['x-user-id'] || 'anonymous';

    const startTime = Date.now();

    logger.info('Customer audit query', { customerId, queriedBy });

    const trail = await auditRepository.getCustomerAuditTrail(customerId, {
      since: since ? new Date(since) : null,
      until: until ? new Date(until) : null,
      eventTypes: eventTypes ? eventTypes.split(',') : null,
      limit: limit ? parseInt(limit) : 100,
    });

    const executionTime = Date.now() - startTime;

    await auditRepository.logQuery(
      'customer_audit',
      { customerId, since, until, eventTypes, limit },
      trail.length,
      executionTime,
      queriedBy,
      req.query.reason || 'investigation'
    );

    res.status(200).json({
      success: true,
      data: {
        customerId,
        eventCount: trail.length,
        events: trail,
      },
      metadata: {
        executionTimeMs: executionTime,
        queriedBy,
      },
    });
  }

  /**
   * POST /api/v1/audit/verify
   * Verify chain integrity (detect tampering)
   */
  async verifyIntegrity(req, res) {
    const { startEventId, endEventId } = req.body;

    logger.info('Chain integrity verification', { startEventId, endEventId });

    const result = await auditRepository.verifyChainIntegrity(startEventId, endEventId);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /**
   * GET /api/v1/audit/stats
   * Get audit statistics
   */
  async getStats(req, res) {
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h

    const stats = await auditRepository.getStats(since);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        since,
      },
    });
  }
}

module.exports = new AuditController();
