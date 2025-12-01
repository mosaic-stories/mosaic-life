# GitHub Copilot Agent Instructions

This file provides instructions for GitHub Copilot and other AI agents working with this repository.

## Quick Reference

- **Official Instructions:** See [CLAUDE.md](../../CLAUDE.md) in the repository root
- **Engineering Playbook:** See [AGENTS.md](../../AGENTS.md) in the repository root
- **Architecture:** [docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md](../../docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md)
- **Coding Standards:** [docs/developer/CODING-STANDARDS.md](../../docs/developer/CODING-STANDARDS.md)

## Core Principles

1. **Plan before implementing** - For non-trivial tasks, propose 1-3 approaches with pros/cons
2. **Follow MVP architecture** - We're building a simplified stack (see MVP-SIMPLIFIED-ARCHITECTURE.md)
3. **Security first** - Never commit secrets, sanitize user content, validate all inputs
4. **Use correct tools** - `docker compose` (not standalone docker), `uv` (not pip)
5. **Make it observable** - Add OTel spans, metrics, and structured logs

## Current Architecture (MVP)

### What We're Building
- **Core API Service** (Python/FastAPI): Single consolidated backend
- **Web App** (React/TypeScript/Vite): SPA with TanStack Query, Zustand, React Router
- **PostgreSQL**: All data (users, legacies, stories, media references)
- **S3**: Media storage
- **Google OAuth**: Authentication

### What's Deferred (Post-MVP)
- ❌ OpenSearch / Elasticsearch
- ❌ Neo4j graph database
- ❌ SNS/SQS event bus
- ❌ LiteLLM proxy
- ❌ Module Federation plugins
- ❌ Microservices decomposition

## Critical Operational Rules

### Local Development: Docker Compose Only

```bash
# ✅ CORRECT
docker compose -f infra/compose/docker-compose.yml up -d
docker compose exec core-api bash
docker compose logs -f core-api

# ❌ WRONG - Never use standalone docker
docker exec -it <container> ...
docker run ...
```

### Python: Always Use uv

```bash
# ✅ CORRECT
uv run python -m app.main
uv run pytest
uv run alembic upgrade head
uv sync

# REQUIRED VALIDATION (run before committing)
just validate-backend    # Runs both ruff + mypy
just lint-backend        # Ruff linting only
just typecheck-backend   # MyPy type checking only

# ❌ WRONG - Never use pip or raw python
pip install ...
python -m pytest
```

### Production: GitOps Only

All production changes must:
1. Be committed to the repository
2. Pass GitHub Actions validation
3. Be deployed automatically via ArgoCD

Never make manual changes with kubectl/helm in production.

### Validation: Always Required

Before completing any backend work:
```bash
just validate-backend    # Required - runs ruff + mypy
just validate-frontend   # For frontend changes
just validate-all        # For full-stack changes
```

## Development Commands

### Full Stack
```bash
# Start all services
docker compose -f infra/compose/docker-compose.yml up -d

# View logs
docker compose -f infra/compose/docker-compose.yml logs -f core-api

# Reset everything
docker compose -f infra/compose/docker-compose.yml down
docker volume prune -f
docker compose -f infra/compose/docker-compose.yml up -d
```

### Frontend (apps/web)
```bash
npm install
npm run dev          # Start dev server (localhost:5173)
npm run test         # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
npm run build
npm run lint
```

### Backend (services/core-api)
```bash
uv sync                                    # Install dependencies
uv run alembic upgrade head                # Run migrations
uv run alembic revision --autogenerate -m "description"  # New migration
uv run python -m app.main                  # Start server (localhost:8080)
uv run pytest                              # Run tests

# REQUIRED VALIDATION (run before committing)
just validate-backend                      # Runs both ruff + mypy
just lint-backend                          # Ruff linting only
just typecheck-backend                     # MyPy type checking only
just lint-fix-backend                      # Auto-fix ruff issues
```

### Database
```bash
# Connect to PostgreSQL
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core

# Run SQL file
docker compose -f infra/compose/docker-compose.yml exec -T postgres psql -U postgres -d core < script.sql

# Backup
docker compose -f infra/compose/docker-compose.yml exec postgres pg_dump -U postgres core > backup.sql
```

## Technology Stack

### Frontend
- React 18 + TypeScript (strict mode)
- Vite (build tool)
- React Router (routing)
- TanStack Query (server state)
- Zustand (UI state)
- TipTap (rich text editor)
- zod (validation)
- Vitest + React Testing Library + Playwright (testing)
- pnpm (package manager)

### Backend
- FastAPI + Uvicorn
- Pydantic v2 (validation)
- SQLAlchemy 2.x + Alembic (ORM + migrations)
- PostgreSQL (database)
- httpx (HTTP client)
- pytest + pytest-asyncio (testing)
- uv (package manager - required)

### Infrastructure
- Kubernetes (EKS)
- Helm (OCI charts)
- ArgoCD (GitOps)
- GitHub Actions (CI/CD)
- OpenTelemetry (observability)

## Code Standards

### Commits
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`
- Keep PRs < 400 LOC
- Squash-merge to main
- Link to GitHub Issue

### TypeScript
- Strict mode enabled
- No `any` types
- ESLint + Prettier formatting
- ≥80% test coverage

### Python
- Type hints required
- Black formatting
- Ruff linting
- MyPy strict checks
- ≥80% test coverage
- **REQUIRED: Run `just validate-backend` before committing any backend changes**

### Security
- Never commit secrets (use AWS Secrets Manager)
- Sanitize all user content
- Validate inputs: zod (frontend), Pydantic (backend)
- Use httpOnly cookies for auth
- Enforce strict CSP

### Observability
- OpenTelemetry spans for major operations
- Prometheus metrics with standard labels
- Structured JSON logs with: `ts`, `level`, `service`, `component`, `version`, `request_id`, `user_id`, `path`, `status`, `latency_ms`

## When to Ask for Approval

**Ask first** for:
- Schema or API contract changes
- New dependencies or tooling changes
- Auth/session flow modifications
- Cross-cutting concerns (observability, security)

**Proceed without asking** for:
- Internal refactors (no external behavior change)
- Test additions or fixes
- Documentation updates
- CI workflow fixes

**Always before completing backend work:**
- Run `just validate-backend` to ensure code passes ruff and mypy checks

## Planning Template

For complex tasks, use this template before implementing:

```
**Title:** <short description>

**Goal & Success Criteria**
* What user impact or system behavior will change?

**Constraints & Inputs**
* Dependencies, performance budgets, security rules

**Approach Options (1–3)**
1. **Option A:** <summary>
   * Pros: <list>
   * Cons/Risks: <list>
   * Touched files: <paths>

**Telemetry & Tests**
* OTel spans/metrics, log fields
* Unit + integration + E2E notes

**Migration/Backout**
* Data migrations, feature flags, rollback steps

**Request for Approval:** Select Option A/B/C
```

## Common Issues

### Port Conflicts
Modify port mappings in `infra/compose/docker-compose.yml`

### Database Connection Issues
```bash
docker compose -f infra/compose/docker-compose.yml down
docker volume prune
docker compose -f infra/compose/docker-compose.yml up -d postgres
```

### Migration Conflicts
```bash
cd services/core-api
uv run alembic downgrade -1    # Rollback one
uv run alembic downgrade base  # Reset to base
uv run alembic upgrade head    # Re-apply
```

## Production URLs

- **Web Application:** https://mosaiclife.me
- **Core API:** https://api.mosaiclife.me (also https://mosaiclife.me/api/)

## Infrastructure Repositories

- **Core infrastructure** (EKS, Karpenter, Route53, IAM): https://github.com/mosaic-stories/infrastructure
- **Application deployment** (Helm, CDK): This repository under `infra/`

## Project Management

- **GitHub Project:** https://github.com/orgs/mosaic-stories/projects/1
- **Repository:** https://github.com/mosaic-stories/mosaic-life
- **Owners:** @hewjoe and @drunkie-tech

## Additional Resources

Read in this order when guidance conflicts:
1. CLAUDE.md - Official agent instructions
2. AGENTS.md - Engineering playbook
3. docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md - Current architecture
4. docs/developer/CODING-STANDARDS.md - Code standards
5. docs/project/MVP-SIMPLIFIED-EXECUTION-PLAN.md - Implementation plan
6. docs/developer/LOCAL.md - Local development setup
