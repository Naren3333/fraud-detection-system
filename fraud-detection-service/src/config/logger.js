const winston = require('winston');
const config = require('./index');

// Fields that should never appear in logs (PII / sensitive data)
const REDACTED_FIELDS = new Set([
  'password', 'cardNumber', 'cvv', 'ssn', 'accountNumber',
  'authorization', 'token', 'secret', 'apiKey', 'privateKey',
]);

const LEVEL_SYMBOL = Symbol.for('level');
const MESSAGE_SYMBOL = Symbol.for('message');
const SPLAT_SYMBOL = Symbol.for('splat');

const redact = (obj, depth = 0) => {
  if (depth > 6 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (REDACTED_FIELDS.has(key)) return [key, '[REDACTED]'];
      return [key, redact(value, depth + 1)];
    })
  );
};

// FIX: Preserve Winston's internal Symbol properties after redaction.
// Object.fromEntries(Object.entries()) strips Symbols — Winston needs
// Symbol.for('level') and Symbol.for('message') to route and output logs.
// Without them, colorize() silently fails and Console transport writes nothing.
const redactFilter = winston.format((info) => {
  const redacted = redact(info);

  // Re-attach Winston's internal Symbols that Object.fromEntries strips
  if (info[LEVEL_SYMBOL] !== undefined) redacted[LEVEL_SYMBOL] = info[LEVEL_SYMBOL];
  if (info[MESSAGE_SYMBOL] !== undefined) redacted[MESSAGE_SYMBOL] = info[MESSAGE_SYMBOL];
  if (info[SPLAT_SYMBOL] !== undefined) redacted[SPLAT_SYMBOL] = info[SPLAT_SYMBOL];

  return redacted;
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  redactFilter(),
  winston.format.json()
);

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  redactFilter(),
  winston.format.printf(({ timestamp, level, message, service, correlationId, ...meta }) => {
    let msg = `${timestamp} [${service}]${correlationId ? ` [${correlationId}]` : ''} ${level}: ${message}`;
    const metaKeys = Object.keys(meta).filter((k) => k !== 'level' && k !== 'timestamp');
    if (metaKeys.length > 0) {
      const metaObj = Object.fromEntries(metaKeys.map((k) => [k, meta[k]]));
      msg += ` ${JSON.stringify(metaObj)}`;
    }
    return msg;
  })
);

// FIX: Do NOT set format at the logger level — only set it on the transport.
// When format is specified at BOTH createLogger and transport level, Winston
// chains them: logger-level format runs first, then transport-level format.
// This caused: json() serializing the info object BEFORE devFormat's printf
// could run, double-stamping timestamps, and redactFilter stripping Symbols twice.
const transports = [
  new winston.transports.Console({
    format: config.env === 'production' ? jsonFormat : devFormat,
  }),
];

const logger = winston.createLogger({
  level: config.logLevel,
  // No format here — format is handled entirely by each transport above
  defaultMeta: {
    service: config.serviceName,
    version: config.serviceVersion,
    env: config.env,
  },
  transports,
  exitOnError: false,
});

/**
 * Returns a child logger bound to a specific correlation ID and context.
 * Use this per-request or per-message to trace execution across logs.
 */
logger.child = (meta) => {
  const child = Object.create(logger);
  const baseMeta = { ...meta };

  ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].forEach((level) => {
    child[level] = (message, extra = {}) => {
      logger[level](message, { ...baseMeta, ...extra });
    };
  });

  return child;
};

module.exports = logger;