# AGENT: Engineering Assistant Playbook

This repository uses an AI coding assistant to accelerate delivery while preserving quality and security. This document defines **how the assistant should work**, where to find the **authoritative architecture docs**, and the **approval workflow** for complex tasks.

> **Current Architecture:** Simplified MVP (Option B)
>
> **Active Documentation:**
>
> * `/docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md` - Current active architecture
> * `/docs/project/MVP-SIMPLIFIED-EXECUTION-PLAN.md` - 9-week implementation plan
> * `/docs/developer/CODING-STANDARDS.md` - Style, testing, libraries, security
> * `/docs/developer/LOCAL.md` - Local development setup
>
> **Future Architecture (Archived):**
>
> * `/docs/architecture/target/` - Complex features deferred to post-MVP

---

## 1) Operating Principles

1. **Plan first.** For any non-trivial task, propose **1–3 approaches** with pros/cons, risks, and the exact files to touch. Wait for human approval before coding.
2. **Follow the docs.** Implementations must conform to MVP-SIMPLIFIED-ARCHITECTURE.md and CODING-STANDARDS.md. If conflicts arise, use the precedence order in §2.
3. **Security and privacy first.** Never introduce insecure patterns (no plaintext secrets, unsafe HTML, eval, etc.).
4. **Keep changes small and testable.** Prefer incremental PRs with clear tests and telemetry.
5. **Make it observable.** Add OTel spans/metrics/logs for meaningful actions.
6. **Use correct tools.** Always use `docker compose` (not standalone `docker`) and `uv` (not `pip`) for Python operations.
7. **Validate all changes.** Run `just validate-backend` before completing any backend work. All code must pass ruff and mypy checks.

---

## 2) Source of Truth & Precedence

When guidance conflicts, apply this precedence (highest first):

1. **CLAUDE.md** - Official instructions for how agents should behave
2. **AGENTS.md** (this file) - Engineering assistant playbook
3. **MVP-SIMPLIFIED-ARCHITECTURE.md** - Current active architecture
4. **CODING-STANDARDS.md** - Code style and standards
5. **MVP-SIMPLIFIED-EXECUTION-PLAN.md** - Implementation roadmap

If a document is missing or outdated, prefer newer decisions captured in CLAUDE.md and open an issue to reconcile.

---

## 3) Current MVP Architecture (Simplified - Active)

**The MVP uses a simplified stack to enable rapid delivery:**

### What We're Building

- **Core API Service** (Python/FastAPI): Single consolidated backend with all business logic
- **Web App** (React/TypeScript/Vite): SPA with TanStack Query, Zustand, React Router
- **PostgreSQL**: Primary database for all data (users, legacies, stories, media references)
- **S3**: Media storage (images, videos)
- **Google OAuth**: User authentication (no Cognito for MVP)

### What We're NOT Using (Deferred)

- ❌ OpenSearch / Elasticsearch (using Postgres search)
- ❌ Neo4j graph database (using Postgres foreign keys)
- ❌ SNS/SQS event bus (direct database writes)
- ❌ LiteLLM proxy (direct OpenAI/Anthropic calls in Phase 3)
- ❌ Module Federation plugins (deferred)
- ❌ Microservices decomposition (single service)

**Migration path:** See MVP-SIMPLIFIED-ARCHITECTURE.md for when and how to add OpenSearch, Neo4j, microservices, etc.

---

## 4) Critical Operational Rules

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

# REQUIRED: Validate before completing
just validate-backend    # Runs ruff + mypy
just lint-backend        # Ruff linting only
just format-backend      # Ruff format checking only
just typecheck-backend   # MyPy only
just lint-fix-backend    # Auto-fix ruff issues + format code

# ❌ WRONG - Never use pip or raw python directly
pip install ...
python -m pytest
python -m app.main
```

### Production Deployment: GitOps Only

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

---

## 5) Planning Template (use before coding)

For any **complex task** (new API, schema change, feature slice, infra change), respond with the following plan in the PR or issue comment **before** generating code:

**Title:** <short description>

**Goal & Success Criteria**

* What user impact or system behavior will change?

**Constraints & Inputs**

* Dependencies (APIs, schemas, tokens), performance budgets, security rules.

**Approach Options (1–3)**

1. **Option A:** <summary>

   * *Pros:* <list>
   * *Cons/Risks:* <list>
   * *Touched files:* <paths>
2. **Option B:** …
3. **Option C:** …

**Telemetry & Tests**

* OTel spans/metrics, log fields.
* Unit + integration + E2E notes.

**Migration/Backout**

* Data migrations, feature flags, rollback steps.

**Request for Approval:** *Select Option A/B/C*.

> Do not start implementing until a human selects the option.

---

## 6) Implementation Rules (must follow)

* **Languages & frameworks** per CODING-STANDARDS.md:

  * Frontend: React + TS + **Vite**, **React Router**, **TanStack Query**, **Zustand**, **TipTap** editor; **SSE** for streaming.
  * Backend: **FastAPI**, Pydantic v2, Postgres (SQLAlchemy/Alembic). MVP uses direct OpenAI/Anthropic calls; future phases may add OpenSearch, Neo4j, SNS/SQS, LiteLLM proxy.
* **Auth:** Google OAuth for MVP; future OIDC via AWS Cognito with BFF-managed httpOnly cookies.
* **Plugins:** Deferred to post-MVP. Future: UI via **Module Federation** (Pattern A); backend plugins deploy via **Helm-only** (Pattern 1).
* **Search:** Postgres full-text search for MVP. Future: **OpenSearch** with k-NN vectors for hybrid search.
* **Tenancy:** Single-tenant by default. Do not add tenant selectors in UI. Keep APIs forward-compatible with a future `tenant_id` parameter.

---

## 7) Security & Compliance (always)

* Never commit secrets. Use AWS Secrets Manager + External Secrets (see docs/ops/SHARED-SERVICES.md if available).
* Sanitize all user-rendered content (Markdown/HTML) using the shared sanitizer.
* Enforce CSP and only allow declared plugin origins.
* Validate inputs with zod (frontend) and Pydantic (backend). Use least-privileged IAM roles via IRSA.

---

## 8) Observability & Quality Gates

* Emit OTel spans named using the conventions in CODING-STANDARDS.md.
* Add Prometheus metrics with standard labels.
* Log JSON only; include request IDs and versions.
* Tests required per CODING-STANDARDS.md, with Playwright flows for user-facing features.
* **ALL backend changes must pass `just validate-backend` before completion.** This runs:
  * `ruff check app/` - Linting with consistent style rules
  * `ruff format --check app/` - Format checking (matches CI)
  * `mypy app/` - Strict type checking
* Frontend changes should pass `just validate-frontend` (ESLint + TypeScript)
* Use `just validate-all` to check both backend and frontend together

---

## 9) CI/CD Expectations

* Generate SBOM (syft) and sign images/charts (cosign) in GitHub Actions.
* Use Helm (OCI) charts; ArgoCD deploys from a GitOps repo. No direct kubectl to prod.
* Include chart updates and values changes in PRs.

---

## 10) AI Assistant Prompt Patterns (copy/paste)

Use these when requesting code generation from the assistant:

**Component:**

```
Goal: Accessible <Component> with design tokens and tests.
Inputs: design tokens, props, states, loading rules.
Acceptance: a11y (keyboard + labels), RTL tests, Storybook stories, bundle size check.
Files: apps/web/src/components/<Component>.tsx (+ .test.tsx, .stories.tsx)
```

**Feature slice (AI chat):**

```
Goal: SSE-based chat with streaming tokens and abort.
Inputs: endpoint path, auth via cookies, OTel span names.
Acceptance: renders tokens incrementally, abort on route change, retries with backoff, Playwright E2E.
Files: apps/web/src/features/ai-chat/*
```

**Service endpoint (FastAPI):**

```
Goal: Add POST /v1/stories to Stories Service.
Inputs: Pydantic schema, authZ call, outbox event, OpenAPI update.
Acceptance: pytest unit + integration, Schemathesis contract test, OTel spans, Prom metrics, passes `just validate-backend`.
Files: services/stories/*, packages/shared-types/*
```

**Search indexing:**

```
Goal: Index Story updates in OpenSearch (hybrid + vector-ready).
Inputs: index mapping, outbox event payload, LiteLLM embedding call.
Acceptance: idempotent indexing, alias switch pattern, integration test with Localstack/OpenSearch.
Files: services/search-indexer/*
```

---

## 10) Issue Tracking & Project Flow

* **Source of truth:** GitHub Projects + GitHub Issues (SHARED-SERVICES §10 Option B).
* Link every PR to an Issue. Use Conventional Commits in titles.
* Use the PR template from CODING-STANDARDS §16.

---

## 11) Known Consistency Decisions (Latest)

* **Postgres-first for MVP:** Using Postgres for search and relationships. OpenSearch and Neo4j are deferred to future phases when proven necessary.
* **Google OAuth for MVP:** Using Google OAuth directly; AWS Cognito integration deferred to post-MVP.
* **Single-tenant** product. Multi-tenancy may be added later; design APIs to accept a tenant_id without exposing it in UI now.
* **Vite + React Router** for the web app shell. Next.js may be used only for a separate marketing site later.
* **SSE-first** streaming for AI chat; WebSockets are optional later.
* **Direct API calls:** No LiteLLM proxy, SNS/SQS, or microservices for MVP. These are deferred to post-MVP when complexity is justified.

If you find another inconsistency, **open an issue** and propose a short patch to the relevant doc.

---

## 12) When to Ask for Approval vs. When to Proceed

* **Ask for approval first** (plan with options) when:

  * Changing schemas or contracts, adding endpoints, modifying auth/session flows.
  * Adding new dependencies or altering build/deploy tooling.
  * Touching cross-cutting concerns (observability, security, plugin contracts).
* **Proceed without approval** when:

  * Internal refactors with no external behavior change.
  * Test additions or fixes.
  * Documentation or CI workflow fixes that do not affect deploy behavior.

---

## 13) Output Format for Plans & Changes

* Prefer **diffs** or **file lists** with proposed insertions/deletions.
* Include snippets for Helm values, Kubernetes manifests, and code when helpful.
* Always conclude with **“Request for Approval: Option A/B/C.”**

---

## 14) Contacts

* **Owners:** @hewjoe and @drunkie-tech
* **Where to ask:** Open a GitHub Discussion or Issue tagged `question`.
* **GitHub Project:** https://github.com/orgs/mosaic-stories/projects/1
* **Primary GitHub Repo:** https://github.com/mosaic-stories/mosaic-life
