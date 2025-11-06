# Mosaic Life - Simplified MVP Architecture

**Version**: 1.0
**Status**: Active (MVP Implementation)
**Last Updated**: January 2025
**Target**: 3-month MVP delivery

---

## Executive Summary

This document describes the **simplified architecture** for Mosaic Life MVP. It is intentionally minimal to enable rapid delivery while preserving core user value: helping families capture and preserve stories about loved ones.

**Key Principles**:
- ✅ Simple, proven technology stack
- ✅ Separate backend and frontend services
- ✅ PostgreSQL for all data (no distributed systems)
- ✅ Direct integrations (no middleware/proxies)
- ✅ Deploy to existing EKS infrastructure
- ✅ Clear migration path to add complexity when needed

**What We're NOT Building (Yet)**:
- ❌ OpenSearch / Elasticsearch
- ❌ Neo4j graph database
- ❌ SNS/SQS event bus
- ❌ LiteLLM proxy
- ❌ Microservices decomposition
- ❌ Plugin system / Module Federation
- ❌ Multi-tenancy
- ❌ Federation between instances

These features are **deferred** until we have proven user demand. See [Migration Path](#migration-path) for when and how to add them.

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet Users                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Application Load Balancer (ALB)                 │
│  - HTTPS termination (ACM certificate)                   │
│  - Path-based routing:                                   │
│    • /api/*  → Backend Service                           │
│    • /auth/* → Backend Service                           │
│    • /*      → Frontend Service                          │
└────────────┬────────────────────────────────────────────┘
             │
      ┌──────┴───────┐
      │              │
      ▼              ▼
┌──────────────┐  ┌──────────────────────────────────┐
│   Frontend   │  │   Backend (core-api)             │
│   (web)      │  │   - FastAPI + Uvicorn            │
│              │  │   - Google OAuth handler         │
│   React SPA  │  │   - REST APIs                    │
│   - Vite     │  │   - Session management           │
│   - Static   │  │   - Business logic               │
│     assets   │  │   - S3 presigned URLs            │
│              │  │   - Direct OpenAI calls (Phase 3)│
└──────────────┘  └─────────┬────────────────────────┘
                            │
                   ┌────────┼────────┐
                   │        │        │
                   ▼        ▼        ▼
              ┌─────────┐ ┌─────┐ ┌──────────────┐
              │   RDS   │ │ S3  │ │ Google OAuth │
              │Postgres │ │Media│ │     API      │
              │         │ │     │ │              │
              └─────────┘ └─────┘ └──────────────┘
```

### Component Responsibilities

| Component | Technology | Purpose | Scaling Strategy |
|-----------|-----------|---------|------------------|
| **Frontend** | React 18 + Vite | User interface, static assets | Horizontal (2+ pods) |
| **Backend** | FastAPI + Uvicorn | API, business logic, auth | Horizontal (2+ pods) |
| **Database** | PostgreSQL 16 (RDS) | All persistent data | Vertical (upgrade instance) |
| **Storage** | S3 | Media files (images, videos) | Infinite (AWS-managed) |
| **Auth Provider** | Google OAuth 2.0 | User authentication | External (Google-managed) |

---

## Technology Stack

### Backend

**Framework**: FastAPI 0.115+
- Modern Python async framework
- Automatic OpenAPI documentation
- Built-in data validation (Pydantic)
- Fast performance (~20k req/sec with Uvicorn)

**Runtime**: Python 3.12
- Modern language features
- Type hints for safety
- Excellent library ecosystem

**Database ORM**: SQLAlchemy 2.0
- Mature ORM with type hints
- Async support
- Migration tool: Alembic

**Key Libraries**:
```python
fastapi>=0.115.0          # Web framework
uvicorn[standard]>=0.30   # ASGI server
pydantic>=2.8             # Data validation
sqlalchemy>=2.0           # Database ORM
alembic>=1.13             # Migrations
psycopg[binary]>=3.0      # Postgres driver (async)
authlib>=1.3              # OAuth client
httpx>=0.27               # HTTP client (for Google API)
boto3>=1.34               # AWS SDK (S3)
python-multipart>=0.0.9   # File upload support
itsdangerous>=2.2         # Secure cookies
python-jose[cryptography] # JWT (optional)
```

**Why FastAPI?**
- Native async/await support
- Automatic API documentation
- Type safety with Pydantic
- Fast development iteration
- Easy to test

### Frontend

**Framework**: React 18
- Mature, well-supported
- Large ecosystem
- Great developer experience

**Build Tool**: Vite 5
- Fast dev server (<1s HMR)
- Optimized production builds
- Simple configuration

**Routing**: React Router 6
- Standard for React SPAs
- Type-safe with TypeScript
- Nested routes support

**State Management**:
- **TanStack Query** (React Query) - Server state caching
- **Zustand** - Local UI state (lightweight, <1KB)

**Key Libraries**:
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.26",
  "@tanstack/react-query": "^5.51",
  "zustand": "^4.5",
  "@tiptap/react": "^2.6",         // Rich text editor (Phase 2)
  "dompurify": "^3.1",             // Sanitization
  "marked": "^12.0"                // Markdown rendering
}
```

**Why React + Vite?**
- Fast development with instant HMR
- Simple deployment (static files)
- No SSR complexity (not needed for authenticated app)
- Large talent pool

### Database

**Engine**: PostgreSQL 16 (Amazon RDS)
- Mature, reliable RDBMS
- Built-in full-text search (`to_tsvector`)
- JSONB for flexible fields
- Excellent performance for <100k rows

**Instance**:
- Dev/Staging: `db.t3.micro` (2 vCPU, 1GB RAM)
- Production: `db.t3.small` (2 vCPU, 2GB RAM)

**Features Used**:
- Foreign keys for relationships
- Indexes for performance
- Triggers for auto-updates (e.g., `updated_at`)
- Full-text search (Phase 2)

**Why PostgreSQL?**
- Handles all MVP requirements (users, stories, relationships)
- Full-text search built-in (no need for separate search service)
- Rock-solid reliability
- Well-understood by team

### Storage

**Service**: Amazon S3
- Standard storage class
- Versioning enabled
- Lifecycle policies (delete untagged objects after 90 days)

**Buckets**:
- `mosaic-life-media-dev`
- `mosaic-life-media-staging`
- `mosaic-life-media-prod`

**Why S3?**
- Industry standard for object storage
- Cheap ($0.023/GB/month)
- Highly durable (99.999999999%)
- Integrates with CloudFront (future CDN)

### Authentication

**Provider**: Google OAuth 2.0
- Authorization Code + PKCE flow
- Scopes: `openid email profile`
- Session stored in httpOnly cookies

**Why Google OAuth?**
- Free (no per-user costs like Cognito)
- Users already have Google accounts
- Trusted brand
- Simple integration with `authlib`

**Session Management**:
- Signed cookies (using `itsdangerous`)
- httpOnly, secure, SameSite=Lax
- 7-day expiration
- Stored session data in database (for multi-pod deployments)

---

## Data Model

### Core Tables

**Users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
```

**Legacies**
```sql
CREATE TABLE legacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE,
  death_date DATE,
  biography TEXT, -- Short bio, optional
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_legacies_name ON legacies(name);
CREATE INDEX idx_legacies_created_by ON legacies(created_by);
```

**Legacy Members** (Access Control)
```sql
CREATE TABLE legacy_members (
  legacy_id UUID REFERENCES legacies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
    -- 'creator': Can manage members, delete legacy
    -- 'editor': Can write/edit stories
    -- 'member': Can read based on story visibility
    -- 'pending': Awaiting approval
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (legacy_id, user_id)
);

CREATE INDEX idx_legacy_members_user ON legacy_members(user_id);
CREATE INDEX idx_legacy_members_legacy ON legacy_members(legacy_id);
```

**Stories**
```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown format
  visibility TEXT NOT NULL DEFAULT 'private',
    -- 'public': Anyone can read
    -- 'private': Only legacy members can read
    -- 'personal': Only author can read
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stories_legacy_created ON stories(legacy_id, created_at DESC);
CREATE INDEX idx_stories_author ON stories(author_id);
CREATE INDEX idx_stories_visibility ON stories(visibility);
```

**Media**
```sql
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  legacy_id UUID REFERENCES legacies(id) ON DELETE SET NULL,
  s3_bucket TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(s3_bucket, s3_key)
);

CREATE INDEX idx_media_user ON media(user_id);
CREATE INDEX idx_media_legacy ON media(legacy_id) WHERE legacy_id IS NOT NULL;
```

### Relationships

```
users (1) ──────────> (N) legacies [created_by]
users (N) ──────────> (N) legacies [via legacy_members]
legacies (1) ────────> (N) stories
users (1) ───────────> (N) stories [author]
users (1) ───────────> (N) media
legacies (1) ────────> (N) media [optional]
```

### Key Design Decisions

**Why no graph database (Neo4j)?**
- Legacy relationships are simple: user → legacy, legacy → stories
- PostgreSQL foreign keys handle this perfectly
- No need for complex traversals (e.g., "find all stories 3 degrees from person X")
- Can add Neo4j later if we need advanced relationship queries

**Why no separate search index (OpenSearch)?**
- Search is simple: find legacies by name
- PostgreSQL `ILIKE` or `to_tsvector` handles this
- Can add OpenSearch later if we need semantic search or faceting

**Why UUIDs instead of integers?**
- Globally unique (no collisions across services if we split later)
- Non-sequential (don't leak growth rate)
- Compatible with distributed systems

**Why `visibility` enum instead of complex ACLs?**
- Covers 90% of use cases
- Simple to understand and enforce
- Can add fine-grained ACLs later if needed

---

## API Design

### RESTful Endpoints

**Authentication**
```
GET  /auth/google/login          Redirect to Google OAuth
GET  /auth/google/callback       OAuth callback handler
GET  /api/me                     Get current user (or 401)
POST /auth/logout                Clear session
```

**Legacies**
```
POST   /api/legacies                    Create legacy
GET    /api/legacies                    List user's legacies
GET    /api/legacies/search?q={name}    Search by name
GET    /api/legacies/{id}               Get legacy details
PUT    /api/legacies/{id}               Update legacy
DELETE /api/legacies/{id}               Delete legacy (creator only)
POST   /api/legacies/{id}/join          Request to join
POST   /api/legacies/{id}/members/{uid}/approve  Approve member
DELETE /api/legacies/{id}/members/{uid}          Remove member
```

**Stories**
```
POST   /api/stories                 Create story
GET    /api/stories?legacy_id={id}  List stories (filtered by visibility)
GET    /api/stories/{id}            Get story detail
PUT    /api/stories/{id}            Update story (author only)
DELETE /api/stories/{id}            Delete story (author or creator)
```

**Media**
```
POST /api/media/presign            Get presigned S3 upload URL
POST /api/media                    Register uploaded media
GET  /api/media?legacy_id={id}     List user's media
DELETE /api/media/{id}             Delete media
```

**AI Chat** (Phase 3)
```
POST /api/chat/stream              Stream AI response (SSE)
GET  /api/chat/conversations       List user's conversations
GET  /api/chat/conversations/{id}  Get conversation history
```

### Response Formats

**Success** (200/201):
```json
{
  "id": "uuid",
  "name": "Legacy Name",
  "created_at": "2025-01-15T10:30:00Z",
  ...
}
```

**Error** (4xx/5xx):
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You must be a legacy member to view this story",
    "details": null
  }
}
```

### Authorization Model

**Simple role-based access**:

```python
def check_legacy_access(db, user_id, legacy_id, required_role='member'):
    """
    Check if user has required role for legacy.
    Raises HTTPException(403) if unauthorized.

    Role hierarchy: creator > editor > member > pending
    """
    member = db.query(LegacyMember).filter(
        LegacyMember.legacy_id == legacy_id,
        LegacyMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(403, "Not a member of this legacy")

    if member.role == 'pending':
        raise HTTPException(403, "Membership pending approval")

    role_hierarchy = {'creator': 3, 'editor': 2, 'member': 1}
    if role_hierarchy[member.role] < role_hierarchy[required_role]:
        raise HTTPException(403, f"Requires {required_role} role")

    return member
```

**Story visibility enforcement**:

```python
def list_legacy_stories(db, user_id, legacy_id):
    """
    List stories filtered by visibility rules:
    - Member sees: public + private + own personal stories
    - Non-member sees: only public stories
    """
    query = db.query(Story).filter(Story.legacy_id == legacy_id)

    member = db.query(LegacyMember).filter(
        LegacyMember.legacy_id == legacy_id,
        LegacyMember.user_id == user_id,
        LegacyMember.role != 'pending'
    ).first()

    if member:
        # Member sees public + private + own personal
        query = query.filter(
            or_(
                Story.visibility == 'public',
                Story.visibility == 'private',
                and_(Story.visibility == 'personal', Story.author_id == user_id)
            )
        )
    else:
        # Non-member sees only public
        query = query.filter(Story.visibility == 'public')

    return query.order_by(Story.created_at.desc()).all()
```

---

## Deployment Architecture

### Kubernetes Deployment (EKS)

**Cluster**: Existing EKS cluster (already deployed)

**Namespaces**:
- `mosaic-dev` - Development environment
- `mosaic-staging` - Pre-production testing
- `mosaic-prod` - Production

**Workloads**:

```yaml
# Backend Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-api
spec:
  replicas: 2  # Horizontal scaling
  selector:
    matchLabels:
      app: core-api
  template:
    spec:
      containers:
      - name: core-api
        image: {ecr-repo}/core-api:latest
        ports:
        - containerPort: 8080
        env:
        - name: ENV
          value: "production"
        - name: DB_URL
          valueFrom:
            secretKeyRef:
              name: core-api-secrets
              key: db-url
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10

---
# Frontend Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: {ecr-repo}/web:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

**Services**:
```yaml
# Backend Service
apiVersion: v1
kind: Service
metadata:
  name: core-api
spec:
  selector:
    app: core-api
  ports:
  - port: 80
    targetPort: 8080

---
# Frontend Service
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 8080
```

**Ingress** (ALB):
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mosaic-life
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: {acm-cert-arn}
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
spec:
  ingressClassName: alb
  rules:
  - host: app.mosaiclife.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: core-api
            port:
              number: 80
      - path: /auth
        pathType: Prefix
        backend:
          service:
            name: core-api
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web
            port:
              number: 80
```

### CI/CD Pipeline

**GitHub Actions** (already configured):

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build backend image
        run: |
          docker build -t $ECR_REPO/core-api:$GITHUB_SHA \
            -f services/core-api/Dockerfile \
            services/core-api
      - name: Push to ECR
        run: docker push $ECR_REPO/core-api:$GITHUB_SHA
      - name: Update Helm values
        run: |
          yq e '.backend.image.tag = "${{ github.sha }}"' -i \
            infra/helm/mosaic-life/values.yaml

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build frontend image
        run: |
          docker build -t $ECR_REPO/web:$GITHUB_SHA \
            -f apps/web/Dockerfile \
            apps/web
      - name: Push to ECR
        run: docker push $ECR_REPO/web:$GITHUB_SHA
      - name: Update Helm values
        run: |
          yq e '.frontend.image.tag = "${{ github.sha }}"' -i \
            infra/helm/mosaic-life/values.yaml

  deploy:
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ArgoCD sync
        run: |
          # ArgoCD auto-syncs on values.yaml change
          # Or manually: argocd app sync mosaic-life
```

**ArgoCD** (already deployed):
- Watches `/infra/helm/mosaic-life/` in Git
- Auto-syncs on changes to `values.yaml`
- Rollback via ArgoCD UI or CLI

### Database (RDS)

**Configuration**:
- Engine: PostgreSQL 16.1
- Instance: `db.t3.small` (2 vCPU, 2GB RAM) for production
- Storage: 20GB SSD (auto-scaling enabled)
- Multi-AZ: No (enable for production after MVP validation)
- Backups: Automated daily, 7-day retention
- Encryption: At rest (KMS), in transit (SSL)

**Connection**:
```python
# Backend connects via private VPC
DB_URL = "postgresql+psycopg://user:pass@rds-endpoint.region.rds.amazonaws.com:5432/mosaic"
```

**Migrations**:
```bash
# Run migrations via kubectl exec
kubectl exec -it core-api-pod -- alembic upgrade head
```

### S3 Buckets

**Setup**:
```bash
# Create bucket
aws s3 mb s3://mosaic-life-media-prod

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket mosaic-life-media-prod \
  --versioning-configuration Status=Enabled

# Lifecycle policy (delete untagged after 90 days)
aws s3api put-bucket-lifecycle-configuration \
  --bucket mosaic-life-media-prod \
  --lifecycle-configuration file://lifecycle.json

# CORS for presigned uploads
aws s3api put-bucket-cors \
  --bucket mosaic-life-media-prod \
  --cors-configuration file://cors.json
```

**CORS Config**:
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.mosaiclife.com"],
      "AllowedMethods": ["PUT", "POST", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

---

## Security

### Authentication Flow

```
1. User clicks "Login with Google"
   ↓
2. Frontend redirects to /auth/google/login
   ↓
3. Backend redirects to Google OAuth consent screen
   ↓
4. User approves, Google redirects to /auth/google/callback
   ↓
5. Backend exchanges code for tokens
   ↓
6. Backend creates/updates user in database
   ↓
7. Backend sets httpOnly cookie with signed session
   ↓
8. Backend redirects to frontend (/app)
   ↓
9. Frontend calls /api/me to get user info
   ↓
10. Frontend stores user in React Query cache
```

### Session Security

**Cookies**:
- `httpOnly=true` - Not accessible via JavaScript
- `secure=true` - HTTPS only
- `sameSite=Lax` - CSRF protection
- Signed with secret key (prevent tampering)
- 7-day expiration

**Session Storage** (for multi-pod support):
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### Input Validation

**Backend** (Pydantic):
```python
from pydantic import BaseModel, Field, validator

class StoryCreate(BaseModel):
    legacy_id: str = Field(..., regex=r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1, max_length=50000)
    visibility: Literal['public', 'private', 'personal']

    @validator('title', 'content')
    def sanitize_text(cls, v):
        # Remove null bytes, control characters
        return v.replace('\x00', '').strip()
```

**Frontend** (DOMPurify):
```typescript
import DOMPurify from 'dompurify';
import { marked } from 'marked';

function renderMarkdown(markdown: string): string {
  const html = marked(markdown);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
    ALLOW_DATA_ATTR: false
  });
}
```

### Rate Limiting

**Backend Middleware**:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/stories")
@limiter.limit("10/minute")  # Max 10 stories per minute per IP
async def create_story(...):
    ...

@app.post("/api/chat/stream")
@limiter.limit("100/day")  # Max 100 AI messages per day per IP
async def stream_chat(...):
    ...
```

### File Upload Security

**Validation**:
```python
ALLOWED_CONTENT_TYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime'
}

MAX_FILE_SIZE = {
    'image/*': 50 * 1024 * 1024,    # 50MB
    'video/*': 500 * 1024 * 1024    # 500MB
}

def validate_upload(filename: str, content_type: str, size_bytes: int):
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, f"File type {content_type} not allowed")

    max_size = MAX_FILE_SIZE.get(content_type.split('/')[0] + '/*', 0)
    if size_bytes > max_size:
        raise HTTPException(400, f"File too large (max {max_size} bytes)")

    # Validate extension matches content type
    ext = filename.split('.')[-1].lower()
    type_map = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', ...}
    if type_map.get(ext) != content_type:
        raise HTTPException(400, "File extension doesn't match content type")
```

### Secrets Management

**Development**: Kubernetes Secrets
```bash
kubectl create secret generic core-api-secrets \
  --from-literal=db-url='postgresql://...' \
  --from-literal=google-client-id='...' \
  --from-literal=google-client-secret='...' \
  --from-literal=session-secret='...'
```

**Production**: AWS Secrets Manager + External Secrets Operator (future)
- Rotate secrets without redeployment
- Audit access logs
- Fine-grained IAM permissions

---

## Observability

### Health Checks

**Backend**:
```python
@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    try:
        # Check database connectivity
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )
```

**Liveness vs Readiness**:
- Liveness: `/health` - Is the process alive?
- Readiness: `/health` - Is the service ready to accept traffic?

### Logging

**Structured JSON**:
```python
import logging
from pythonjsonlogger import jsonlogger

logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter(
    fmt='%(timestamp)s %(level)s %(name)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S'
)
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Usage
logger.info("Story created", extra={
    "user_id": user.id,
    "legacy_id": legacy.id,
    "story_id": story.id,
    "request_id": request_id
})
```

**CloudWatch Logs**:
- Log group: `/aws/eks/mosaic-life/core-api`
- Retention: 7 days (dev), 30 days (prod)
- Insights queries for debugging

### Metrics

**Basic Metrics** (CloudWatch):
- Request count (by endpoint, status code)
- Response time (p50, p95, p99)
- Error rate
- Database connection pool size

**Future** (Prometheus + Grafana):
- Custom business metrics (stories created, legacies created)
- AI usage (messages sent, tokens consumed)

### Error Tracking

**Phase 1**: CloudWatch Logs + Insights
**Phase 2**: Sentry or similar
- Capture exceptions with stack traces
- Group by error type
- Alert on new errors

---

## Performance

### Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API p95 latency | <200ms | CloudWatch |
| Database connections | <50 | RDS metrics |
| Frontend FCP | <2s | Lighthouse |
| Frontend TTI | <2.5s | Lighthouse |
| Uptime | >95% (MVP), >99% (later) | Pingdom/UptimeRobot |

### Optimization Strategies

**Backend**:
- Use database connection pooling (SQLAlchemy default)
- Add indexes for common queries
- Cache static data (e.g., user roles) in memory
- Async I/O for S3, external APIs

**Frontend**:
- Code splitting by route
- Lazy load images
- Bundle size <300KB gzipped
- Use React.memo for expensive components

**Database**:
- Indexes on foreign keys and common filters
- Analyze query plans for slow queries
- Connection pooling (max 20 connections per pod)

---

## Cost Estimate

### Monthly AWS Costs (Production)

| Service | Specification | Monthly Cost |
|---------|--------------|--------------|
| **EKS Control Plane** | Single cluster | $73 |
| **Worker Nodes** | 2x t3.medium (4 vCPU, 8GB RAM) | $60 |
| **RDS PostgreSQL** | db.t3.small (2 vCPU, 2GB RAM) | $35 |
| **S3 Storage** | 100GB standard | $2.30 |
| **S3 Requests** | 100k PUT, 1M GET | $0.50 |
| **ALB** | 1 load balancer | $25 |
| **Data Transfer** | 50GB egress | $4.50 |
| **NAT Gateway** | Single AZ | $32 |
| **CloudWatch** | Logs + metrics | $15 |
| **Route53** | Hosted zone + queries | $1 |
| **ECR** | Image storage (5GB) | $0.50 |
| **ACM** | SSL certificates | $0 (free) |
| **OpenAI API** | ~10k messages/month (Phase 3) | $20 |
| **TOTAL** | | **~$268/month** |

**Cost Optimization Tips**:
- Use Spot instances for non-prod ($30/month savings)
- Reserved Instances for RDS (30% savings)
- Delete old ECR images (saves $3-5/month)
- Use CloudFront for static assets (reduces ALB costs)

**Scaling Costs** (at 1,000 active users):
- Upgrade RDS to db.t3.medium: +$35/month
- Add worker node: +$30/month
- S3 storage (10GB/user avg): +$230/month
- Estimated total: ~$563/month

---

## Testing Strategy

### Backend Tests

**Unit Tests** (pytest):
```python
# tests/test_stories.py
def test_create_story_requires_membership(db, user, legacy):
    # User not a member
    with pytest.raises(HTTPException) as exc:
        service.create_story(db, user.id, StoryCreate(
            legacy_id=legacy.id,
            title="Test",
            content="Content",
            visibility="private"
        ))
    assert exc.value.status_code == 403
```

**Integration Tests** (pytest + TestClient):
```python
from fastapi.testclient import TestClient

def test_create_legacy_flow(client: TestClient, auth_headers):
    # Create legacy
    response = client.post("/api/legacies", json={
        "name": "Jane Doe",
        "birth_date": "1950-01-01",
        "death_date": "2024-01-01"
    }, headers=auth_headers)
    assert response.status_code == 201
    legacy_id = response.json()["id"]

    # Create story
    response = client.post("/api/stories", json={
        "legacy_id": legacy_id,
        "title": "Childhood Memory",
        "content": "She loved gardening...",
        "visibility": "private"
    }, headers=auth_headers)
    assert response.status_code == 201
```

**Coverage Target**: >80%

### Frontend Tests

**Unit Tests** (Vitest):
```typescript
import { render, screen } from '@testing-library/react';
import { StoryCard } from './StoryCard';

test('renders story title and content', () => {
  const story = {
    id: '123',
    title: 'Test Story',
    content: '# Heading\n\nContent',
    author_name: 'John Doe',
    created_at: '2025-01-01T00:00:00Z',
    visibility: 'private'
  };

  render(<StoryCard story={story} />);
  expect(screen.getByText('Test Story')).toBeInTheDocument();
  expect(screen.getByText('John Doe')).toBeInTheDocument();
});
```

**E2E Tests** (Playwright):
```typescript
import { test, expect } from '@playwright/test';

test('create legacy and write story', async ({ page }) => {
  // Login (mock OAuth for E2E)
  await page.goto('/');
  await page.click('text=Login with Google');

  // Create legacy
  await page.click('text=Create Legacy');
  await page.fill('input[name="name"]', 'Jane Doe');
  await page.fill('input[name="birth_date"]', '1950-01-01');
  await page.click('button:has-text("Create")');

  // Verify legacy appears
  await expect(page.locator('text=Jane Doe')).toBeVisible();

  // Write story
  await page.click('text=Jane Doe');
  await page.click('text=Write Story');
  await page.fill('input[name="title"]', 'First Memory');
  await page.fill('textarea[name="content"]', 'She loved gardening...');
  await page.click('button:has-text("Save")');

  // Verify story saved
  await expect(page.locator('text=First Memory')).toBeVisible();
});
```

---

## Migration Path

### When to Add Complex Features

**OpenSearch** (Full-text + Semantic Search)
- **Trigger**: Users request search across story content, or "find similar stories"
- **Effort**: 2-3 weeks
- **Cost**: +$150/month (managed service)
- **Migration**:
  1. Deploy OpenSearch cluster
  2. Create indexing pipeline (background worker reads stories from Postgres, indexes to OpenSearch)
  3. Add `/api/search/advanced` endpoint (queries OpenSearch)
  4. Add vector embeddings for semantic search (call OpenAI embeddings API)
  5. Keep simple name search in Postgres as fallback

**Neo4j** (Graph Relationships)
- **Trigger**: Need complex traversals like "show all stories mentioning person X across legacies"
- **Effort**: 6-8 weeks
- **Cost**: +$120/month (self-hosted on EC2)
- **Migration**:
  1. Deploy Neo4j cluster
  2. Create projection pipeline (Postgres → Neo4j via events or batch job)
  3. Add graph query endpoints (`/api/graph/traverse`)
  4. Update frontend to visualize relationships (D3.js or similar)

**Microservices** (Service Decomposition)
- **Trigger**: Team grows >3 developers, or specific services need independent scaling
- **Effort**: 4-6 weeks per extracted service
- **Cost**: +$100-200/month (additional pods, message queue)
- **Migration**:
  1. Extract Media Service first (independent scaling, heavy processing)
  2. Add SNS/SQS for async events
  3. Refactor Core API to publish events on story create/update
  4. Extract Search Indexer (consumes events, updates OpenSearch)
  5. Extract Stories Service if needed

**Module Federation** (Plugin System)
- **Trigger**: Third-party developers want to extend platform
- **Effort**: 8-12 weeks
- **Cost**: +$50/month (plugin hosting)
- **Migration**:
  1. Refactor frontend build to support Module Federation
  2. Create Plugin SDK (TypeScript + Python)
  3. Build plugin registry and approval workflow
  4. Deploy proof-of-concept plugin
  5. Document plugin development guide

**Key Principle**: All migrations are **additive**, not disruptive. Existing functionality continues working while new capabilities are added.

---

## Development Workflow

### Local Development

**Prerequisites**:
- Docker Desktop
- Python 3.12+
- Node.js 20+
- pnpm 9+

**Start Services**:
```bash
# Clone repo
git clone https://github.com/mosaic-stories/mosaic-life
cd mosaic-life

# Start backend + postgres
cd infra/compose
docker compose up -d postgres core-api

# Run migrations
docker compose exec core-api alembic upgrade head

# Start frontend (separate terminal)
cd apps/web
pnpm install
pnpm dev
```

**Access**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- API Docs: http://localhost:8080/docs
- Postgres: localhost:15432

### Code Organization

```
/apps/mosaic-life/
├── apps/
│   └── web/                    # Frontend React app
│       ├── src/
│       │   ├── components/     # Shared UI components
│       │   ├── pages/          # Route pages
│       │   ├── lib/            # Utilities (auth, API client)
│       │   └── App.tsx
│       ├── package.json
│       └── vite.config.ts
├── services/
│   └── core-api/               # Backend FastAPI app
│       ├── app/
│       │   ├── auth/           # Google OAuth handlers
│       │   ├── legacies/       # Legacy CRUD
│       │   ├── stories/        # Story CRUD
│       │   ├── media/          # S3 upload handlers
│       │   ├── models/         # SQLAlchemy models
│       │   └── main.py
│       ├── alembic/            # Database migrations
│       ├── tests/
│       └── pyproject.toml
├── infra/
│   ├── helm/                   # Kubernetes Helm charts
│   │   └── mosaic-life/
│   └── compose/                # Local Docker Compose
│       └── docker-compose.yml
└── docs/
    ├── architecture/
    │   ├── MVP-SIMPLIFIED-ARCHITECTURE.md  (this file)
    │   └── target/             # Future complex architecture (archived)
    └── ops/
        ├── DEPLOYMENT-GUIDE.md
        └── RUNBOOK.md
```

---

## FAQ

### Why not use Next.js for the frontend?

**Answer**: Next.js is excellent for marketing sites (SEO, SSR), but our app is a **private authenticated SPA** where SEO doesn't matter. Vite is simpler, faster to develop with, and produces smaller bundles. We may use Next.js for a separate marketing site later.

### Why not use Cognito instead of Google OAuth?

**Answer**: Cognito charges per MAU (monthly active user) and adds operational complexity. Google OAuth is free, users already have accounts, and it's simpler to integrate. We can add Cognito later if we need multi-provider auth or enterprise SSO.

### Why PostgreSQL instead of DynamoDB?

**Answer**: PostgreSQL handles relational data (users → legacies → stories) more naturally than DynamoDB's key-value model. We'd need complex secondary indexes in DynamoDB, and it's harder to query. Postgres is also easier to understand and debug.

### Won't a monolithic backend become a bottleneck?

**Answer**: Not at MVP scale. A single FastAPI app can handle 10,000s of requests/second. We can horizontal scale (add pods) for free. Microservices add complexity (network calls, debugging, consistency) that we don't need until we have >100k users or >5 developers.

### How do we handle database migrations in production?

**Answer**: Run `alembic upgrade head` via `kubectl exec` before deploying new backend version. Use forward-compatible migrations (add columns as nullable, backfill later). ArgoCD can pause rollout if migration fails.

### What if S3 costs explode?

**Answer**: Set per-user storage limits (e.g., 100MB free, $1/month for 1GB). Use lifecycle policies to delete untagged media after 90 days. Monitor costs via CloudWatch billing alerts. Consider CloudFront CDN for frequent access (reduces S3 GET costs).

### How do we prevent spam or abuse?

**Answer**: Rate limiting (10 stories/minute, 100 AI messages/day). Email verification for new accounts. Manual review of first few stories per user. Add CAPTCHA if needed. Block disposable email domains.

### Can users export their data?

**Answer**: Yes! Add `/api/export` endpoint that returns all user's stories as Markdown ZIP. This is important for data portability and user trust. Implement in Phase 2.

---

## Conclusion

This architecture is **intentionally simple** to enable rapid delivery while preserving the core value: helping families preserve stories. We've deferred complexity (microservices, graph databases, search engines, plugin systems) until we have proven user demand.

**Key Decisions**:
- ✅ Postgres for all data (no distributed systems)
- ✅ Direct integrations (no middleware)
- ✅ Separate backend/frontend (as requested)
- ✅ Google OAuth (free, simple)
- ✅ S3 for media (industry standard)
- ✅ Deploy to existing EKS (infrastructure ready)

**Target**: Production deployment in **3 weeks**, full-featured MVP in **9 weeks**, cost <$350/month.

**Philosophy**: Build the simplest thing that works. Add complexity only when it's the cheaper solution at scale.

---

## References

- [MVP Execution Plan](../project/MVP-SIMPLIFIED-EXECUTION-PLAN.md)
- [Project Assessment](../project/PROJECT-ASSESSMENT.md)
- [Database Schema Migrations](../../services/core-api/alembic/)
- [API Documentation](http://localhost:8080/docs) (local dev)
- [Deployment Guide](../ops/DEPLOYMENT-GUIDE.md)
- [Archived Target Architecture](./target/CORE-BACKEND-ARCHITECTURE.md)

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Next Review**: After Phase 1 completion (Week 3)
