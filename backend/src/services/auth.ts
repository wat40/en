import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';

import { config } from '@/config';
import { db } from '@/config/database';
import { users, userSessions } from '@/models/schema';
import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  inviteCode?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  sub: string; // user ID
  email: string;
  username: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface SessionInfo {
  deviceInfo?: any;
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<{ user: any; tokens: TokenPair }> {
    try {
      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new AppError('User already exists with this email', 409);
      }

      // Check username availability
      const existingUsername = await db
        .select()
        .from(users)
        .where(eq(users.username, data.username))
        .limit(1);

      if (existingUsername.length > 0) {
        throw new AppError('Username is already taken', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, config.auth.bcrypt.rounds);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          username: data.username,
          email: data.email,
          passwordHash,
          displayName: data.displayName || data.username,
          verified: false,
        })
        .returning();

      // Generate tokens
      const tokens = await this.generateTokens(newUser);

      // Remove sensitive data
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      logger.info(`User registered: ${newUser.email}`);

      return {
        user: userWithoutPassword,
        tokens,
      };
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(credentials: LoginCredentials, sessionInfo?: SessionInfo): Promise<{ user: any; tokens: TokenPair }> {
    try {
      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.email, credentials.email),
          eq(users.deletedAt, null)
        ))
        .limit(1);

      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401);
      }

      // Check if MFA is enabled and code is required
      if (user.mfaEnabled && !credentials.mfaCode) {
        throw new AppError('MFA code required', 401, { mfaRequired: true });
      }

      // Verify MFA code if provided
      if (user.mfaEnabled && credentials.mfaCode) {
        const isMfaValid = await this.verifyMfaCode(user.id, credentials.mfaCode);
        if (!isMfaValid) {
          throw new AppError('Invalid MFA code', 401);
        }
      }

      // Generate tokens
      const tokens = await this.generateTokens(user, sessionInfo);

      // Remove sensitive data
      const { passwordHash: _, ...userWithoutPassword } = user;

      logger.info(`User logged in: ${user.email}`);

      return {
        user: userWithoutPassword,
        tokens,
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, config.auth.jwt.refreshSecret) as JWTPayload;

      // Find session
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      const [session] = await db
        .select()
        .from(userSessions)
        .where(and(
          eq(userSessions.userId, payload.sub),
          eq(userSessions.refreshTokenHash, refreshTokenHash)
        ))
        .limit(1);

      if (!session || session.expiresAt < new Date()) {
        throw new AppError('Invalid refresh token', 401);
      }

      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Update session
      await db
        .update(userSessions)
        .set({
          tokenHash: await bcrypt.hash(tokens.accessToken, 10),
          refreshTokenHash: await bcrypt.hash(tokens.refreshToken, 10),
          lastUsedAt: new Date(),
        })
        .where(eq(userSessions.id, session.id));

      return tokens;
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw new AppError('Invalid refresh token', 401);
    }
  }

  /**
   * Logout user
   */
  async logout(userId: string, tokenHash: string): Promise<void> {
    try {
      await db
        .delete(userSessions)
        .where(and(
          eq(userSessions.userId, userId),
          eq(userSessions.tokenHash, tokenHash)
        ));

      logger.info(`User logged out: ${userId}`);
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const payload = jwt.verify(token, config.auth.jwt.secret) as JWTPayload;

      // Check if session exists
      const tokenHash = await bcrypt.hash(token, 10);
      const [session] = await db
        .select()
        .from(userSessions)
        .where(and(
          eq(userSessions.userId, payload.sub),
          eq(userSessions.tokenHash, tokenHash)
        ))
        .limit(1);

      if (!session || session.expiresAt < new Date()) {
        throw new AppError('Token expired or invalid', 401);
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid token', 401);
      }
      throw error;
    }
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: any, sessionInfo?: SessionInfo): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = this.parseTimeToSeconds(config.auth.jwt.accessExpiresIn);
    const refreshExpiresIn = this.parseTimeToSeconds(config.auth.jwt.refreshExpiresIn);

    // Access token payload
    const accessPayload: JWTPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      iat: now,
      exp: now + accessExpiresIn,
      iss: config.auth.jwt.issuer,
      aud: config.auth.jwt.audience,
    };

    // Refresh token payload
    const refreshPayload = {
      sub: user.id,
      iat: now,
      exp: now + refreshExpiresIn,
      iss: config.auth.jwt.issuer,
      aud: config.auth.jwt.audience,
    };

    // Generate tokens
    const accessToken = jwt.sign(accessPayload, config.auth.jwt.secret);
    const refreshToken = jwt.sign(refreshPayload, config.auth.jwt.refreshSecret);

    // Store session
    await db.insert(userSessions).values({
      userId: user.id,
      tokenHash: await bcrypt.hash(accessToken, 10),
      refreshTokenHash: await bcrypt.hash(refreshToken, 10),
      deviceInfo: sessionInfo?.deviceInfo,
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
      expiresAt: new Date((now + refreshExpiresIn) * 1000),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  /**
   * Verify MFA code (placeholder - implement with speakeasy)
   */
  private async verifyMfaCode(userId: string, code: string): Promise<boolean> {
    // TODO: Implement MFA verification with speakeasy
    // This is a placeholder implementation
    return code === '123456';
  }

  /**
   * Parse time string to seconds
   */
  private parseTimeToSeconds(timeString: string): number {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return value;
    }
  }
}

export const authService = new AuthService();
