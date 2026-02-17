const winston        = require('winston');
const DailyRotate    = require('winston-daily-rotate-file');
const config         = require('./index');

const jsonFmt = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const devFmt = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...m }) =>
    `${timestamp} [${config.serviceName}] ${level}: ${message}${Object.keys(m).length ? ' ' + JSON.stringify(m) : ''}`
  )
);

const transports = [
  new winston.transports.Console({ format: config.env === 'production' ? jsonFmt : devFmt }),
];

if (config.env === 'production') {
  transports.push(
    new DailyRotate({ filename: 'logs/txn-%DATE%.log',       datePattern: 'YYYY-MM-DD', maxFiles: '14d', format: jsonFmt }),
    new DailyRotate({ filename: 'logs/txn-error-%DATE%.log', datePattern: 'YYYY-MM-DD', maxFiles: '30d', level: 'error', format: jsonFmt })
  );
}

module.exports = winston.createLogger({
  level:       config.logLevel,
  defaultMeta: { service: config.serviceName },
  transports,
});