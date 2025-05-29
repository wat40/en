import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { AppError, createErrorResponse, isOperationalError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { config } from '@/config';

/**
 * Global error handling middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate unique request ID for tracking
  const requestId = uuidv4();

  // Log error details
  logError(error, req, requestId);

  // Handle operational errors
  if (isOperationalError(error)) {
    const errorResponse = createErrorResponse(error as AppError, requestId);
    res.status((error as AppError).statusCode).json(errorResponse);
    return;
  }

  // Handle programming errors
  handleProgrammingError(error, res, requestId);
}

/**
 * Log error with context information
 */
function logError(error: Error, req: Request, requestId: string): void {
  const errorInfo = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error('Server error:', errorInfo);
    } else if (error.statusCode >= 400) {
      logger.warn('Client error:', errorInfo);
    } else {
      logger.info('Request error:', errorInfo);
    }
  } else {
    logger.error('Unhandled error:', errorInfo);
  }
}

/**
 * Handle programming errors (unexpected errors)
 */
function handleProgrammingError(error: Error, res: Response, requestId: string): void {
  // In production, don't expose internal error details
  if (config.isProduction) {
    res.status(500).json({
      error: {
        code: 50001,
        message: 'Internal server error',
        requestId,
      },
    });
  } else {
    // In development, provide more details for debugging
    res.status(500).json({
      error: {
        code: 50001,
        message: 'Internal server error',
        details: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        requestId,
      },
    });
  }
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 40404,
      message: 'Not Found',
      details: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

/**
 * Validation error handler for express-validator
 */
export function validationErrorHandler(errors: any[]): AppError {
  const details = errors.map(error => ({
    field: error.path || error.param,
    message: error.msg,
    value: error.value,
  }));

  return new AppError('Validation failed', 400, { errors: details });
}

/**
 * Database error handler
 */
export function handleDatabaseError(error: any): AppError {
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // Unique violation
      return new AppError('Resource already exists', 409, {
        constraint: error.constraint,
        detail: error.detail,
      });
    
    case '23503': // Foreign key violation
      return new AppError('Referenced resource not found', 400, {
        constraint: error.constraint,
        detail: error.detail,
      });
    
    case '23502': // Not null violation
      return new AppError('Required field missing', 400, {
        column: error.column,
        detail: error.detail,
      });
    
    case '23514': // Check violation
      return new AppError('Invalid field value', 400, {
        constraint: error.constraint,
        detail: error.detail,
      });
    
    case '42P01': // Undefined table
      return new AppError('Database schema error', 500, {
        detail: error.detail,
      });
    
    case '42703': // Undefined column
      return new AppError('Database schema error', 500, {
        detail: error.detail,
      });
    
    default:
      logger.error('Unhandled database error:', error);
      return new AppError('Database operation failed', 500);
  }
}

/**
 * JWT error handler
 */
export function handleJWTError(error: any): AppError {
  switch (error.name) {
    case 'JsonWebTokenError':
      return new AppError('Invalid token', 401);
    
    case 'TokenExpiredError':
      return new AppError('Token expired', 401);
    
    case 'NotBeforeError':
      return new AppError('Token not active', 401);
    
    default:
      return new AppError('Token verification failed', 401);
  }
}

/**
 * Multer error handler (file upload errors)
 */
export function handleMulterError(error: any): AppError {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new AppError('File too large', 413, {
        maxSize: error.limit,
      });
    
    case 'LIMIT_FILE_COUNT':
      return new AppError('Too many files', 413, {
        maxCount: error.limit,
      });
    
    case 'LIMIT_UNEXPECTED_FILE':
      return new AppError('Unexpected file field', 400, {
        field: error.field,
      });
    
    default:
      return new AppError('File upload failed', 400);
  }
}
