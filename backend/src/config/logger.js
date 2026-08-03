import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Application logger.
 *
 * Pretty-printed in development, newline-delimited JSON in production so log
 * aggregators can parse it. Never logs tokens or request bodies.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.query.token',
      'gmail_refresh_token',
      'access_token',
      'refresh_token',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

/** Child logger tagged with a component name, e.g. logger.child({ worker: 'cv' }). */
export function workerLogger(name) {
  return logger.child({ component: `${name}Worker` });
}

export default logger;
