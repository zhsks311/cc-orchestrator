/**
 * Structured Logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: LogContext;
}

export class Logger {
  private component: string;
  private static logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(component: string) {
    this.component = component;
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.LOG_LEVELS[level] >= Logger.LOG_LEVELS[Logger.logLevel];
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      // Sanitize context (remove sensitive data)
      entry.context = this.sanitizeContext(context);
    }

    // Output to stderr (MCP uses stdout for protocol messages)
    console.error(JSON.stringify(entry));
  }

  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};
    const sensitiveKeys = ['apiKey', 'password', 'secret', 'token', 'key'];

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (value instanceof Error) {
        sanitized[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack?.split('\n').slice(0, 5).join('\n'),
        };
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }
}
