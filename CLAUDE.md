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
- **Neptune** (graph database): Social network relationships and story-extracted entity connections
- **Google OAuth**: User authentication (no Cognito)

**What we're NOT using (deferred to future phases)**:
- ❌ OpenSearch / Elasticsearch (using Postgres search)
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

## Operational Guidelines

### Local Development: Docker Compose Only

**CRITICAL:** Always use `docker compose` for local development. Never use standalone `docker` CLI commands without compose context.

```bash
# ✅ CORRECT - Use docker compose
docker compose -f infra/compose/docker-compose.yml up -d
docker compose exec core-api bash
docker compose exec postgres psql -U postgres -d core
docker compose logs -f core-api

# ❌ WRONG - Never use standalone docker commands
docker exec -it <container> ...
docker run ...
docker build ...
```

### Python: Always Use uv

**CRITICAL:** All Python operations must use `uv` to ensure consistent environment, dependencies, and configuration.

```bash
# ✅ CORRECT - Use uv for all Python operations
uv run python -m app.main
uv run pytest
uv run alembic upgrade head
uv sync  # Install dependencies

# ❌ WRONG - Never use pip or raw python directly
pip install ...
python -m pytest
python -m app.main
```

### Production Deployment

Production changes flow through GitOps:

1. **All changes must be committed to the repository** - No manual kubectl/helm changes in production
2. **GitHub Actions validates** - Build must pass, tests must succeed
3. **ArgoCD reconciles automatically** - Picks up changes after successful CI

**Allowed production tools** (for inspection/debugging only, not configuration):
- `argocd` - View sync status, trigger manual syncs
- `kubectl` - Inspect resources, view logs
- `helm` - Template validation, dry-runs
- `aws` - Check AWS resources
- `gh` - GitHub operations
- `git` - Version control

### Infrastructure References

- **Core infrastructure** (EKS, Karpenter, external-secrets, Route53, IAM): https://github.com/mosaic-stories/infrastructure (local: `/apps/mosaic-life-infrastructure`)
- **Application deployment** (Helm charts, CDK): Managed in this repository under `infra/`

### Production URLs

- **Web Application:** https://mosaiclife.me
- **Core API:** https://api.mosaiclife.me (also https://mosaiclife.me/api/)

## Common Development Commands

### Full Stack Development

```bash
# Start all services with Docker Compose
docker compose -f infra/compose/docker-compose.yml up -d

# View logs
docker compose -f infra/compose/docker-compose.yml logs -f core-api
docker compose -f infra/compose/docker-compose.yml logs -f web

# Reset everything
docker compose -f infra/compose/docker-compose.yml down
docker volume prune -f
docker compose -f infra/compose/docker-compose.yml up -d
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

# Install dependencies (uv manages the virtual environment automatically)
uv sync

# Run migrations
uv run alembic upgrade head

# Create new migration
uv run alembic revision --autogenerate -m "description"

# Start dev server (runs on http://localhost:8080)
uv run python -m app.main

# Run tests
uv run pytest

# Run with specific log level
LOG_LEVEL=debug uv run python -m app.main

# REQUIRED VALIDATION (run before committing)
just validate-backend    # Runs both ruff + mypy

# Or run individually:
just lint-backend        # Ruff linting
just format-backend      # Ruff format checking
just typecheck-backend   # MyPy type checking
just lint-fix-backend    # Auto-fix ruff issues + format code
```

### Database Operations

```bash
# Connect to local PostgreSQL (via docker compose)
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core

# Run SQL file
docker compose -f infra/compose/docker-compose.yml exec -T postgres psql -U postgres -d core < script.sql

# Backup database
docker compose -f infra/compose/docker-compose.yml exec postgres pg_dump -U postgres core > backup.sql

# Connection details (local):
# Host: localhost, Port: 15432
# Database: core, User: postgres, Password: postgres
```

### Graph Database (Neptune/TinkerPop)

```bash
# Start the local graph database
docker compose -f infra/compose/docker-compose.yml up -d neptune-local

# Test connectivity
curl http://localhost:18182

# Submit a Gremlin query
curl -X POST http://localhost:18182/gremlin -d '{"gremlin": "g.V().count()"}'
```

### Documentation Development

```bash
cd apps/docs

# Install dependencies
uv sync
npm install

# Serve docs locally with hot reload (runs on http://localhost:8000)
uv run mkdocs serve

# Build documentation (includes OpenAPI and TypeDoc generation)
bash scripts/build.sh

# Generate OpenAPI spec only
bash scripts/generate-openapi.sh

# Generate TypeDoc only
bash scripts/generate-typedoc.sh
```

Or use just commands:

```bash
just docs-serve           # Serve locally
just docs-build           # Full build
just docs-generate-openapi # Generate OpenAPI spec
just docs-generate-typedoc # Generate TypeDoc
just docs-docker-build    # Build Docker image
just docs-docker-up       # Run in Docker
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
- **Package Manager:** uv (required - never use pip directly)

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
- **Validation Required:** ALL backend changes must pass `just validate-backend` before committing
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
│   ├── web/              # React + Vite frontend
│   │   ├── src/
│   │   │   ├── app/      # App shell, routes
│   │   │   ├── components/ # Shared UI components
│   │   │   ├── features/ # Feature modules (editor, ai-chat, media, search)
│   │   │   ├── lib/      # Utilities (http client, sanitizer, otel)
│   │   │   └── api/      # Generated API clients (future)
│   │   └── package.json
│   └── docs/             # MkDocs documentation site
│       ├── docs/         # Markdown content
│       ├── scripts/      # Build scripts (generate-openapi.sh, generate-typedoc.sh, build.sh)
│       ├── mkdocs.yml    # MkDocs configuration
│       ├── pyproject.toml # Python dependencies (mkdocs, mkdocs-material)
│       ├── package.json  # Node dependencies (typedoc)
│       └── Dockerfile    # Multi-stage Docker build
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
- Documentation: http://localhost:8000 (via docker compose --profile docs)
- PostgreSQL: localhost:15432
- OpenSearch: http://localhost:9200
- Localstack (AWS): http://localhost:4566
- Jaeger UI: http://localhost:16686
- Neptune (TinkerPop): http://localhost:18182

**Default Credentials:**
- PostgreSQL: postgres/postgres (database: core)
- OpenSearch: No auth (security disabled for local dev)

## Common Issues

### Port Conflicts
Modify port mappings in `infra/compose/docker-compose.yml` if ports are already in use.

### Database Connection Issues
```bash
docker compose -f infra/compose/docker-compose.yml down
docker volume prune
docker compose -f infra/compose/docker-compose.yml up -d postgres
```

### OpenSearch Memory Issues
Increase Docker memory to 4GB+ or adjust heap settings in docker-compose.yml.

### Migration Conflicts
```bash
cd services/core-api

# Rollback one migration
uv run alembic downgrade -1

# Reset to base
uv run alembic downgrade base

# Re-apply
uv run alembic upgrade head
```

## Notes for AI Assistants

When working with this codebase:

### Critical Operational Rules

1. **Docker Compose only** - Never use standalone `docker` CLI. Always use `docker compose -f infra/compose/docker-compose.yml ...`
2. **uv for Python** - Never use `pip`, `python`, or `venv` directly. Always use `uv run ...` or `uv sync`
3. **Validate all backend changes** - Run `just validate-backend` before completing any backend task. All code must pass ruff and mypy checks.
4. **GitOps for production** - All production changes must be committed to repo. Never make manual changes via kubectl/helm

### Architecture Guidelines

5. **Always check AGENTS.md** for approval requirements and planning templates
6. **Follow adapter patterns** even in MVP - this enables future service extraction
7. **Use OpenSearch** (not Elasticsearch) - this is a key architectural anchor
8. **Prefer SSE for streaming** - WebSockets are deferred
9. **Design for single-tenant** but keep APIs forward-compatible with tenant_id
10. **Emit OTel spans** for all significant operations

### Security & Quality

11. **Never commit secrets** - use AWS Secrets Manager references
12. **Sanitize user content** before rendering
13. **Validate before completing** - Run `just validate-backend` (or `just validate-all`) as final step
14. **Use TodoWrite** for multi-step tasks
15. **Target < 400 LOC per PR** - split larger changes

### Infrastructure Context

- **Core infrastructure repo:** `/apps/mosaic-life-infrastructure` (EKS, Karpenter, external-secrets, Route53, IAM)
- **Application infra:** Managed in this repo under `infra/` (Helm charts, CDK)
- **Production URLs:** https://mosaiclife.me (web), https://api.mosaiclife.me (API)

## Additional Resources

- **Project Vision:** docs/project/VISION.md
- **MVP Execution Plan:** docs/project/MVP-EXECUTION-PLAN.md
- **API Design:** docs/architecture/API-DESIGN.md
- **Data Design:** docs/architecture/DATA-DESIGN.md
- **GitHub Project:** https://github.com/orgs/mosaic-stories/projects/1
- **Repository:** https://github.com/mosaic-stories/mosaic-life
