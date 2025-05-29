import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '@/config';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    level: config.logging.level,
    format: config.isDevelopment ? consoleFormat : logFormat,
  })
);

// File transport for production
if (config.isProduction) {
  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );

  // Combined log file
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan HTTP logging
export const loggerStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logHelpers = {
  /**
   * Log user action
   */
  userAction: (userId: string, action: string, details?: any) => {
    logger.info('User action', {
      userId,
      action,
      details,
      type: 'user_action',
    });
  },

  /**
   * Log API request
   */
  apiRequest: (method: string, url: string, userId?: string, duration?: number) => {
    logger.http('API request', {
      method,
      url,
      userId,
      duration,
      type: 'api_request',
    });
  },

  /**
   * Log database query
   */
  dbQuery: (query: string, duration?: number, error?: any) => {
    if (error) {
      logger.error('Database query failed', {
        query,
        duration,
        error: error.message,
        type: 'db_query',
      });
    } else {
      logger.debug('Database query', {
        query,
        duration,
        type: 'db_query',
      });
    }
  },

  /**
   * Log authentication event
   */
  authEvent: (event: string, userId?: string, ip?: string, details?: any) => {
    logger.info('Authentication event', {
      event,
      userId,
      ip,
      details,
      type: 'auth_event',
    });
  },

  /**
   * Log security event
   */
  securityEvent: (event: string, severity: 'low' | 'medium' | 'high' | 'critical', details?: any) => {
    const logLevel = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    logger[logLevel]('Security event', {
      event,
      severity,
      details,
      type: 'security_event',
    });
  },

  /**
   * Log performance metric
   */
  performance: (metric: string, value: number, unit: string, details?: any) => {
    logger.info('Performance metric', {
      metric,
      value,
      unit,
      details,
      type: 'performance',
    });
  },

  /**
   * Log external service call
   */
  externalService: (service: string, operation: string, duration?: number, error?: any) => {
    if (error) {
      logger.error('External service call failed', {
        service,
        operation,
        duration,
        error: error.message,
        type: 'external_service',
      });
    } else {
      logger.info('External service call', {
        service,
        operation,
        duration,
        type: 'external_service',
      });
    }
  },

  /**
   * Log WebSocket event
   */
  websocketEvent: (event: string, userId?: string, details?: any) => {
    logger.info('WebSocket event', {
      event,
      userId,
      details,
      type: 'websocket_event',
    });
  },

  /**
   * Log file operation
   */
  fileOperation: (operation: string, filename: string, size?: number, error?: any) => {
    if (error) {
      logger.error('File operation failed', {
        operation,
        filename,
        size,
        error: error.message,
        type: 'file_operation',
      });
    } else {
      logger.info('File operation', {
        operation,
        filename,
        size,
        type: 'file_operation',
      });
    }
  },
};

// Export default logger
export default logger;
