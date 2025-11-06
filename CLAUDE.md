# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mosaic Life is a memorial stories platform that allows users to create, share, and preserve life stories and memories. The project uses a consolidated MVP architecture (Option B) that will evolve into a microservices architecture over time.

**Current Phase:** MVP development with consolidated Core API service
**Target:** Multi-service architecture with plugin extensibility

## Architecture

### Simplified MVP Architecture (Current - Active)

**See: [docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md](docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md)**

The MVP uses a **simplified stack** to enable rapid delivery:

- **Core API Service** (Python/FastAPI): Single consolidated backend with all business logic
- **Web App** (React/TypeScript/Vite): SPA with TanStack Query, Zustand, React Router
- **PostgreSQL**: Primary database for all data (users, legacies, stories, media references)
- **S3**: Media storage (images, videos)
- **Google OAuth**: User authentication (no Cognito)

**What we're NOT using (deferred to future phases)**:
- ❌ OpenSearch / Elasticsearch (using Postgres search)
- ❌ Neo4j graph database (using Postgres foreign keys)
- ❌ SNS/SQS event bus (direct database writes)
- ❌ LiteLLM proxy (direct OpenAI/Anthropic calls in Phase 3)
- ❌ Module Federation plugins (deferred)
- ❌ Microservices decomposition (single service)

### Target Architecture (Future - Archived)

Complex features documented in [docs/architecture/target/](docs/architecture/target/) will be added only when:
- Users explicitly request the capability
- Simple approach fails at scale
- Cost/benefit analysis justifies the complexity

**Migration path**: See MVP-SIMPLIFIED-ARCHITECTURE.md for when and how to add OpenSearch, Neo4j, microservices, etc.

### Key Architectural Decisions

1. **PostgreSQL for everything** - Search, relationships, all data (no distributed systems)
2. **Google OAuth** - Simpler and free vs Cognito
3. **Single-tenant** design; multi-tenancy deferred
4. **Vite + React Router** for web app (Next.js only for future marketing site)
5. **Direct API calls** - No proxies, no message queues (simplicity over theoretical scalability)
6. **Separate backend/frontend** - Independent deployment and scaling
7. **Helm deployments** to existing EKS cluster

## Common Development Commands

### Full Stack Development

```bash
# Start all services with Docker Compose
docker compose -f infra/compose/docker-compose.yml up -d

# View logs
docker compose logs -f core-api
docker compose logs -f web

# Reset everything
docker compose down
docker volume prune -f
docker compose up -d
```

### Frontend Development

```bash
cd apps/web

# Install dependencies
npm install

# Start dev server (runs on http://localhost:5173)
npm run dev

# Run tests
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)

# Build
npm run build

# Lint
npm run lint
```

### Backend Development

```bash
cd services/core-api

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or venv\Scripts\activate  # Windows

# Install dependencies
pip install -e .

# Run migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Start dev server (runs on http://localhost:8080)
python -m app.main

# Run tests
pytest

# Run with specific log level
LOG_LEVEL=debug python -m app.main
```

### Database Operations

```bash
# Connect to local PostgreSQL
docker exec -it <postgres-container> psql -U postgres -d core

# Connection details (local):
# Host: localhost, Port: 15432
# Database: core, User: postgres, Password: postgres
```

## Important Documentation

Read these documents in order of precedence when guidance conflicts:

1. **AGENTS.md** - Engineering assistant playbook and operating principles
2. **docs/project/PROJECT-ASSESSMENT.md** - Why we simplified the architecture
3. **docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md** - Current active architecture (READ THIS)
4. **docs/project/MVP-SIMPLIFIED-EXECUTION-PLAN.md** - 9-week implementation plan
5. **docs/developer/CODING-STANDARDS.md** - Style, testing, libraries, security
6. **docs/developer/LOCAL.md** - Local development setup
7. **docs/architecture/target/** - Future complex architecture (archived, not active)

## Technology Stack

### Frontend
- **Framework:** React 18 + TypeScript (strict mode)
- **Build:** Vite (fast dev server, HMR)
- **Routing:** React Router
- **State:** TanStack Query (server state) + Zustand (UI state)
- **Editor:** TipTap (ProseMirror-based) with Markdown sync
- **Validation:** zod
- **Testing:** Vitest, React Testing Library, Playwright
- **Package Manager:** pnpm

### Backend
- **Framework:** FastAPI + Uvicorn
- **Validation:** Pydantic v2
- **Database:** SQLAlchemy 2.x + Alembic (PostgreSQL)
- **Search:** OpenSearch Python client
- **Messaging:** boto3 (SNS/SQS), aioboto3 for async
- **HTTP Client:** httpx with tenacity for retries
- **Testing:** pytest, pytest-asyncio, schemathesis
- **Package Manager:** uv (preferred) or pip

### Infrastructure
- **Container Registry:** ECR
- **Charts:** Helm (OCI format)
- **Deployment:** Kubernetes via ArgoCD GitOps
- **CI/CD:** GitHub Actions
- **Observability:** OpenTelemetry + Jaeger, Prometheus metrics, structured JSON logs

## Development Workflow

### Before Writing Code

For non-trivial changes, use the planning template from AGENTS.md:

1. **Propose 1-3 approaches** with pros/cons, risks, and exact files to touch
2. **Wait for approval** before implementing
3. **Use TodoWrite tool** to track progress on multi-step tasks

### Code Standards

- **TypeScript:** Strict types, no `any`, ESLint + Prettier
- **Python:** Type hints, Black formatting, Ruff linting, MyPy strict checks
- **Commits:** Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`)
- **PRs:** Target < 400 LOC, squash-merge, link to GitHub Issue
- **Testing:** ≥80% coverage, tests required for all new features

### Security Requirements

- Never commit secrets (use AWS Secrets Manager + External Secrets)
- Sanitize all user content with DOMPurify/rehype-sanitize
- Validate inputs: zod (frontend), Pydantic (backend)
- Use httpOnly cookies for auth (no localStorage for tokens)
- Enforce strict CSP with explicit plugin origins
- No `dangerouslySetInnerHTML` except in sanctioned sanitized renderer

### Observability Standards

- **Traces:** OpenTelemetry spans for major operations (`story.create`, `story.update`, `media.upload`, `search.query`, `ai.stream`)
- **Metrics:** Prometheus format with labels: `service`, `component`, `version`
- **Logs:** Structured JSON with fields: `ts`, `level`, `service`, `component`, `version`, `request_id`, `user_id`, `path`, `status`, `latency_ms`

## Plugin Development (Future)

Plugins are currently deferred to post-MVP. The target architecture supports:

- **Backend:** Python microservice with FastAPI, `/manifest`, `/healthz`, `/readyz` endpoints
- **Frontend:** Module Federation remote exposing React components
- **Deployment:** Helm chart with NetworkPolicy, RBAC, probes
- **Registration:** Self-registration handshake with core or static config
- **Capabilities:** Least-privilege permissions declared in `plugin.yaml`

See `docs/architecture/PLUGIN-ARCHITECTURE.md` for complete specifications.

## Key Patterns and Conventions

### Authentication (Current MVP)

Basic session-based auth with plans to evolve to:

- **OIDC via BFF pattern** with Authorization Code + PKCE
- **httpOnly cookies** (SameSite=Lax)
- **CSRF protection** via Origin checks + double-submit token
- `/me` endpoint for session state

### Event-Driven Architecture

All domain events use the standard envelope:

```json
{
  "id": "ulid",
  "type": "StoryCreated|StoryUpdated|...",
  "version": 1,
  "occurred_at": "RFC3339",
  "tenant_id": "...",
  "actor_id": "user|service|plugin",
  "resource": { "kind": "Story", "id": "..." },
  "correlation_id": "trace/span id",
  "payload": { /* type-specific */ }
}
```

- Use **Transactional Outbox** pattern in Postgres
- Publish to SNS with idempotency keys
- Consumers read from SQS and process idempotently

### Search Implementation

OpenSearch indexes with tenant isolation:

- **stories-v1:** tenant_id, legacy_id, title, body, tags, timestamps, ACL
- **Hybrid search ready:** keyword + k-NN vectors for future RAG
- **Indexer pattern:** MVP indexes on write; will extract to event-driven consumer

### API Design

- **External (BFF):** REST for CRUD with optional GraphQL later
- **Internal:** REST/HTTP for service-to-service
- **Pagination:** Cursor-based
- **Errors:** Consistent error envelope with type/detail/trace_id
- **Caching:** ETag/If-None-Match support

## File Structure

```
/
├── apps/
│   └── web/              # React + Vite frontend
│       ├── src/
│       │   ├── app/      # App shell, routes
│       │   ├── components/ # Shared UI components
│       │   ├── features/ # Feature modules (editor, ai-chat, media, search)
│       │   ├── lib/      # Utilities (http client, sanitizer, otel)
│       │   └── api/      # Generated API clients (future)
│       └── package.json
├── services/
│   └── core-api/         # FastAPI backend (MVP consolidated service)
│       ├── app/
│       │   ├── adapters/ # SearchAdapter, AIAdapter, EventPublisher
│       │   ├── models/   # SQLAlchemy models
│       │   ├── routes/   # API endpoints
│       │   └── main.py
│       ├── alembic/      # Database migrations
│       └── pyproject.toml
├── infra/
│   ├── helm/             # Helm charts per service
│   ├── compose/          # docker-compose.yml for local dev
│   └── cdk/              # AWS CDK infrastructure (future)
├── packages/
│   └── shared-types/     # Shared TypeScript types
├── docs/
│   ├── architecture/     # Architecture documentation
│   ├── developer/        # Developer guides
│   ├── adr/              # Architecture Decision Records
│   └── project/          # Project planning documents
├── AGENTS.md             # Engineering assistant playbook
└── CLAUDE.md             # This file
```

## Local Environment

**Services and Ports:**
- Frontend (dev): http://localhost:5173
- Frontend (prod build): http://localhost:3001
- Backend API: http://localhost:8080
- PostgreSQL: localhost:15432
- OpenSearch: http://localhost:9200
- Localstack (AWS): http://localhost:4566
- Jaeger UI: http://localhost:16686

**Default Credentials:**
- PostgreSQL: postgres/postgres (database: core)
- OpenSearch: No auth (security disabled for local dev)

## Common Issues

### Port Conflicts
Modify port mappings in `infra/compose/docker-compose.yml` if ports are already in use.

### Database Connection Issues
```bash
docker compose down
docker volume prune
docker compose up -d postgres
```

### OpenSearch Memory Issues
Increase Docker memory to 4GB+ or adjust heap settings in docker-compose.yml.

### Migration Conflicts
```bash
# Rollback one migration
alembic downgrade -1

# Reset to base
alembic downgrade base

# Re-apply
alembic upgrade head
```

## Notes for AI Assistants

When working with this codebase:

1. **Always check AGENTS.md** for approval requirements and planning templates
2. **Follow adapter patterns** even in MVP - this enables future service extraction
3. **Use OpenSearch** (not Elasticsearch) - this is a key architectural anchor
4. **Prefer SSE for streaming** - WebSockets are deferred
5. **Design for single-tenant** but keep APIs forward-compatible with tenant_id
6. **Emit OTel spans** for all significant operations
7. **Never commit secrets** - use AWS Secrets Manager references
8. **Sanitize user content** before rendering
9. **Use TodoWrite** for multi-step tasks
10. **Target < 400 LOC per PR** - split larger changes

## Additional Resources

- **Project Vision:** docs/project/VISION.md
- **MVP Execution Plan:** docs/project/MVP-EXECUTION-PLAN.md
- **API Design:** docs/architecture/API-DESIGN.md
- **Data Design:** docs/architecture/DATA-DESIGN.md
- **GitHub Project:** https://github.com/orgs/mosaic-stories/projects/1
- **Repository:** https://github.com/mosaic-stories/mosaic-life
