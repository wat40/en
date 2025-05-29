import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from '@/config';
import { testDatabaseConnection, closeDatabaseConnection } from '@/config/database';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { rateLimiter } from '@/middleware/rateLimiter';
import { authMiddleware } from '@/middleware/auth';

// Import routes
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import serverRoutes from '@/routes/servers';
import channelRoutes from '@/routes/channels';
import messageRoutes from '@/routes/messages';
import healthRoutes from '@/routes/health';

// Import WebSocket handlers
import { initializeWebSocket } from '@/services/websocket';

class Application {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.websocket.cors.origin,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression
    this.app.use(compression());

    // Logging
    if (config.isDevelopment) {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => logger.info(message.trim()),
        },
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    this.app.use(rateLimiter);

    // Trust proxy (for production behind load balancer)
    if (config.isProduction) {
      this.app.set('trust proxy', 1);
    }
  }

  private initializeRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // API routes with authentication
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/users', authMiddleware, userRoutes);
    this.app.use('/api/v1/servers', authMiddleware, serverRoutes);
    this.app.use('/api/v1/channels', authMiddleware, channelRoutes);
    this.app.use('/api/v1/messages', authMiddleware, messageRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: {
          code: 40404,
          message: 'Not Found',
          details: `Route ${req.method} ${req.originalUrl} not found`,
        },
      });
    });
  }

  private initializeWebSocket(): void {
    initializeWebSocket(this.io);
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Test database connection
      const dbConnected = await testDatabaseConnection();
      if (!dbConnected) {
        throw new Error('Failed to connect to database');
      }
      logger.info('Database connection established');

      // Start server
      this.server.listen(config.server.port, config.server.host, () => {
        logger.info(`Server running on http://${config.server.host}:${config.server.port}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`WebSocket server running on port ${config.websocket.port}`);
      });

      // Graceful shutdown handlers
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        this.gracefulShutdown();
      });
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        this.gracefulShutdown();
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown(): Promise<void> {
    logger.info('Received shutdown signal, starting graceful shutdown...');

    try {
      // Close server
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // Close WebSocket server
      this.io.close(() => {
        logger.info('WebSocket server closed');
      });

      // Close database connection
      await closeDatabaseConnection();
      logger.info('Database connection closed');

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start application
const app = new Application();

if (require.main === module) {
  app.start().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

export default app;
