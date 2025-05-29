# Security Architecture

## Overview

Security is a fundamental aspect of the Enrichment platform, protecting user data, preventing abuse, and ensuring platform integrity. The security architecture implements defense-in-depth principles with multiple layers of protection.

## Security Principles

1. **Zero Trust Architecture**: Never trust, always verify
2. **Principle of Least Privilege**: Minimal necessary access
3. **Defense in Depth**: Multiple security layers
4. **Security by Design**: Built-in security from the start
5. **Privacy by Default**: User privacy as the default state
6. **Transparency**: Clear security practices and incident reporting

## Authentication & Authorization

### Multi-Factor Authentication (MFA)
```typescript
interface MFAConfig {
  enabled: boolean;
  methods: ('totp' | 'sms' | 'email' | 'backup_codes')[];
  required_for: ('login' | 'sensitive_actions' | 'admin_access')[];
  grace_period: number; // seconds
}

class MFAService {
  async enableTOTP(userId: string): Promise<TOTPSetup> {
    const secret = speakeasy.generateSecret({
      name: `Enrichment (${user.email})`,
      issuer: 'Enrichment'
    });
    
    await this.storeTempSecret(userId, secret.base32);
    
    return {
      secret: secret.base32,
      qr_code: await this.generateQRCode(secret.otpauth_url),
      backup_codes: await this.generateBackupCodes(userId)
    };
  }
  
  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const secret = await this.getUserTOTPSecret(userId);
    return speakeasy.totp.verify({
      secret,
      token,
      window: 2 // Allow 2 time steps of variance
    });
  }
}
```

### JWT Token Security
```typescript
interface JWTConfig {
  access_token_ttl: number;    // 15 minutes
  refresh_token_ttl: number;   // 7 days
  algorithm: 'RS256';
  issuer: string;
  audience: string;
}

class TokenService {
  async generateTokens(user: User): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.access_token_ttl
    };
    
    const accessToken = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      issuer: this.config.issuer,
      audience: this.config.audience
    });
    
    const refreshToken = await this.generateRefreshToken(user.id);
    
    return { accessToken, refreshToken };
  }
  
  async validateToken(token: string): Promise<JWTPayload> {
    try {
      return jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience
      }) as JWTPayload;
    } catch (error) {
      throw new UnauthorizedError('Invalid token');
    }
  }
}
```

### Role-Based Access Control (RBAC)
```sql
-- Permissions table
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Role permissions (many-to-many)
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    PRIMARY KEY (role_id, permission_id)
);

-- User permissions (direct grants)
CREATE TABLE user_permissions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, permission_id, COALESCE(server_id, '00000000-0000-0000-0000-000000000000'), COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'))
);
```

## Data Protection

### Encryption at Rest
```typescript
class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyDerivation = 'pbkdf2';
  
  async encryptSensitiveData(data: string, context: string): Promise<EncryptedData> {
    const key = await this.deriveKey(context);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from(context));
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.algorithm
    };
  }
  
  async decryptSensitiveData(encryptedData: EncryptedData, context: string): Promise<string> {
    const key = await this.deriveKey(context);
    const decipher = crypto.createDecipher(this.algorithm, key);
    
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### Encryption in Transit
- **TLS 1.3**: All client-server communication
- **Certificate Pinning**: Mobile applications
- **HSTS**: HTTP Strict Transport Security
- **Perfect Forward Secrecy**: Ephemeral key exchange

### Data Anonymization
```typescript
class DataAnonymizationService {
  async anonymizeUser(userId: string): Promise<void> {
    const anonymousId = this.generateAnonymousId();
    
    // Anonymize personal data
    await this.db.transaction(async (trx) => {
      // Update user record
      await trx('users')
        .where('id', userId)
        .update({
          username: `anonymous_${anonymousId}`,
          email: `${anonymousId}@anonymous.local`,
          display_name: 'Anonymous User',
          avatar_url: null,
          bio: null,
          deleted_at: new Date()
        });
      
      // Anonymize messages (keep content for context)
      await trx('messages')
        .where('author_id', userId)
        .update({
          author_id: anonymousId
        });
      
      // Remove sensitive associations
      await trx('user_sessions').where('user_id', userId).del();
      await trx('user_preferences').where('user_id', userId).del();
    });
  }
}
```

## Input Validation & Sanitization

### Request Validation
```typescript
import { z } from 'zod';

const MessageSchema = z.object({
  content: z.string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long')
    .refine(content => !containsMaliciousContent(content), 'Invalid content'),
  channel_id: z.string().uuid('Invalid channel ID'),
  reply_to: z.string().uuid().optional(),
  attachments: z.array(z.string().url()).max(10, 'Too many attachments')
});

class MessageController {
  async createMessage(req: Request, res: Response) {
    try {
      const validatedData = MessageSchema.parse(req.body);
      
      // Additional security checks
      await this.checkPermissions(req.user, validatedData.channel_id);
      await this.checkRateLimit(req.user.id, validatedData.channel_id);
      
      const message = await this.messageService.create(validatedData, req.user);
      res.json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors });
      } else {
        throw error;
      }
    }
  }
}
```

### Content Sanitization
```typescript
import DOMPurify from 'isomorphic-dompurify';

class ContentSanitizer {
  sanitizeMessage(content: string): string {
    // Remove potentially dangerous HTML
    const cleaned = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['b', 'i', 'u', 'code', 'pre', 'em', 'strong'],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    // Additional custom sanitization
    return this.sanitizeCustomMarkdown(cleaned);
  }
  
  sanitizeCustomMarkdown(content: string): string {
    // Escape potential XSS in custom markdown
    return content
      .replace(/\[([^\]]+)\]\(javascript:[^)]+\)/g, '[$1](blocked)')
      .replace(/\[([^\]]+)\]\(data:[^)]+\)/g, '[$1](blocked)')
      .replace(/<script[^>]*>.*?<\/script>/gi, '');
  }
}
```

## Rate Limiting & DDoS Protection

### Adaptive Rate Limiting
```typescript
class RateLimitService {
  private readonly limits = {
    messages: { requests: 5, window: 5000, burst: 10 },
    api: { requests: 100, window: 60000, burst: 150 },
    auth: { requests: 5, window: 300000, burst: 3 }
  };
  
  async checkRateLimit(
    identifier: string, 
    action: string, 
    context?: any
  ): Promise<RateLimitResult> {
    const key = this.buildKey(identifier, action, context);
    const limit = this.getLimitForAction(action, context);
    
    const current = await this.redis.multi()
      .incr(key)
      .expire(key, Math.ceil(limit.window / 1000))
      .exec();
    
    const count = current[0][1] as number;
    
    if (count > limit.requests) {
      // Check if burst limit allows this request
      if (count <= limit.burst) {
        await this.logBurstUsage(identifier, action);
        return { allowed: true, remaining: limit.burst - count };
      }
      
      await this.logRateLimitViolation(identifier, action, count);
      return { 
        allowed: false, 
        remaining: 0, 
        resetTime: Date.now() + limit.window 
      };
    }
    
    return { allowed: true, remaining: limit.requests - count };
  }
}
```

### DDoS Protection
- **CloudFlare Integration**: Layer 7 DDoS protection
- **Geographic Filtering**: Block suspicious regions
- **Behavioral Analysis**: Detect bot traffic patterns
- **Connection Limiting**: Limit concurrent connections per IP

## Security Monitoring

### Audit Logging
```typescript
interface AuditEvent {
  id: string;
  timestamp: Date;
  user_id?: string;
  ip_address: string;
  user_agent: string;
  action: string;
  resource: string;
  resource_id?: string;
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, any>;
  risk_score: number;
}

class AuditLogger {
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ...event
    };
    
    // Store in database
    await this.db('audit_logs').insert(auditEvent);
    
    // Send to SIEM if high risk
    if (auditEvent.risk_score >= 7) {
      await this.sendToSIEM(auditEvent);
    }
    
    // Real-time alerting for critical events
    if (auditEvent.risk_score >= 9) {
      await this.sendAlert(auditEvent);
    }
  }
  
  async detectAnomalies(userId: string): Promise<SecurityAlert[]> {
    const recentEvents = await this.getRecentEvents(userId, '24h');
    const patterns = await this.analyzePatterns(recentEvents);
    
    return patterns
      .filter(pattern => pattern.anomaly_score > 0.8)
      .map(pattern => this.createSecurityAlert(pattern));
  }
}
```

### Intrusion Detection
```typescript
class IntrusionDetectionService {
  private readonly suspiciousPatterns = [
    /(?:union|select|insert|delete|update|drop|create|alter)\s+/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i
  ];
  
  async analyzeRequest(req: Request): Promise<ThreatAssessment> {
    const threats: ThreatIndicator[] = [];
    
    // Check for SQL injection patterns
    const sqlThreats = this.detectSQLInjection(req);
    threats.push(...sqlThreats);
    
    // Check for XSS patterns
    const xssThreats = this.detectXSS(req);
    threats.push(...xssThreats);
    
    // Check for unusual behavior
    const behaviorThreats = await this.detectAnomalousActivity(req);
    threats.push(...behaviorThreats);
    
    const riskScore = this.calculateRiskScore(threats);
    
    return {
      threats,
      risk_score: riskScore,
      action: this.determineAction(riskScore),
      confidence: this.calculateConfidence(threats)
    };
  }
}
```

## Incident Response

### Security Incident Workflow
```typescript
enum IncidentSeverity {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

interface SecurityIncident {
  id: string;
  severity: IncidentSeverity;
  type: string;
  description: string;
  affected_users: string[];
  affected_systems: string[];
  detected_at: Date;
  resolved_at?: Date;
  status: 'open' | 'investigating' | 'contained' | 'resolved';
  response_actions: ResponseAction[];
}

class IncidentResponseService {
  async handleSecurityIncident(incident: SecurityIncident): Promise<void> {
    // Immediate containment for critical incidents
    if (incident.severity === IncidentSeverity.CRITICAL) {
      await this.emergencyContainment(incident);
    }
    
    // Notify security team
    await this.notifySecurityTeam(incident);
    
    // Start investigation
    await this.initiateInvestigation(incident);
    
    // Document incident
    await this.documentIncident(incident);
    
    // Begin recovery process
    await this.beginRecovery(incident);
  }
  
  private async emergencyContainment(incident: SecurityIncident): Promise<void> {
    // Isolate affected systems
    for (const system of incident.affected_systems) {
      await this.isolateSystem(system);
    }
    
    // Suspend affected user accounts
    for (const userId of incident.affected_users) {
      await this.suspendUser(userId, 'security_incident');
    }
    
    // Enable enhanced monitoring
    await this.enableEnhancedMonitoring();
  }
}
```

## Compliance & Privacy

### GDPR Compliance
```typescript
class GDPRComplianceService {
  async handleDataSubjectRequest(request: DataSubjectRequest): Promise<void> {
    switch (request.type) {
      case 'access':
        await this.provideDataAccess(request.user_id);
        break;
      case 'rectification':
        await this.rectifyData(request.user_id, request.corrections);
        break;
      case 'erasure':
        await this.eraseUserData(request.user_id);
        break;
      case 'portability':
        await this.exportUserData(request.user_id);
        break;
      case 'restriction':
        await this.restrictProcessing(request.user_id);
        break;
    }
  }
  
  async eraseUserData(userId: string): Promise<void> {
    // Anonymize instead of delete to maintain data integrity
    await this.dataAnonymizationService.anonymizeUser(userId);
    
    // Remove from search indexes
    await this.searchService.removeUserFromIndex(userId);
    
    // Clear caches
    await this.cacheService.clearUserData(userId);
    
    // Log compliance action
    await this.auditLogger.logEvent({
      action: 'gdpr_erasure',
      user_id: userId,
      outcome: 'success',
      details: { request_type: 'erasure' },
      risk_score: 1
    });
  }
}
```

### Data Retention Policies
```sql
-- Automated data retention policies
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete old audit logs (keep 7 years)
    DELETE FROM audit_logs 
    WHERE timestamp < NOW() - INTERVAL '7 years';
    
    -- Delete old sessions (keep 30 days)
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() - INTERVAL '30 days';
    
    -- Anonymize old messages from deleted users (keep 1 year)
    UPDATE messages 
    SET content = '[deleted]', 
        attachments = '[]'
    WHERE author_id IN (
        SELECT id FROM users 
        WHERE deleted_at < NOW() - INTERVAL '1 year'
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job
SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data();');
```
