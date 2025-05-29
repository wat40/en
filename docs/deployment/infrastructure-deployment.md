# Infrastructure & Deployment

## Overview

The Enrichment platform is designed for cloud-native deployment with containerization, orchestration, and automated scaling. The infrastructure supports high availability, disaster recovery, and global distribution.

## Infrastructure Architecture

### Cloud Provider Strategy
- **Primary**: AWS (Amazon Web Services)
- **Secondary**: Google Cloud Platform (multi-cloud strategy)
- **CDN**: CloudFlare for global content delivery
- **Monitoring**: Datadog for comprehensive observability

### High-Level Infrastructure

```mermaid
graph TB
    subgraph "Global CDN (CloudFlare)"
        CDN[CloudFlare CDN]
        WAF[Web Application Firewall]
        DDoS[DDoS Protection]
    end
    
    subgraph "Load Balancers"
        ALB[Application Load Balancer]
        NLB[Network Load Balancer]
    end
    
    subgraph "Kubernetes Cluster (EKS)"
        subgraph "Web Tier"
            WEB1[Web App Pod 1]
            WEB2[Web App Pod 2]
            WEB3[Web App Pod 3]
        end
        
        subgraph "API Tier"
            API1[API Pod 1]
            API2[API Pod 2]
            API3[API Pod 3]
        end
        
        subgraph "WebSocket Tier"
            WS1[WebSocket Pod 1]
            WS2[WebSocket Pod 2]
            WS3[WebSocket Pod 3]
        end
        
        subgraph "AI Services"
            AI1[AI Service Pod 1]
            AI2[AI Service Pod 2]
        end
    end
    
    subgraph "Data Layer"
        RDS[(RDS PostgreSQL)]
        REDIS[(ElastiCache Redis)]
        ES[(OpenSearch)]
        S3[(S3 Storage)]
    end
    
    subgraph "External Services"
        OPENAI[OpenAI API]
        SENDGRID[SendGrid]
        FCM[Firebase Cloud Messaging]
    end
    
    CDN --> ALB
    ALB --> WEB1
    ALB --> WEB2
    ALB --> WEB3
    
    NLB --> API1
    NLB --> API2
    NLB --> API3
    
    NLB --> WS1
    NLB --> WS2
    NLB --> WS3
    
    API1 --> AI1
    API2 --> AI2
    
    API1 --> RDS
    API1 --> REDIS
    API1 --> ES
    API1 --> S3
    
    AI1 --> OPENAI
    API1 --> SENDGRID
    API1 --> FCM
```

## Containerization

### Docker Configuration

**Backend API Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runtime

RUN addgroup -g 1001 -S nodejs
RUN adduser -S enrichment -u 1001

WORKDIR /app

COPY --from=builder --chown=enrichment:nodejs /app/dist ./dist
COPY --from=builder --chown=enrichment:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=enrichment:nodejs /app/package.json ./package.json

USER enrichment

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose (Development)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: enrichment
      POSTGRES_USER: enrichment
      POSTGRES_PASSWORD: development
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://enrichment:development@postgres:5432/enrichment
      - REDIS_URL=redis://redis:6379
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - postgres
      - redis
      - elasticsearch
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3001:80"
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
```

## Kubernetes Deployment

### Namespace Configuration
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: enrichment
  labels:
    name: enrichment
    environment: production
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: enrichment-quota
  namespace: enrichment
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    persistentvolumeclaims: "10"
```

### API Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: enrichment-api
  namespace: enrichment
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: enrichment-api
  template:
    metadata:
      labels:
        app: enrichment-api
    spec:
      containers:
      - name: api
        image: enrichment/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: enrichment-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: enrichment-secrets
              key: redis-url
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
---
apiVersion: v1
kind: Service
metadata:
  name: enrichment-api-service
  namespace: enrichment
spec:
  selector:
    app: enrichment-api
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

### WebSocket Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: enrichment-websocket
  namespace: enrichment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: enrichment-websocket
  template:
    metadata:
      labels:
        app: enrichment-websocket
    spec:
      containers:
      - name: websocket
        image: enrichment/websocket:latest
        ports:
        - containerPort: 3001
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: enrichment-secrets
              key: redis-url
        resources:
          requests:
            cpu: 300m
            memory: 256Mi
          limits:
            cpu: 600m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: enrichment-websocket-service
  namespace: enrichment
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: tcp
spec:
  selector:
    app: enrichment-websocket
  ports:
  - port: 80
    targetPort: 3001
  type: LoadBalancer
```

### Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: enrichment-api-hpa
  namespace: enrichment
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: enrichment-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

## Database Infrastructure

### RDS PostgreSQL Configuration
```yaml
# Terraform configuration for RDS
resource "aws_db_instance" "enrichment_postgres" {
  identifier = "enrichment-postgres"
  
  engine         = "postgres"
  engine_version = "15.3"
  instance_class = "db.r6g.xlarge"
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type         = "gp3"
  storage_encrypted    = true
  
  db_name  = "enrichment"
  username = "enrichment"
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.enrichment.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring.arn
  
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "enrichment-postgres-final-snapshot"
  
  tags = {
    Name        = "enrichment-postgres"
    Environment = "production"
  }
}

# Read replica for analytics
resource "aws_db_instance" "enrichment_postgres_replica" {
  identifier = "enrichment-postgres-replica"
  
  replicate_source_db = aws_db_instance.enrichment_postgres.id
  instance_class      = "db.r6g.large"
  
  publicly_accessible = false
  
  tags = {
    Name        = "enrichment-postgres-replica"
    Environment = "production"
    Purpose     = "analytics"
  }
}
```

### Redis Cluster Configuration
```yaml
resource "aws_elasticache_replication_group" "enrichment_redis" {
  replication_group_id       = "enrichment-redis"
  description                = "Redis cluster for Enrichment"
  
  node_type                  = "cache.r6g.large"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  
  num_cache_clusters         = 3
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  subnet_group_name = aws_elasticache_subnet_group.enrichment.name
  security_group_ids = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = {
    Name        = "enrichment-redis"
    Environment = "production"
  }
}
```

## CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  EKS_CLUSTER_NAME: enrichment-production

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm run test:coverage
    
    - name: Run security audit
      run: npm audit --audit-level high
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1
    
    - name: Build and push API image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: enrichment/api
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG ./backend
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
    
    - name: Build and push Frontend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: enrichment/frontend
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG ./frontend
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --region ${{ env.AWS_REGION }} --name ${{ env.EKS_CLUSTER_NAME }}
    
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/enrichment-api api=${{ steps.login-ecr.outputs.registry }}/enrichment/api:${{ github.sha }} -n enrichment
        kubectl set image deployment/enrichment-frontend frontend=${{ steps.login-ecr.outputs.registry }}/enrichment/frontend:${{ github.sha }} -n enrichment
        kubectl rollout status deployment/enrichment-api -n enrichment
        kubectl rollout status deployment/enrichment-frontend -n enrichment
    
    - name: Run smoke tests
      run: |
        kubectl run smoke-test --image=curlimages/curl --rm -i --restart=Never -- \
          curl -f http://enrichment-api-service.enrichment.svc.cluster.local/health
```

## Monitoring & Observability

### Prometheus Configuration
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
    
    rule_files:
      - "enrichment_rules.yml"
    
    scrape_configs:
    - job_name: 'enrichment-api'
      kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
          - enrichment
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: enrichment-api
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
```

### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "Enrichment Platform Metrics",
    "panels": [
      {
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "WebSocket Connections",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(websocket_connections_total)",
            "legendFormat": "Active Connections"
          }
        ]
      },
      {
        "title": "Message Throughput",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(messages_sent_total[5m])",
            "legendFormat": "Messages per second"
          }
        ]
      }
    ]
  }
}
```

## Disaster Recovery

### Backup Strategy
```bash
#!/bin/bash
# Database backup script

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
S3_BUCKET="enrichment-backups"

# PostgreSQL backup
pg_dump $DATABASE_URL | gzip > "postgres_backup_${BACKUP_DATE}.sql.gz"
aws s3 cp "postgres_backup_${BACKUP_DATE}.sql.gz" "s3://${S3_BUCKET}/postgres/"

# Redis backup
redis-cli --rdb "redis_backup_${BACKUP_DATE}.rdb"
gzip "redis_backup_${BACKUP_DATE}.rdb"
aws s3 cp "redis_backup_${BACKUP_DATE}.rdb.gz" "s3://${S3_BUCKET}/redis/"

# Elasticsearch backup
curl -X PUT "elasticsearch:9200/_snapshot/s3_repository/snapshot_${BACKUP_DATE}?wait_for_completion=true"

# Cleanup local files
rm -f postgres_backup_*.sql.gz redis_backup_*.rdb.gz

echo "Backup completed: ${BACKUP_DATE}"
```

### Recovery Procedures
```bash
#!/bin/bash
# Disaster recovery script

RESTORE_DATE=$1
S3_BUCKET="enrichment-backups"

if [ -z "$RESTORE_DATE" ]; then
    echo "Usage: $0 <RESTORE_DATE>"
    exit 1
fi

# Restore PostgreSQL
aws s3 cp "s3://${S3_BUCKET}/postgres/postgres_backup_${RESTORE_DATE}.sql.gz" .
gunzip "postgres_backup_${RESTORE_DATE}.sql.gz"
psql $DATABASE_URL < "postgres_backup_${RESTORE_DATE}.sql"

# Restore Redis
aws s3 cp "s3://${S3_BUCKET}/redis/redis_backup_${RESTORE_DATE}.rdb.gz" .
gunzip "redis_backup_${RESTORE_DATE}.rdb.gz"
redis-cli --rdb "redis_backup_${RESTORE_DATE}.rdb"

# Restore Elasticsearch
curl -X POST "elasticsearch:9200/_snapshot/s3_repository/snapshot_${RESTORE_DATE}/_restore"

echo "Recovery completed from backup: ${RESTORE_DATE}"
```
