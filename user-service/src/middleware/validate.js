const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const { USER_ROLES } = require('../utils/constants');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(72).required(),
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  role: Joi.string().valid(...Object.values(USER_ROLES)).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  metadata: Joi.object().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  metadata: Joi.object().optional(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(72).required(),
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
  validateRegister: validate(registerSchema),
  validateLogin: validate(loginSchema),
  validateRefresh: validate(refreshSchema),
  validateUpdateProfile: validate(updateProfileSchema),
  validateChangePassword: validate(changePasswordSchema),
};