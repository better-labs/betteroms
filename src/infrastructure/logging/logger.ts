import pino from 'pino';

/**
 * Structured logger for BetterOMS using Pino
 *
 * Usage:
 * - logger.info('message')
 * - logger.error({ err }, 'error message')
 * - logger.debug({ data }, 'debug info')
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development',
  },
});

/**
 * Create a child logger with additional context
 *
 * @example
 * const moduleLogger = createLogger({ module: 'executor' });
 * moduleLogger.info('Processing trade');
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
