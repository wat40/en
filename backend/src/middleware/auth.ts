import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';

import { authService } from '@/services/auth';
import { db } from '@/config/database';
import { users } from '@/models/schema';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        displayName?: string;
        verified: boolean;
        bot: boolean;
        system: boolean;
        mfaEnabled: boolean;
        premiumType: number;
        flags: number;
        publicFlags: number;
      };
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new AppError('Authorization header missing', 401);
    }

    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      throw new AppError('Invalid authorization format', 401);
    }

    // Verify token
    const payload = await authService.verifyToken(token);

    // Get user from database
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        verified: users.verified,
        bot: users.bot,
        system: users.system,
        mfaEnabled: users.mfaEnabled,
        premiumType: users.premiumType,
        flags: users.flags,
        publicFlags: users.publicFlags,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      throw new AppError('User not found', 401);
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: {
          code: error.statusCode * 100 + 1,
          message: error.message,
          details: error.details,
        },
      });
    } else {
      res.status(401).json({
        error: {
          code: 40101,
          message: 'Unauthorized',
          details: 'Invalid or expired token',
        },
      });
    }
  }
}

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't fail if missing
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return next();
    }

    const payload = await authService.verifyToken(token);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        verified: users.verified,
        bot: users.bot,
        system: users.system,
        mfaEnabled: users.mfaEnabled,
        premiumType: users.premiumType,
        flags: users.flags,
        publicFlags: users.publicFlags,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
}

/**
 * Admin authentication middleware
 * Requires user to be authenticated and have admin privileges
 */
export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authMiddleware(req, res, () => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 40101,
          message: 'Unauthorized',
          details: 'Authentication required',
        },
      });
    }

    // Check if user has admin flags
    const isAdmin = (req.user.flags & 1) === 1; // Admin flag
    const isSystem = req.user.system;

    if (!isAdmin && !isSystem) {
      return res.status(403).json({
        error: {
          code: 40301,
          message: 'Forbidden',
          details: 'Admin privileges required',
        },
      });
    }

    next();
  });
}

/**
 * Bot authentication middleware
 * Verifies bot token instead of user token
 */
export async function botAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new AppError('Authorization header missing', 401);
    }

    const token = extractBotTokenFromHeader(authHeader);
    if (!token) {
      throw new AppError('Invalid bot authorization format', 401);
    }

    // TODO: Implement bot token verification
    // For now, this is a placeholder
    throw new AppError('Bot authentication not implemented', 501);
  } catch (error) {
    logger.error('Bot authentication error:', error);
    
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: {
          code: error.statusCode * 100 + 1,
          message: error.message,
          details: error.details,
        },
      });
    } else {
      res.status(401).json({
        error: {
          code: 40101,
          message: 'Unauthorized',
          details: 'Invalid bot token',
        },
      });
    }
  }
}

/**
 * Extract JWT token from Authorization header
 */
function extractTokenFromHeader(authHeader: string): string | null {
  const parts = authHeader.split(' ');
  
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;
  
  if (scheme !== 'Bearer') {
    return null;
  }

  return token;
}

/**
 * Extract bot token from Authorization header
 */
function extractBotTokenFromHeader(authHeader: string): string | null {
  const parts = authHeader.split(' ');
  
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;
  
  if (scheme !== 'Bot') {
    return null;
  }

  return token;
}

/**
 * Require specific permissions middleware
 */
export function requirePermissions(permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 40101,
          message: 'Unauthorized',
          details: 'Authentication required',
        },
      });
    }

    // TODO: Implement permission checking logic
    // This would check if the user has the required permissions
    // in the current context (server, channel, etc.)
    
    next();
  };
}
