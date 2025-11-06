# MVP Simplified - Execution Plan

**Status**: Approved
**Timeline**: 9 weeks (3-week increments)
**Team**: 2 developers
**Infrastructure**: Already deployed (EKS, ArgoCD, CI/CD)
**Cost Target**: <$350/month

---

## Executive Summary

This plan delivers a production-ready Mosaic Life MVP using a simplified stack:
- **Backend**: FastAPI + PostgreSQL (single consolidated service)
- **Frontend**: React + Vite (separate service, static build)
- **Storage**: S3 for media
- **Auth**: Google OAuth (direct, no Cognito)
- **Deployment**: Existing EKS + ArgoCD setup

**Key Simplifications** vs. original architecture:
- ❌ Removed: OpenSearch, Neo4j, SNS/SQS, LiteLLM, Module Federation, Microservices
- ✅ Kept: Separate backend/frontend deployment, existing CI/CD, ArgoCD workflows
- ✅ Added: Clear migration path to add complexity only when needed

---

## Phase 1: Core MVP (Weeks 1-3)

**Goal**: Ship working application to production that you and your family can use immediately.

**Deliverables**:
- Google OAuth authentication
- Legacy creation and listing
- Story creation, listing, and visibility control
- Basic media upload to S3
- Deployed to production with HTTPS

### Sprint 1.1 - Foundation & Schema (Week 1)

#### Task 1.1.1: Create Simplified Architecture Document
**Owner**: Lead developer
**Effort**: 4 hours
**Deliverables**:
- `/docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md`
- Documents: Postgres + FastAPI + React + S3 stack
- Includes: System diagram, technology choices, deployment model
- Migration path: When/how to add OpenSearch, Neo4j, etc.

**Acceptance Criteria**:
- [ ] Architecture document reviewed and approved
- [ ] Clear separation of backend/frontend documented
- [ ] Deployment model matches existing EKS setup
- [ ] Migration path to complex features defined

**Files to create**:
```
/docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md
/docs/architecture/target/           (move complex docs here)
```

---

#### Task 1.1.2: Simplify docker-compose for Local Development
**Owner**: DevOps-focused developer
**Effort**: 3 hours
**Deliverables**:
- Updated `/infra/compose/docker-compose.yml`
- Remove: OpenSearch, Localstack, Neo4j, Jaeger (optional)
- Keep: PostgreSQL, core-api, web
- Fast startup: <10 seconds

**Acceptance Criteria**:
- [ ] `docker compose up` starts in <10 seconds
- [ ] Postgres health check passing
- [ ] core-api connects to Postgres
- [ ] web proxies to core-api on `/api/*`
- [ ] All services restart on code changes (hot reload)

**Files to modify**:
```
/infra/compose/docker-compose.yml
/infra/compose/.env.example
/infra/compose/README.md
```

**Before/After**:
```yaml
# BEFORE: 6 services, 60s startup, 2GB RAM
services: [postgres, opensearch, localstack, jaeger, core-api, web]

# AFTER: 3 services, <10s startup, 300MB RAM
services: [postgres, core-api, web]
```

---

#### Task 1.1.3: Database Schema Design & Migration
**Owner**: Backend developer
**Effort**: 6 hours
**Deliverables**:
- Alembic migration: 5 tables (users, legacies, legacy_members, stories, media)
- Indexes for performance
- Sample data seed script
- Rollback tested

**Schema**:
```sql
-- users: Google OAuth identity
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- legacies: People being remembered
CREATE TABLE legacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE,
  death_date DATE,
  biography TEXT, -- Optional short bio
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- legacy_members: Access control and join requests
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

-- stories: Markdown stories with visibility
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

-- media: S3 references for images/videos
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  legacy_id UUID REFERENCES legacies(id) ON DELETE SET NULL, -- Optional link
  s3_bucket TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(s3_bucket, s3_key)
);

-- Indexes for common queries
CREATE INDEX idx_legacies_name_trgm ON legacies USING gin(name gin_trgm_ops);
  -- For search: WHERE name ILIKE '%query%' or similarity search
CREATE INDEX idx_legacies_created_by ON legacies(created_by);
CREATE INDEX idx_legacy_members_user ON legacy_members(user_id);
CREATE INDEX idx_legacy_members_legacy ON legacy_members(legacy_id);
CREATE INDEX idx_stories_legacy_created ON stories(legacy_id, created_at DESC);
  -- For timeline view
CREATE INDEX idx_stories_author ON stories(author_id);
CREATE INDEX idx_media_user ON media(user_id);
CREATE INDEX idx_media_legacy ON media(legacy_id) WHERE legacy_id IS NOT NULL;
```

**Acceptance Criteria**:
- [ ] Migration runs successfully: `alembic upgrade head`
- [ ] Rollback tested: `alembic downgrade -1`
- [ ] Seed script creates: 2 users, 1 legacy, 3 stories, 2 media records
- [ ] All indexes created
- [ ] Foreign key constraints validated

**Files to create**:
```
/services/core-api/alembic/versions/001_mvp_schema.py
/services/core-api/scripts/seed_dev_data.py
/docs/architecture/DATA-MODEL-SIMPLIFIED.md
```

---

#### Task 1.1.4: Clean Up Dependencies
**Owner**: Backend developer
**Effort**: 2 hours
**Deliverables**:
- Remove unused dependencies from `pyproject.toml`
- Remove unused npm packages from `package.json`
- Update Dockerfiles for faster builds

**Backend - Remove**:
```toml
# Remove from pyproject.toml
opensearch-py
aioboto3  (keep boto3 for S3)
neo4j
```

**Backend - Keep**:
```toml
fastapi
uvicorn[standard]
pydantic>=2.0
sqlalchemy>=2.0
alembic
psycopg[binary]>=3.0
python-jose[cryptography]  # For JWT if needed
httpx  # For external API calls (Google OAuth)
boto3  # For S3
python-multipart  # For file uploads
authlib  # For OAuth
itsdangerous  # For session cookies
```

**Frontend - Remove**:
```json
// Remove Module Federation plugins
// Remove @mosaiclife/plugin-sdk references
```

**Acceptance Criteria**:
- [ ] `pip install -e .` completes in <30s
- [ ] `pnpm install` completes in <20s
- [ ] Backend Docker build <2 minutes
- [ ] Frontend Docker build <3 minutes
- [ ] No unused import warnings

**Files to modify**:
```
/services/core-api/pyproject.toml
/services/core-api/Dockerfile
/apps/web/package.json
/apps/web/Dockerfile
```

---

### Sprint 1.2 - Authentication & Core APIs (Week 2)

#### Task 1.2.1: Google OAuth Implementation
**Owner**: Backend developer
**Effort**: 8 hours
**Deliverables**:
- OAuth flow: `/auth/google/login` → Google → `/auth/google/callback`
- Session management: httpOnly cookies with secure flag
- `/api/me` endpoint: Returns current user or 401
- Logout: `/auth/logout`

**Implementation**:
```python
# /services/core-api/app/auth/google.py
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

# OAuth client setup
config = Config('.env')
oauth = OAuth(config)
oauth.register(
    name='google',
    client_id=config('GOOGLE_CLIENT_ID'),
    client_secret=config('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

router = APIRouter(prefix='/auth')

@router.get('/google/login')
async def google_login(request: Request):
    redirect_uri = request.url_for('google_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get('/google/callback')
async def google_callback(request: Request, response: Response, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get('userinfo')

    # Upsert user in database
    user = db.query(User).filter(User.google_id == user_info['sub']).first()
    if not user:
        user = User(
            google_id=user_info['sub'],
            email=user_info['email'],
            name=user_info['name'],
            avatar_url=user_info.get('picture')
        )
        db.add(user)
        db.commit()

    # Create session (store in signed cookie)
    session_data = create_session_cookie(user.id)
    response.set_cookie(
        key="session",
        value=session_data,
        httponly=True,
        secure=True,  # HTTPS only
        samesite='lax',
        max_age=86400 * 7  # 7 days
    )

    return RedirectResponse(url='/')

@router.get('/me')
async def get_current_user(user: User = Depends(require_auth)):
    return {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'avatar_url': user.avatar_url
    }

@router.post('/logout')
async def logout(response: Response):
    response.delete_cookie('session')
    return {'message': 'Logged out'}
```

**Environment Variables** (add to `.env`):
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
SESSION_SECRET_KEY=generate-with-openssl-rand-hex-32
APP_URL=http://localhost:5173  # Frontend URL for redirects
```

**Acceptance Criteria**:
- [ ] OAuth flow completes successfully in local dev
- [ ] User created in database on first login
- [ ] Session cookie set with httpOnly, secure, samesite=lax
- [ ] `/api/me` returns user data when authenticated
- [ ] `/api/me` returns 401 when not authenticated
- [ ] Logout clears session cookie
- [ ] Unit tests: Session creation, user upsert, cookie validation

**Files to create**:
```
/services/core-api/app/auth/google.py
/services/core-api/app/auth/session.py
/services/core-api/app/auth/dependencies.py  (require_auth)
/services/core-api/app/models/user.py
/services/core-api/tests/test_auth.py
```

---

#### Task 1.2.2: Legacy CRUD APIs
**Owner**: Backend developer
**Effort**: 10 hours
**Deliverables**:
- `POST /api/legacies` - Create legacy (creator auto-added)
- `GET /api/legacies` - List user's legacies
- `GET /api/legacies/{id}` - Get legacy details
- `GET /api/legacies/search?q=name` - Search by name
- `POST /api/legacies/{id}/join` - Request to join
- `POST /api/legacies/{id}/members/{user_id}/approve` - Approve join request
- Authorization: Only creators can approve members

**API Specification**:
```python
# /services/core-api/app/legacies/router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from . import schemas, service
from app.auth.dependencies import require_auth

router = APIRouter(prefix='/api/legacies', tags=['legacies'])

@router.post('/', response_model=schemas.LegacyResponse, status_code=status.HTTP_201_CREATED)
async def create_legacy(
    data: schemas.LegacyCreate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Create a new legacy. User becomes the creator automatically."""
    return service.create_legacy(db, user.id, data)

@router.get('/', response_model=List[schemas.LegacySummary])
async def list_legacies(
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """List all legacies where user is a member."""
    return service.list_user_legacies(db, user.id)

@router.get('/search', response_model=List[schemas.LegacySummary])
async def search_legacies(
    q: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Search legacies by name (case-insensitive)."""
    return service.search_legacies_by_name(db, q)

@router.get('/{legacy_id}', response_model=schemas.LegacyDetail)
async def get_legacy(
    legacy_id: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get legacy details. User must be a member or legacy must have public stories."""
    return service.get_legacy_detail(db, user.id, legacy_id)

@router.post('/{legacy_id}/join', status_code=status.HTTP_201_CREATED)
async def request_join(
    legacy_id: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Request to join a legacy. Creates pending membership."""
    return service.request_join_legacy(db, user.id, legacy_id)

@router.post('/{legacy_id}/members/{user_id}/approve')
async def approve_member(
    legacy_id: str,
    user_id: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Approve a pending join request. Only creators can approve."""
    return service.approve_legacy_member(db, user.id, legacy_id, user_id)
```

**Pydantic Schemas**:
```python
# /services/core-api/app/legacies/schemas.py
from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional

class LegacyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    birth_date: Optional[date] = None
    death_date: Optional[date] = None
    biography: Optional[str] = Field(None, max_length=5000)

class LegacySummary(BaseModel):
    id: str
    name: str
    birth_date: Optional[date]
    death_date: Optional[date]
    created_at: datetime
    story_count: int  # Computed field
    member_count: int  # Computed field

class LegacyDetail(LegacySummary):
    biography: Optional[str]
    created_by: str  # User ID
    user_role: str  # 'creator', 'editor', 'member', or None if not a member
    members: List[MemberSummary]

class MemberSummary(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str]
    role: str
    joined_at: datetime
```

**Authorization Helper**:
```python
# /services/core-api/app/legacies/service.py
def check_legacy_access(db: Session, user_id: str, legacy_id: str, required_role: str = 'member'):
    """
    Check if user has required role for legacy.
    Raises HTTPException if unauthorized.
    """
    member = db.query(LegacyMember).filter(
        LegacyMember.legacy_id == legacy_id,
        LegacyMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail='Not a member of this legacy')

    if member.role == 'pending':
        raise HTTPException(status_code=403, detail='Membership pending approval')

    role_hierarchy = {'creator': 3, 'editor': 2, 'member': 1}
    if role_hierarchy.get(member.role, 0) < role_hierarchy.get(required_role, 0):
        raise HTTPException(status_code=403, detail=f'Requires {required_role} role')

    return member
```

**Acceptance Criteria**:
- [ ] Create legacy assigns creator role automatically
- [ ] List legacies returns only user's memberships
- [ ] Search works case-insensitive (`ILIKE '%query%'`)
- [ ] Get legacy enforces member access (403 if not member)
- [ ] Join request creates pending membership
- [ ] Approve changes pending → member (only creator can approve)
- [ ] Unit tests: Each endpoint, authorization checks
- [ ] Integration tests: Full join request flow

**Files to create**:
```
/services/core-api/app/legacies/router.py
/services/core-api/app/legacies/schemas.py
/services/core-api/app/legacies/service.py
/services/core-api/app/models/legacy.py
/services/core-api/app/models/legacy_member.py
/services/core-api/tests/test_legacies.py
```

---

#### Task 1.2.3: Story CRUD APIs
**Owner**: Backend developer
**Effort**: 8 hours
**Deliverables**:
- `POST /api/stories` - Create story
- `GET /api/legacies/{id}/stories` - List stories (filtered by visibility)
- `GET /api/stories/{id}` - Get story detail
- `PUT /api/stories/{id}` - Update story
- `DELETE /api/stories/{id}` - Delete story (author or creator only)

**API Specification**:
```python
# /services/core-api/app/stories/router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from . import schemas, service

router = APIRouter(prefix='/api/stories', tags=['stories'])

@router.post('/', response_model=schemas.StoryResponse, status_code=201)
async def create_story(
    data: schemas.StoryCreate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Create a story. User must be a legacy member."""
    return service.create_story(db, user.id, data)

@router.get('/', response_model=List[schemas.StorySummary])
async def list_stories(
    legacy_id: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    List stories for a legacy, filtered by visibility:
    - 'public': All members see
    - 'private': Only legacy members see
    - 'personal': Only author sees
    """
    return service.list_legacy_stories(db, user.id, legacy_id)

@router.get('/{story_id}', response_model=schemas.StoryDetail)
async def get_story(
    story_id: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Get story detail. Enforces visibility rules."""
    return service.get_story_detail(db, user.id, story_id)

@router.put('/{story_id}', response_model=schemas.StoryResponse)
async def update_story(
    story_id: str,
    data: schemas.StoryUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Update story. Only author can edit."""
    return service.update_story(db, user.id, story_id, data)

@router.delete('/{story_id}', status_code=204)
async def delete_story(
    story_id: str,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Delete story. Only author or legacy creator can delete."""
    service.delete_story(db, user.id, story_id)
```

**Pydantic Schemas**:
```python
# /services/core-api/app/stories/schemas.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal

class StoryCreate(BaseModel):
    legacy_id: str
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1, max_length=50000)  # Markdown
    visibility: Literal['public', 'private', 'personal'] = 'private'

class StoryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = Field(None, min_length=1, max_length=50000)
    visibility: Optional[Literal['public', 'private', 'personal']] = None

class StorySummary(BaseModel):
    id: str
    title: str
    author_id: str
    author_name: str
    visibility: str
    created_at: datetime
    updated_at: datetime

class StoryDetail(StorySummary):
    content: str  # Full markdown
    legacy_id: str
    legacy_name: str

class StoryResponse(BaseModel):
    id: str
    legacy_id: str
    title: str
    visibility: str
    created_at: datetime
```

**Visibility Filter Logic**:
```python
# /services/core-api/app/stories/service.py
def list_legacy_stories(db: Session, user_id: str, legacy_id: str):
    # Check if user is a member
    member = db.query(LegacyMember).filter(
        LegacyMember.legacy_id == legacy_id,
        LegacyMember.user_id == user_id,
        LegacyMember.role != 'pending'
    ).first()

    query = db.query(Story).filter(Story.legacy_id == legacy_id)

    if member:
        # Member sees: public + private + own personal stories
        query = query.filter(
            or_(
                Story.visibility == 'public',
                Story.visibility == 'private',
                and_(Story.visibility == 'personal', Story.author_id == user_id)
            )
        )
    else:
        # Non-member sees only public stories
        query = query.filter(Story.visibility == 'public')

    return query.order_by(Story.created_at.desc()).all()
```

**Acceptance Criteria**:
- [ ] Create story validates user is legacy member
- [ ] List stories respects visibility rules (public/private/personal)
- [ ] Get story enforces visibility (403 if not authorized)
- [ ] Update story only allowed by author
- [ ] Delete story allowed by author or legacy creator
- [ ] Markdown content sanitized on render (frontend)
- [ ] Unit tests: Visibility filtering, authorization
- [ ] Integration tests: Create → list → update → delete flow

**Files to create**:
```
/services/core-api/app/stories/router.py
/services/core-api/app/stories/schemas.py
/services/core-api/app/stories/service.py
/services/core-api/app/models/story.py
/services/core-api/tests/test_stories.py
```

---

### Sprint 1.3 - Media, Frontend, Deploy (Week 3)

#### Task 1.3.1: S3 Media Upload Backend
**Owner**: Backend developer
**Effort**: 6 hours
**Deliverables**:
- `POST /api/media/presign` - Get presigned upload URL
- `POST /api/media` - Register uploaded media in database
- `GET /api/media?legacy_id={id}` - List user's media
- S3 bucket lifecycle policy (delete after 90 days if not referenced)

**Implementation**:
```python
# /services/core-api/app/media/router.py
import boto3
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException
from . import schemas, service

s3_client = boto3.client('s3', config=Config(signature_version='s3v4'))

router = APIRouter(prefix='/api/media', tags=['media'])

@router.post('/presign', response_model=schemas.PresignedUpload)
async def get_presigned_upload_url(
    data: schemas.PresignRequest,
    user: User = Depends(require_auth)
):
    """
    Generate presigned S3 upload URL.
    Client uploads directly to S3, then calls POST /media to register.
    """
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
                     'video/mp4', 'video/quicktime']
    if data.content_type not in allowed_types:
        raise HTTPException(400, f'Content type {data.content_type} not allowed')

    # Validate file size (max 50MB for images, 500MB for videos)
    max_size = 500 * 1024 * 1024 if data.content_type.startswith('video/') else 50 * 1024 * 1024
    if data.size_bytes > max_size:
        raise HTTPException(400, f'File too large (max {max_size} bytes)')

    # Generate S3 key: {user_id}/{uuid}.{ext}
    file_ext = data.filename.split('.')[-1] if '.' in data.filename else ''
    s3_key = f"{user.id}/{uuid4()}.{file_ext}"

    # Generate presigned URL (expires in 5 minutes)
    presigned_url = s3_client.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': os.getenv('S3_MEDIA_BUCKET'),
            'Key': s3_key,
            'ContentType': data.content_type
        },
        ExpiresIn=300
    )

    return {
        'upload_url': presigned_url,
        's3_key': s3_key,
        'expires_in': 300
    }

@router.post('/', response_model=schemas.MediaResponse, status_code=201)
async def register_media(
    data: schemas.MediaCreate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Register media in database after successful S3 upload.
    """
    # Verify S3 object exists
    try:
        s3_client.head_object(Bucket=os.getenv('S3_MEDIA_BUCKET'), Key=data.s3_key)
    except:
        raise HTTPException(404, 'S3 object not found')

    return service.create_media_record(db, user.id, data)

@router.get('/', response_model=List[schemas.MediaSummary])
async def list_media(
    legacy_id: Optional[str] = None,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """List user's media, optionally filtered by legacy."""
    return service.list_user_media(db, user.id, legacy_id)
```

**S3 Bucket Setup** (document in deployment guide):
```bash
# Create bucket (via Terraform or AWS Console)
aws s3 mb s3://mosaic-life-media-{env}

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket mosaic-life-media-{env} \
  --versioning-configuration Status=Enabled

# Lifecycle policy: Delete incomplete multipart uploads after 1 day
# Delete untagged objects after 90 days (objects referenced in DB get tagged)
```

**Acceptance Criteria**:
- [ ] Presigned URL generated for allowed content types
- [ ] Upload size limits enforced (50MB images, 500MB videos)
- [ ] S3 object verified before database registration
- [ ] Media list filtered by user (can't see others' media)
- [ ] Unit tests: Presign validation, size limits
- [ ] Integration tests: Upload flow (presign → upload → register)

**Files to create**:
```
/services/core-api/app/media/router.py
/services/core-api/app/media/schemas.py
/services/core-api/app/media/service.py
/services/core-api/app/models/media.py
/services/core-api/tests/test_media.py
/docs/ops/S3-SETUP.md
```

---

#### Task 1.3.2: Frontend - Auth & Layout
**Owner**: Frontend developer
**Effort**: 8 hours
**Deliverables**:
- Google OAuth flow (redirect to backend)
- Auth guard for protected routes
- App shell with navigation
- Landing page (public)

**Implementation**:
```typescript
// /apps/web/src/lib/auth.ts
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

export async function getCurrentUser(): Promise<User | null> {
  const response = await fetch('/api/me', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Failed to fetch user');
  return response.json();
}

export function redirectToLogin() {
  window.location.href = '/auth/google/login';
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
}

// /apps/web/src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// /apps/web/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingPage } from './pages/LandingPage';
import { AppShell } from './pages/AppShell';
import { LegaciesPage } from './pages/LegaciesPage';
import { LegacyDetailPage } from './pages/LegacyDetailPage';
import { StoriesPage } from './pages/StoriesPage';
import { ProtectedRoute } from './components/ProtectedRoute';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>
            <Route index element={<LegaciesPage />} />
            <Route path="legacies/:id" element={<LegacyDetailPage />} />
            <Route path="legacies/:id/stories" element={<StoriesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

**Acceptance Criteria**:
- [ ] Unauthenticated users see landing page
- [ ] Login button redirects to `/auth/google/login`
- [ ] After OAuth, user redirected to `/app`
- [ ] Protected routes redirect to landing if not authenticated
- [ ] App shell shows user avatar and logout button
- [ ] Navigation works between legacies/stories pages

**Files to create**:
```
/apps/web/src/lib/auth.ts
/apps/web/src/hooks/useAuth.ts
/apps/web/src/components/ProtectedRoute.tsx
/apps/web/src/pages/LandingPage.tsx
/apps/web/src/pages/AppShell.tsx
```

---

#### Task 1.3.3: Frontend - Legacy Management
**Owner**: Frontend developer
**Effort**: 10 hours
**Deliverables**:
- Legacy list page
- Legacy detail page
- Create legacy form
- Search legacies
- Join request flow

**Key Components**:
```typescript
// /apps/web/src/pages/LegaciesPage.tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CreateLegacyModal } from '../components/CreateLegacyModal';
import { SearchBar } from '../components/SearchBar';

export function LegaciesPage() {
  const { data: legacies } = useQuery(['legacies'], fetchLegacies);
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div>
      <header>
        <h1>Legacies</h1>
        <button onClick={() => setShowSearch(true)}>Search</button>
        <CreateLegacyModal />
      </header>

      {showSearch && <SearchBar onSelect={(legacy) => navigate(`/app/legacies/${legacy.id}`)} />}

      <div className="legacy-grid">
        {legacies?.map(legacy => (
          <Link to={`/app/legacies/${legacy.id}`} key={legacy.id}>
            <h3>{legacy.name}</h3>
            <p>{legacy.birth_date} - {legacy.death_date}</p>
            <p>{legacy.story_count} stories</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// /apps/web/src/components/CreateLegacyModal.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function CreateLegacyModal() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation(
    (data) => fetch('/api/legacies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['legacies']);
        setOpen(false);
      }
    }
  );

  return (
    <dialog open={open}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        createMutation.mutate({
          name: formData.get('name'),
          birth_date: formData.get('birth_date'),
          death_date: formData.get('death_date'),
          biography: formData.get('biography')
        });
      }}>
        <input name="name" placeholder="Name" required />
        <input name="birth_date" type="date" />
        <input name="death_date" type="date" />
        <textarea name="biography" placeholder="Short biography" />
        <button type="submit">Create</button>
      </form>
    </dialog>
  );
}
```

**Acceptance Criteria**:
- [ ] Legacy list displays user's legacies
- [ ] Create legacy form validates and submits
- [ ] Search finds legacies by name
- [ ] Join request button appears for non-members
- [ ] Legacy detail shows members and stories count

**Files to create**:
```
/apps/web/src/pages/LegaciesPage.tsx
/apps/web/src/pages/LegacyDetailPage.tsx
/apps/web/src/components/CreateLegacyModal.tsx
/apps/web/src/components/SearchBar.tsx
/apps/web/src/lib/api/legacies.ts
```

---

#### Task 1.3.4: Frontend - Story Management
**Owner**: Frontend developer
**Effort**: 12 hours
**Deliverables**:
- Story list page
- Story detail page
- Create/edit story (basic textarea, TipTap in Phase 2)
- Visibility selector
- Markdown rendering with sanitization

**Implementation**:
```typescript
// /apps/web/src/pages/StoriesPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CreateStoryButton } from '../components/CreateStoryButton';
import { StoryCard } from '../components/StoryCard';

export function StoriesPage() {
  const { id: legacyId } = useParams();
  const { data: stories } = useQuery(['stories', legacyId], () => fetchStories(legacyId));

  return (
    <div>
      <header>
        <h1>Stories</h1>
        <CreateStoryButton legacyId={legacyId} />
      </header>

      <div className="story-timeline">
        {stories?.map(story => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>
    </div>
  );
}

// /apps/web/src/components/StoryCard.tsx
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function StoryCard({ story }: { story: Story }) {
  const sanitizedHTML = DOMPurify.sanitize(marked(story.content));

  return (
    <article>
      <header>
        <h2>{story.title}</h2>
        <span>{story.author_name} • {formatDate(story.created_at)}</span>
        <span className="visibility">{story.visibility}</span>
      </header>
      <div dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />
    </article>
  );
}

// /apps/web/src/components/StoryEditor.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function StoryEditor({ legacyId, story }: { legacyId: string, story?: Story }) {
  const [title, setTitle] = useState(story?.title ?? '');
  const [content, setContent] = useState(story?.content ?? '');
  const [visibility, setVisibility] = useState(story?.visibility ?? 'private');

  const queryClient = useQueryClient();

  const saveMutation = useMutation(
    (data) => {
      const url = story ? `/api/stories/${story.id}` : '/api/stories';
      const method = story ? 'PUT' : 'POST';
      return fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, legacy_id: legacyId })
      });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['stories', legacyId]);
      }
    }
  );

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      saveMutation.mutate({ title, content, visibility });
    }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Story title"
        required
      />

      <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
        <option value="public">Public</option>
        <option value="private">Private (legacy members)</option>
        <option value="personal">Personal (only me)</option>
      </select>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your story in Markdown..."
        rows={20}
        required
      />

      <button type="submit">Save Story</button>
    </form>
  );
}
```

**Acceptance Criteria**:
- [ ] Story list displays stories chronologically
- [ ] Story create/edit form validates required fields
- [ ] Markdown rendered safely (DOMPurify sanitization)
- [ ] Visibility selector defaults to 'private'
- [ ] Stories filtered by visibility (backend enforces, frontend displays)

**Files to create**:
```
/apps/web/src/pages/StoriesPage.tsx
/apps/web/src/pages/StoryDetailPage.tsx
/apps/web/src/components/StoryCard.tsx
/apps/web/src/components/StoryEditor.tsx
/apps/web/src/lib/api/stories.ts
/apps/web/src/lib/markdown.ts  (sanitization helper)
```

---

#### Task 1.3.5: Frontend - Media Upload
**Owner**: Frontend developer
**Effort**: 6 hours
**Deliverables**:
- Media upload component (drag-drop or file picker)
- Upload progress indicator
- Media list (user's uploads)
- Image preview in story editor

**Implementation**:
```typescript
// /apps/web/src/components/MediaUploader.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function MediaUploader({ legacyId }: { legacyId?: string }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const uploadFile = async (file: File) => {
    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Get presigned URL
      const presignResponse = await fetch('/api/media/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size
        })
      });
      const { upload_url, s3_key } = await presignResponse.json();

      // Step 2: Upload to S3
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        setProgress(Math.round((e.loaded / e.total) * 100));
      });

      await new Promise((resolve, reject) => {
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = reject;
        xhr.open('PUT', upload_url);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Register in database
      await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          s3_key,
          s3_bucket: process.env.VITE_S3_BUCKET,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
          legacy_id: legacyId
        })
      });

      queryClient.invalidateQueries(['media']);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
        }}
        disabled={uploading}
      />
      {uploading && <progress value={progress} max={100} />}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] File picker accepts images and videos
- [ ] Upload progress shown during S3 upload
- [ ] Media registered in database after successful upload
- [ ] Media list displays user's uploads with thumbnails
- [ ] Image can be inserted into story markdown (insert syntax)

**Files to create**:
```
/apps/web/src/components/MediaUploader.tsx
/apps/web/src/components/MediaGallery.tsx
/apps/web/src/lib/api/media.ts
```

---

#### Task 1.3.6: Production Deployment
**Owner**: DevOps-focused developer
**Effort**: 8 hours
**Deliverables**:
- Helm chart updates for simplified stack
- Environment-specific values (dev/staging/prod)
- RDS PostgreSQL provisioned
- S3 bucket created
- Google OAuth credentials configured
- HTTPS via ALB + ACM cert
- Deployed to production

**Helm Chart Structure**:
```yaml
# /infra/helm/mosaic-life/values.yaml
backend:
  image:
    repository: {ecr-repo}/mosaic-life/core-api
    tag: latest
  replicas: 2
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  env:
    ENV: production
    LOG_LEVEL: info
    # Database (RDS)
    DB_URL: postgresql+psycopg://mosaic:${DB_PASSWORD}@${RDS_ENDPOINT}/mosaic
    # Google OAuth
    GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
    GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
    # S3
    S3_MEDIA_BUCKET: mosaic-life-media-prod
    # Session
    SESSION_SECRET_KEY: ${SESSION_SECRET}  # From K8s secret
    APP_URL: https://app.mosaiclife.com
    API_URL: https://api.mosaiclife.com

frontend:
  image:
    repository: {ecr-repo}/mosaic-life/web
    tag: latest
  replicas: 2
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 200m
      memory: 256Mi

ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: ${ACM_CERT_ARN}
    alb.ingress.kubernetes.io/ssl-redirect: '443'
  hosts:
    - host: app.mosaiclife.com
      paths:
        - path: /api
          pathType: Prefix
          service: core-api
        - path: /auth
          pathType: Prefix
          service: core-api
        - path: /
          pathType: Prefix
          service: web
```

**RDS Setup** (Terraform or Console):
```hcl
# /infra/terraform/rds.tf (if using Terraform)
resource "aws_db_instance" "postgres" {
  identifier        = "mosaic-life-prod"
  engine            = "postgres"
  engine_version    = "16.1"
  instance_class    = "db.t3.small"
  allocated_storage = 20
  storage_encrypted = true

  db_name  = "mosaic"
  username = "mosaic"
  password = random_password.db_password.result

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  skip_final_snapshot = false
  final_snapshot_identifier = "mosaic-life-prod-final-${timestamp()}"
}
```

**Deployment Steps**:
1. Create RDS instance (db.t3.small)
2. Run Alembic migrations: `kubectl exec -it core-api-pod -- alembic upgrade head`
3. Create S3 bucket with versioning enabled
4. Configure Google OAuth (authorized redirect: `https://api.mosaiclife.com/auth/google/callback`)
5. Create K8s secrets for DB password, Google OAuth, session key
6. Update ArgoCD app to point to simplified Helm chart
7. Deploy backend + frontend
8. Verify HTTPS and OAuth flow

**Acceptance Criteria**:
- [ ] Production accessible at `https://app.mosaiclife.com`
- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] Google OAuth flow completes successfully
- [ ] Database migrations applied
- [ ] Backend health check passing (`/health`)
- [ ] Frontend loads and can authenticate
- [ ] S3 uploads working
- [ ] Monitoring: CloudWatch logs, basic metrics

**Files to create/modify**:
```
/infra/helm/mosaic-life/values.yaml
/infra/helm/mosaic-life/values-prod.yaml
/infra/terraform/rds.tf (if using Terraform)
/docs/ops/DEPLOYMENT-GUIDE.md
/docs/ops/RUNBOOK.md
```

---

## Phase 1 Success Criteria

**By end of Week 3, you should have**:

✅ **Deployed to Production**:
- [ ] Application accessible at public URL
- [ ] HTTPS working with valid cert
- [ ] Google OAuth login functional

✅ **Core Features Working**:
- [ ] Create legacy (you + brother can create one for your mother)
- [ ] Write stories (both of you can contribute)
- [ ] List stories chronologically
- [ ] Upload photos to stories
- [ ] Search for legacies by name
- [ ] Invite family members to join the legacy

✅ **Technical Quality**:
- [ ] Database migrations versioned and applied
- [ ] Backend unit tests passing (>70% coverage)
- [ ] Frontend E2E tests for critical flows
- [ ] Basic monitoring (logs, health checks)

✅ **Cost**:
- [ ] Monthly AWS bill <$350
- [ ] Cost breakdown documented

✅ **Documentation**:
- [ ] Simplified architecture document
- [ ] Deployment guide (how to deploy)
- [ ] Runbook (how to troubleshoot common issues)

---

## Phase 2: Polish & Enhancement (Weeks 4-6)

**Goal**: Improve UX, add missing features, optimize performance.

### Sprint 2.1 - Story Editor & Media (Week 4)

#### Task 2.1.1: TipTap Story Editor
**Owner**: Frontend developer
**Effort**: 12 hours
**Deliverables**:
- Replace textarea with TipTap rich editor
- Markdown sync (edit in rich text, save as markdown)
- Image insertion from media library
- Basic formatting toolbar (bold, italic, headings, lists)

**Implementation**:
```typescript
// /apps/web/src/components/TipTapEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { markdown } from 'tiptap-markdown';

export function TipTapEditor({
  initialContent,
  onChange
}: {
  initialContent: string;
  onChange: (markdown: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link,
      markdown
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    }
  });

  if (!editor) return null;

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Rich text editor with formatting toolbar
- [ ] Content synced to markdown on save
- [ ] Images insertable from media library
- [ ] Markdown preview toggle
- [ ] Autosave draft every 30 seconds (localStorage)

---

#### Task 2.1.2: Image Embedding in Stories
**Owner**: Frontend developer
**Effort**: 6 hours
**Deliverables**:
- Media picker modal in story editor
- Insert image markdown syntax: `![alt](https://cdn/.../image.jpg)`
- CloudFront CDN setup for media (optional, for performance)

**Acceptance Criteria**:
- [ ] Click "Insert Image" opens media library
- [ ] Select image inserts markdown syntax
- [ ] Images render in story view
- [ ] Images lazy-loaded for performance

---

#### Task 2.1.3: Story Versioning (Basic)
**Owner**: Backend developer
**Effort**: 8 hours
**Deliverables**:
- `story_versions` table
- Save version on each edit
- View version history (list only, no diff viewer yet)

**Schema**:
```sql
CREATE TABLE story_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID NOT NULL REFERENCES users(id),
  UNIQUE(story_id, version_number)
);
```

**Acceptance Criteria**:
- [ ] Version saved on each update
- [ ] Version list displayed in story detail
- [ ] Can view older version content (read-only)

---

### Sprint 2.2 - Permissions & Invites (Week 5)

#### Task 2.2.1: Legacy Member Management
**Owner**: Backend + Frontend
**Effort**: 10 hours
**Deliverables**:
- Legacy settings page
- List members with roles
- Remove member (creator only)
- Change member role (creator only)
- Pending join requests list with approve/deny

**Acceptance Criteria**:
- [ ] Creator can view all members and pending requests
- [ ] Approve button sends member invitation email (via SendGrid/SES)
- [ ] Deny button deletes pending membership
- [ ] Remove member deletes from `legacy_members`
- [ ] Change role updates member role

---

#### Task 2.2.2: Email Notifications
**Owner**: Backend developer
**Effort**: 6 hours
**Deliverables**:
- SendGrid or SES integration
- Email templates (plain text + HTML)
- Notifications:
  - Join request submitted (to legacy creator)
  - Join request approved (to requester)
  - New story posted (to legacy members, optional)

**Implementation**:
```python
# /services/core-api/app/notifications/email.py
import boto3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

ses_client = boto3.client('ses', region_name='us-east-1')

def send_join_request_notification(legacy_creator_email: str, requester_name: str, legacy_name: str):
    subject = f"{requester_name} requested to join {legacy_name}"
    body_text = f"{requester_name} has requested to join the legacy '{legacy_name}'.\n\nReview the request at: https://app.mosaiclife.com/app/legacies/{legacy_id}/settings"

    ses_client.send_email(
        Source='noreply@mosaiclife.com',
        Destination={'ToAddresses': [legacy_creator_email]},
        Message={
            'Subject': {'Data': subject},
            'Body': {'Text': {'Data': body_text}}
        }
    )
```

**Acceptance Criteria**:
- [ ] Emails sent on join request and approval
- [ ] Email templates are clear and actionable
- [ ] Unsubscribe link included (future: preferences)
- [ ] SES verified sender domain

---

#### Task 2.2.3: Story Permissions Refinement
**Owner**: Backend developer
**Effort**: 4 hours
**Deliverables**:
- Editor role can edit any story in legacy (not just own)
- Creator can delete any story
- Member can only read stories

**Acceptance Criteria**:
- [ ] Editor can edit all legacy stories
- [ ] Creator can delete any story
- [ ] Authorization checks updated and tested

---

### Sprint 2.3 - Search & Performance (Week 6)

#### Task 2.3.1: Postgres Full-Text Search (Optional)
**Owner**: Backend developer
**Effort**: 6 hours
**Deliverables**:
- Add `to_tsvector` column to stories
- Search endpoint: `GET /api/search?q=keyword`
- Search across story titles and content

**Implementation**:
```sql
-- Add tsvector column
ALTER TABLE stories ADD COLUMN search_vector tsvector;

-- Populate existing rows
UPDATE stories SET search_vector =
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''));

-- Trigger to auto-update
CREATE TRIGGER stories_search_vector_update
BEFORE INSERT OR UPDATE ON stories
FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', title, content);

-- Index for fast search
CREATE INDEX idx_stories_search ON stories USING gin(search_vector);
```

**Acceptance Criteria**:
- [ ] Search finds stories by title or content keywords
- [ ] Results ranked by relevance
- [ ] Search respects visibility (user sees only authorized stories)

---

#### Task 2.3.2: Frontend Performance Optimization
**Owner**: Frontend developer
**Effort**: 6 hours
**Deliverables**:
- Code splitting by route
- Lazy load images
- Optimize bundle size (<300KB gzip)
- Add loading skeletons

**Acceptance Criteria**:
- [ ] Initial bundle <300KB gzipped
- [ ] Lighthouse score >90 (performance)
- [ ] Images lazy-loaded
- [ ] Routes code-split

---

#### Task 2.3.3: Monitoring & Observability
**Owner**: DevOps-focused developer
**Effort**: 8 hours
**Deliverables**:
- Structured JSON logging (backend)
- CloudWatch dashboards (API latency, error rate, DB connections)
- Alerts: API error rate >5%, DB connections >80%
- Sentry or CloudWatch error tracking

**Acceptance Criteria**:
- [ ] Logs structured with request_id, user_id, endpoint
- [ ] Dashboard shows p50/p95/p99 latency
- [ ] Alerts fire on error spikes
- [ ] Error tracking captures stack traces

---

## Phase 2 Success Criteria

**By end of Week 6**:

✅ **Enhanced UX**:
- [ ] Rich text story editor (TipTap)
- [ ] Image embedding in stories
- [ ] Story version history

✅ **Permissions & Invites**:
- [ ] Member management UI
- [ ] Email notifications for join requests
- [ ] Role-based story editing

✅ **Performance**:
- [ ] Full-text search (optional)
- [ ] Frontend bundle optimized
- [ ] Monitoring dashboards

✅ **User Feedback**:
- [ ] At least 5 beta users actively testing
- [ ] Feedback collected and prioritized

---

## Phase 3: AI Features (Weeks 7-9) - OPTIONAL

**Goal**: Add simple AI chat to help users capture stories.

### Sprint 3.1 - AI Backend (Week 7)

#### Task 3.1.1: OpenAI/Anthropic Integration
**Owner**: Backend developer
**Effort**: 8 hours
**Deliverables**:
- Direct API integration (OpenAI or Anthropic SDK)
- `/api/chat/stream` endpoint (SSE)
- 3 agent personas (system prompts)
- Conversation storage in database

**Implementation**:
```python
# /services/core-api/app/ai/router.py
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openai import OpenAI
import json

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

AGENTS = {
    'interviewer': {
        'name': 'Memory Interviewer',
        'system_prompt': 'You are a compassionate interviewer helping someone remember and record stories about a loved one. Ask thoughtful, open-ended questions that encourage detailed memories. Be gentle and respectful.'
    },
    'editor': {
        'name': 'Story Editor',
        'system_prompt': 'You are a helpful writing assistant. Help the user refine their stories with better structure, grammar, and emotional resonance. Suggest improvements but preserve their voice.'
    },
    'companion': {
        'name': 'Grief Companion',
        'system_prompt': 'You are a supportive companion for someone processing grief. Listen actively, validate feelings, and gently encourage storytelling as a healing practice.'
    }
}

router = APIRouter(prefix='/api/chat', tags=['ai'])

@router.post('/stream')
async def stream_chat(
    data: ChatRequest,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    agent = AGENTS.get(data.agent_id, AGENTS['interviewer'])

    # Load conversation history
    messages = [{'role': 'system', 'content': agent['system_prompt']}]
    if data.conversation_id:
        history = db.query(ChatMessage).filter(
            ChatMessage.conversation_id == data.conversation_id
        ).order_by(ChatMessage.created_at).all()
        messages.extend([
            {'role': m.role, 'content': m.content} for m in history
        ])

    messages.append({'role': 'user', 'content': data.message})

    # Stream response
    async def generate():
        full_response = ""
        stream = client.chat.completions.create(
            model='gpt-4',
            messages=messages,
            stream=True
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"

        # Save to database
        conversation = get_or_create_conversation(db, user.id, data.conversation_id, agent['name'])
        save_chat_messages(db, conversation.id, [
            {'role': 'user', 'content': data.message},
            {'role': 'assistant', 'content': full_response}
        ])

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type='text/event-stream')
```

**Schema**:
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  agent_name TEXT NOT NULL,
  legacy_id UUID REFERENCES legacies(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Acceptance Criteria**:
- [ ] SSE streaming works (tokens arrive incrementally)
- [ ] Conversation persisted after stream completes
- [ ] 3 agent personas available
- [ ] Rate limiting: 100 messages/user/day

---

### Sprint 3.2 - AI Frontend (Week 8)

#### Task 3.2.1: Chat UI
**Owner**: Frontend developer
**Effort**: 10 hours
**Deliverables**:
- Chat interface with message bubbles
- Agent selector (3 personas)
- SSE streaming hook
- Conversation history

**Implementation**:
```typescript
// /apps/web/src/hooks/useStreamingChat.ts
import { useState, useEffect } from 'react';

export function useStreamingChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);

  const sendMessage = async (content: string, agentId: string, conversationId?: string) => {
    setStreaming(true);
    setMessages(prev => [...prev, { role: 'user', content }]);

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: content, agent_id: agentId, conversation_id: conversationId })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = '';

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.token) {
            assistantMessage += data.token;
            setMessages(prev => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg?.role === 'assistant') {
                lastMsg.content = assistantMessage;
              } else {
                updated.push({ role: 'assistant', content: assistantMessage });
              }
              return updated;
            });
          }
        }
      }
    }

    setStreaming(false);
  };

  return { messages, sendMessage, streaming };
}
```

**Acceptance Criteria**:
- [ ] Chat UI displays user/assistant messages
- [ ] Tokens stream in real-time
- [ ] Agent selector changes persona
- [ ] Conversation history loads on page refresh

---

### Sprint 3.3 - AI Polish (Week 9)

#### Task 3.3.1: Story Suggestions from Chat
**Owner**: Full-stack
**Effort**: 8 hours
**Deliverables**:
- "Save as Story" button in chat (converts conversation to story draft)
- Pre-fill story editor with AI-generated content

**Acceptance Criteria**:
- [ ] User can convert AI conversation to story draft
- [ ] Draft pre-fills title and content
- [ ] User can edit before saving

---

#### Task 3.3.2: AI Cost Monitoring
**Owner**: Backend developer
**Effort**: 4 hours
**Deliverables**:
- Log API costs per request
- Dashboard showing daily/monthly spend
- Budget alert (>$50/day)

**Acceptance Criteria**:
- [ ] Costs tracked in database or CloudWatch
- [ ] Dashboard shows spend trend
- [ ] Alert fires if budget exceeded

---

## Phase 3 Success Criteria

**By end of Week 9**:

✅ **AI Features**:
- [ ] 3 AI agent personas working
- [ ] Streaming chat functional
- [ ] Conversation saved and retrievable
- [ ] Story suggestions from chat

✅ **Cost Control**:
- [ ] AI costs monitored
- [ ] Budget alerts configured
- [ ] Monthly AI spend <$20 (at low usage)

---

## Cost Tracking

### Target Monthly Costs (Simplified Stack)

| Item | Dev | Staging | Prod | Notes |
|------|-----|---------|------|-------|
| **EKS Cluster** | $73 | $73 | $73 | Control plane |
| **Worker Nodes** | $15 (1x t3.small) | $30 (2x t3.small) | $60 (2x t3.medium) | |
| **RDS Postgres** | $15 (db.t3.micro) | $25 (db.t3.small) | $50 (db.t3.small) | |
| **S3** | $5 | $10 | $20 | Media storage |
| **ALB** | $25 | $25 | $25 | Load balancer |
| **NAT Gateway** | $32 | $32 | $32 | Single AZ |
| **Data Transfer** | $10 | $20 | $40 | Egress |
| **CloudWatch** | $5 | $10 | $15 | Logs + metrics |
| **ECR** | $2 | $3 | $5 | Image storage |
| **Route53** | $1 | $1 | $1 | DNS |
| **Secrets Manager** | $0 (K8s secrets) | $0 | $0 | |
| **OpenAI API** | $5 | $10 | $20 | AI features (optional) |
| **TOTAL** | **$188** | **$239** | **$341** | |

**Optimization Opportunities**:
- Use Fargate Spot for non-prod workloads → save $45/month
- Single NAT Gateway (no HA) → save $32/month
- RDS Reserved Instance (1-year) → save 30% on DB costs

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Google OAuth breaks** | Have fallback email/password auth planned |
| **S3 costs spike** | Set per-user storage limits (100MB free, then paid tier) |
| **AI costs explode** | Rate limit: 100 messages/user/day, monitor daily spend |
| **Database performance degrades** | Monitor slow queries, add indexes, upgrade RDS instance class |
| **Data loss** | RDS automated backups (7 days), test restore monthly |
| **Security breach** | Regular dependency updates, penetration test before launch |

---

## Testing Strategy

### Unit Tests (Backend)
- Target: >80% coverage
- Focus: Authorization logic, data validation, edge cases
- Run on every commit (GitHub Actions)

### Integration Tests (Backend)
- Test: API endpoints with real Postgres (test container)
- Scenarios: Create legacy → add member → write story → upload media
- Run on PR merge

### E2E Tests (Frontend)
- Tool: Playwright
- Scenarios:
  1. User signup → create legacy → write story
  2. Search legacy → join request → approval flow
  3. Upload image → embed in story → view
- Run on deploy to staging

### Manual Testing Checklist
- [ ] OAuth flow on mobile browser
- [ ] Image upload on slow connection
- [ ] Story visibility rules (public/private/personal)
- [ ] AI chat on different agents
- [ ] Accessibility (keyboard nav, screen reader)

---

## Documentation Deliverables

### For Developers
- [x] `/docs/project/PROJECT-ASSESSMENT.md` (this assessment)
- [ ] `/docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md`
- [ ] `/docs/architecture/DATA-MODEL-SIMPLIFIED.md`
- [ ] `/docs/developer/LOCAL-DEV-GUIDE.md`
- [ ] `/docs/developer/API-REFERENCE.md` (auto-generated from FastAPI)

### For Operations
- [ ] `/docs/ops/DEPLOYMENT-GUIDE.md`
- [ ] `/docs/ops/RUNBOOK.md` (troubleshooting common issues)
- [ ] `/docs/ops/BACKUP-RESTORE.md`
- [ ] `/docs/ops/COST-OPTIMIZATION.md`

### For Users (Future)
- [ ] User guide (how to create legacy, write stories)
- [ ] Privacy policy (data handling, retention)
- [ ] Terms of service

---

## Success Metrics

### Technical Metrics (Phase 1)
- [ ] <$350/month AWS cost
- [ ] <200ms p95 API latency
- [ ] >95% uptime
- [ ] Zero critical security vulnerabilities

### User Metrics (Phase 2)
- [ ] 10+ active users (family/friends)
- [ ] 50+ stories written
- [ ] 10+ legacies created
- [ ] >80% user satisfaction

### Business Metrics (Phase 3)
- [ ] 100+ registered users
- [ ] First paying customer (if monetized)
- [ ] Decision: Continue investment or pivot

---

## Next Actions (Week 1, Day 1)

1. **Review and approve this plan** (30 min)
2. **Create simplified architecture document** (4 hours)
3. **Simplify docker-compose.yml** (3 hours)
4. **Design and create database schema migration** (6 hours)
5. **Clean up dependencies** (2 hours)

**End of Day 1**: Local dev environment running with Postgres, simplified services, schema migrated.

---

## Appendix: Migration Path to Complex Features

### When to Add OpenSearch
**Trigger**: Users request semantic search or faceted search
**Effort**: 2-3 weeks
**Cost**: +$150/month
**Migration**:
1. Add OpenSearch cluster (managed or self-hosted)
2. Create indexing pipeline (background worker reads stories, indexes to OpenSearch)
3. Update search endpoint to query OpenSearch instead of Postgres
4. Add vector embeddings for semantic search (call OpenAI embeddings API)

### When to Add Neo4j
**Trigger**: Need complex relationship queries ("show all stories mentioning person X")
**Effort**: 6-8 weeks
**Cost**: +$120/month
**Migration**:
1. Deploy Neo4j cluster
2. Project data from Postgres to Neo4j (background job)
3. Add graph query endpoints
4. Update frontend to visualize relationships

### When to Split into Microservices
**Trigger**: Team grows to >3 developers, or media processing needs independent scaling
**Effort**: 4-6 weeks
**Cost**: +$100-200/month
**Migration**:
1. Extract Media Service first (independent scaling need)
2. Add SNS/SQS for events
3. Refactor Core API to publish events
4. Extract Search Indexer (consumes events, updates OpenSearch)
5. Extract Stories Service (if needed)

### When to Add Module Federation
**Trigger**: Third-party developers want to build plugins
**Effort**: 8-12 weeks
**Cost**: +$50/month (plugin hosting)
**Migration**:
1. Refactor frontend to use Module Federation
2. Create plugin SDK (TypeScript + Python)
3. Build plugin registry and approval flow
4. Deploy first plugin (proof of concept)

**Key Insight**: All these additions are **incremental** and **non-breaking** if you:
- Use adapter patterns (even in simplified stack)
- Keep business logic separate from persistence
- Write integration tests that survive refactoring

---

**End of Execution Plan**

This plan delivers a production-ready MVP in 3 weeks, with polish by Week 6, and optional AI features by Week 9. Cost stays under $350/month throughout. All complex features (OpenSearch, Neo4j, microservices, plugins) deferred until proven user demand.

**Ready to start? Let's build the Honda first. 🚗**
