const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const { CURRENCIES }      = require('../utils/constants');

const createTransactionSchema = Joi.object({
  customerId:  Joi.string().min(1).max(255).required(),
  merchantId:  Joi.string().min(1).max(255).required(),
  amount:      Joi.number().positive().precision(2).max(1_000_000).required(),
  currency:    Joi.string().valid(...CURRENCIES).default('USD'),
  cardNumber:  Joi.string().creditCard().optional(),   // Joi validates Luhn checksum
  cardType:    Joi.string().valid('visa','mastercard','amex','discover','other').optional(),
  deviceId:    Joi.string().max(255).optional(),
  ipAddress:   Joi.string().ip().optional(),
  location: Joi.object({
    country: Joi.string().length(2).optional(),
    city:    Joi.string().max(100).optional(),
    lat:     Joi.number().min(-90).max(90).optional(),
    lng:     Joi.number().min(-180).max(180).optional(),
  }).optional(),
  metadata: Joi.object().optional().default({}),
});

const validateCreateTransaction = (req, res, next) => {
  const { error, value } = createTransactionSchema.validate(req.body, {
    abortEarly:   false,
    stripUnknown: true,
    convert:      true,
  });

  if (error) {
    const details = error.details.map(d => ({
      field:   d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    return next(new ValidationError(JSON.stringify(details)));
  }

  req.body = value;
  next();
};

module.exports = { validateCreateTransaction };