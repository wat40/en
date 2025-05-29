/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, details);
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 401, details);
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', details?: any) {
    super(message, 403, details);
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, details);
  }
}

/**
 * Conflict error class
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, details);
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, details);
  }
}

/**
 * Internal server error class
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, details);
  }
}

/**
 * Service unavailable error class
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', details?: any) {
    super(message, 503, details);
  }
}

/**
 * Error code mappings
 */
export const ERROR_CODES = {
  // Authentication errors (401xx)
  INVALID_CREDENTIALS: 40101,
  TOKEN_EXPIRED: 40102,
  TOKEN_INVALID: 40103,
  MFA_REQUIRED: 40104,
  MFA_INVALID: 40105,

  // Authorization errors (403xx)
  ACCESS_DENIED: 40301,
  INSUFFICIENT_PERMISSIONS: 40302,
  ACCOUNT_SUSPENDED: 40303,
  ACCOUNT_BANNED: 40304,

  // Not found errors (404xx)
  USER_NOT_FOUND: 40401,
  SERVER_NOT_FOUND: 40402,
  CHANNEL_NOT_FOUND: 40403,
  MESSAGE_NOT_FOUND: 40404,
  RESOURCE_NOT_FOUND: 40405,

  // Conflict errors (409xx)
  USER_ALREADY_EXISTS: 40901,
  USERNAME_TAKEN: 40902,
  EMAIL_TAKEN: 40903,
  SERVER_NAME_TAKEN: 40904,
  CHANNEL_NAME_TAKEN: 40905,

  // Validation errors (400xx)
  INVALID_INPUT: 40001,
  MISSING_REQUIRED_FIELD: 40002,
  INVALID_EMAIL_FORMAT: 40003,
  PASSWORD_TOO_WEAK: 40004,
  USERNAME_INVALID: 40005,
  FILE_TOO_LARGE: 40006,
  INVALID_FILE_TYPE: 40007,

  // Rate limit errors (429xx)
  RATE_LIMIT_EXCEEDED: 42901,
  MESSAGE_RATE_LIMIT: 42902,
  API_RATE_LIMIT: 42903,

  // Server errors (500xx)
  INTERNAL_SERVER_ERROR: 50001,
  DATABASE_ERROR: 50002,
  EXTERNAL_SERVICE_ERROR: 50003,
  FILE_UPLOAD_ERROR: 50004,
} as const;

/**
 * Create standardized error response
 */
export function createErrorResponse(error: AppError | Error, requestId?: string) {
  if (error instanceof AppError) {
    return {
      error: {
        code: getErrorCode(error),
        message: error.message,
        details: error.details,
        requestId,
      },
    };
  }

  // Handle unknown errors
  return {
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      requestId,
    },
  };
}

/**
 * Get error code based on error type and status
 */
function getErrorCode(error: AppError): number {
  const baseCode = error.statusCode * 100;
  
  // Try to map specific error messages to codes
  switch (error.message.toLowerCase()) {
    case 'invalid credentials':
      return ERROR_CODES.INVALID_CREDENTIALS;
    case 'token expired':
      return ERROR_CODES.TOKEN_EXPIRED;
    case 'user not found':
      return ERROR_CODES.USER_NOT_FOUND;
    case 'server not found':
      return ERROR_CODES.SERVER_NOT_FOUND;
    case 'channel not found':
      return ERROR_CODES.CHANNEL_NOT_FOUND;
    case 'user already exists':
      return ERROR_CODES.USER_ALREADY_EXISTS;
    case 'username is already taken':
      return ERROR_CODES.USERNAME_TAKEN;
    case 'rate limit exceeded':
      return ERROR_CODES.RATE_LIMIT_EXCEEDED;
    default:
      return baseCode + 1; // Generic code for the status
  }
}

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
