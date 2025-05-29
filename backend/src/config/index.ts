import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Basic configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(3000),
  HOST: z.string().default('localhost'),

  // Database configuration
  DATABASE_URL: z.string(),
  DATABASE_POOL_MIN: z.string().transform(Number).default(2),
  DATABASE_POOL_MAX: z.string().transform(Number).default(10),

  // Redis configuration
  REDIS_URL: z.string(),

  // JWT configuration
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('enrichment'),
  JWT_AUDIENCE: z.string().default('enrichment-users'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32),
  BCRYPT_ROUNDS: z.string().transform(Number).default(12),

  // CORS
  CORS_ORIGIN: z.string(),
  CORS_CREDENTIALS: z.string().transform(Boolean).default(true),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(100),

  // File upload
  UPLOAD_MAX_FILE_SIZE: z.string().transform(Number).default(10485760),
  UPLOAD_ALLOWED_TYPES: z.string(),
  UPLOAD_DESTINATION: z.string().default('uploads'),

  // AWS S3
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Email
  SENDGRID_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  FROM_NAME: z.string().optional(),

  // WebSocket
  WEBSOCKET_PORT: z.string().transform(Number).default(3001),
  WEBSOCKET_CORS_ORIGIN: z.string(),

  // AI Services
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4-turbo-preview'),
  OPENAI_MAX_TOKENS: z.string().transform(Number).default(1000),
  OPENAI_TEMPERATURE: z.string().transform(Number).default(0.3),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),

  // Feature flags
  FEATURE_AI_MODERATION: z.string().transform(Boolean).default(true),
  FEATURE_VOICE_CHANNELS: z.string().transform(Boolean).default(false),
  FEATURE_VIDEO_CALLS: z.string().transform(Boolean).default(false),
  FEATURE_THREADS: z.string().transform(Boolean).default(true),
  FEATURE_REACTIONS: z.string().transform(Boolean).default(true),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Application configuration
export const config = {
  // Environment
  env: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // Server
  server: {
    port: env.PORT,
    host: env.HOST,
  },

  // Database
  database: {
    url: env.DATABASE_URL,
    pool: {
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
    },
  },

  // Redis
  redis: {
    url: env.REDIS_URL,
  },

  // Authentication
  auth: {
    jwt: {
      secret: env.JWT_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    bcrypt: {
      rounds: env.BCRYPT_ROUNDS,
    },
    encryption: {
      key: env.ENCRYPTION_KEY,
    },
  },

  // CORS
  cors: {
    origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
    credentials: env.CORS_CREDENTIALS,
  },

  // Rate limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  // File upload
  upload: {
    maxFileSize: env.UPLOAD_MAX_FILE_SIZE,
    allowedTypes: env.UPLOAD_ALLOWED_TYPES.split(',').map(type => type.trim()),
    destination: env.UPLOAD_DESTINATION,
  },

  // AWS S3
  aws: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3: {
      bucket: env.AWS_S3_BUCKET,
    },
  },

  // Email
  email: {
    sendgrid: {
      apiKey: env.SENDGRID_API_KEY,
    },
    from: {
      email: env.FROM_EMAIL,
      name: env.FROM_NAME,
    },
  },

  // WebSocket
  websocket: {
    port: env.WEBSOCKET_PORT,
    cors: {
      origin: env.WEBSOCKET_CORS_ORIGIN.split(',').map(origin => origin.trim()),
    },
  },

  // AI Services
  ai: {
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      maxTokens: env.OPENAI_MAX_TOKENS,
      temperature: env.OPENAI_TEMPERATURE,
    },
  },

  // Elasticsearch
  elasticsearch: {
    url: env.ELASTICSEARCH_URL,
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },

  // Feature flags
  features: {
    aiModeration: env.FEATURE_AI_MODERATION,
    voiceChannels: env.FEATURE_VOICE_CHANNELS,
    videoCalls: env.FEATURE_VIDEO_CALLS,
    threads: env.FEATURE_THREADS,
    reactions: env.FEATURE_REACTIONS,
  },
} as const;

export type Config = typeof config;
