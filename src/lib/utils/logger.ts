/**
 * Centralized logger — structured logging for the platform.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private context?: string;

  constructor(context?: string, minLevel?: LogLevel) {
    this.context = context;
    this.minLevel = minLevel ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  }

  /** Create a child logger with a specific context */
  child(context: string): Logger {
    return new Logger(`${this.context ? this.context + '.' : ''}${context}`, this.minLevel);
  }

  debug(message: string, data?: Record<string, unknown>) { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>) { this.log('error', message, data); }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      data,
    };

    const formatted = `[${entry.timestamp}] [${level.toUpperCase()}]${this.context ? ` [${this.context}]` : ''} ${message}`;

    switch (level) {
      case 'error': console.error(formatted, data ?? ''); break;
      case 'warn': console.warn(formatted, data ?? ''); break;
      case 'info': console.log(formatted, data ?? ''); break;
      case 'debug': console.debug(formatted, data ?? ''); break;
    }
  }
}

/** Root logger */
export const logger = new Logger('elio.market');

/** Pre-configured loggers for common contexts */
export const pluginLogger = logger.child('plugins');
export const executionLogger = logger.child('execution');
export const aiLogger = logger.child('ai');
export const authLogger = logger.child('auth');
