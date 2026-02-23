const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const transactionSchema = Joi.object({
  id: Joi.string().required(),
  customerId: Joi.string().required(),
  merchantId: Joi.string().optional(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().length(3).uppercase().required(),
  cardType: Joi.string().optional(),
  deviceId: Joi.string().allow(null).optional(),
  ipAddress: Joi.string().ip().optional(),
  location: Joi.object({
    country: Joi.string().length(2).uppercase().optional(),
    city: Joi.string().optional(),
  }).optional(),
  metadata: Joi.object().optional(),
  createdAt: Joi.string().isoDate().required(),
}).unknown(true);
const ruleResultsSchema = Joi.object({
  flagged: Joi.boolean().required(),
  ruleScore: Joi.number().min(0).max(100).optional(),
  reasons: Joi.array().items(Joi.string()).optional(),
  riskFactors: Joi.object().optional(),
}).unknown(true);
const scoreRequestSchema = Joi.object({
  transaction: transactionSchema.required(),
  ruleResults: ruleResultsSchema.required(),
  correlationId: Joi.string().optional(),
});
const batchScoreRequestSchema = Joi.object({
  transactions: Joi.array().items(transactionSchema).min(1).max(100).required(),
  ruleResults: Joi.array().items(ruleResultsSchema).min(1).max(100).required(),
});

// Handles validate.
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      
      return next(new ValidationError(JSON.stringify(details)));
    }

    req.body = value;
    next();
  };
};

module.exports = {
  validateScoreRequest: validate(scoreRequestSchema),
  validateBatchScoreRequest: validate(batchScoreRequestSchema),
};