const service        = require('../services/transactionService');
const { NotFoundError } = require('../utils/errors');

class TransactionController {

  async create(req, res, next) {
    try {
      const result = await service.createTransaction(req.body, {
        requestId:      req.requestId,
        correlationId:  req.correlationId,
        idempotencyKey: req.idempotencyKey,
        ipAddress:      req.ipAddress,
        userAgent:      req.userAgent,
        userId:         req.userId,
      });

      const { idempotent, statusCode, ...body } = result;
      res.status(idempotent ? statusCode : 201).json({ success: true, idempotent: !!idempotent, data: body });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const txn = await service.getById(req.params.id);
      if (!txn) throw new NotFoundError(`Transaction ${req.params.id} not found`);
      res.json({ success: true, data: txn });
    } catch (err) { next(err); }
  }

  async getByCustomer(req, res, next) {
    try {
      const limit  = Math.min(parseInt(req.query.limit,  10) || 20, 100);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);
      const txns   = await service.getByCustomer(req.params.customerId, { limit, offset });
      res.json({ success: true, data: txns, meta: { limit, offset, count: txns.length } });
    } catch (err) { next(err); }
  }
}

module.exports = new TransactionController();