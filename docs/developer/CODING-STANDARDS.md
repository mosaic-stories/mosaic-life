# Coding Standards & Developer Experience (DX)

**Audience:** Core & plugin authors (Python + TypeScript) in a small team using AI coding assistants.
**Scope:** Style, testing, libraries, security, environments, deployment, observability, PR workflow, and AI-assistant usage.

**Anchors:**

* **Search:** OpenSearch (not Elasticsearch)
* **Images/Charts:** ECR (images) + Helm (OCI) for charts
* **Graph:** Neo4j self‑hosted in Kubernetes
* **Auth:** AWS Cognito via BFF
* **CI/CD:** GitHub Actions → ArgoCD
* **Issue tracking:** **GitHub Projects + GitHub Issues** (Option B), with Notion for specs/runbooks

---

## 1) Principles

* **Consistency over cleverness.** Prefer readable, predictable code.
* **Type safety end‑to‑end.** Strict TS; Python with type hints + static checks.
* **Contracts first.** APIs, events, and manifests are typed & versioned.
* **Security by default.** No plaintext secrets; least privilege; sanitize untrusted content.
* **Observability is a feature.** Every request/action is traceable.
* **Small PRs; fast iteration.** Ship thin slices behind flags when needed.

---

## 2) Repository & Toolchain

### 2.1 Monorepo layout

```
/ (repo root)
  apps/
    web/                # Vite + React + TS (app shell)
  services/
    bff/                # FastAPI gateway
    stories/
    graph/
    media/
    search-indexer/
    plugin-host/
  packages/
    design-system/
    shared-types/       # OpenAPI/JSON schema + TS types
    plugin-sdk-frontend/
    plugin-sdk-backend/
  infra/
    helm/               # per-service Helm charts
    kustomize/          # optional overlays (if used)
  .github/
    workflows/
  docs/
  .editorconfig
```

### 2.2 Language & runtimes

* **Node:** 20.x LTS; **package manager:** **pnpm**.
* **Python:** 3.12; **env:** **uv** (preferred) or `venv` fallback.

### 2.3 Package management

* **TS:** lock with `pnpm-lock.yaml`; use workspaces.
* **Py:** `pyproject.toml` managed by **uv**; lockfile committed.
* Pin runtime‑critical deps exactly; use `~` for non‑critical UI libs.

---

## 3) Formatting & Linting

### 3.1 Universal

* **EditorConfig** enforced.
* **Pre‑commit hooks**: run format + lint + secrets scan.

### 3.2 TypeScript/React

* **Prettier** for formatting.
* **ESLint** (`@typescript-eslint`) with strict rules; disallow `any` except in typed boundaries.
* **Stylelint** only if CSS modules are used (prefer Tailwind/Tokens for styling).

### 3.3 Python

* **Black** for formatting, **Ruff** for linting (includes import sorting) and simple checks.
* **MyPy** with strict settings on services and SDKs.

---

## 4) Libraries & Frameworks (Baseline)

### Frontend (apps/web)

* React 18, TypeScript (strict), Vite
* Routing: React Router
* Data: **TanStack Query** (server cache) + **Zustand** (local UI state)
* Editor: **TipTap (ProseMirror)** with Markdown sync & preview toggle
* HTTP: native `fetch` via a thin wrapper; retry with `exponential-backoff` util
* Validation: **zod**; share JSON Schemas with backend contracts
* Testing: **Vitest**, **React Testing Library**, **Playwright**
* Storybook for components; design tokens via `packages/design-system`

### Backend (Python)

* **FastAPI** + **Pydantic v2**
* DB: SQLAlchemy 2.x + Alembic (Postgres/RDS); Neo4j Python driver
* Search: OpenSearch Python client
* Messaging: boto3 (SNS/SQS); `aioboto3` in async paths
* HTTP client: `httpx` (async), retry with `tenacity`
* Auth: Cognito OIDC verification lib (JWT); sessions handled in BFF
* Observability: OpenTelemetry SDK + instrumentations; Prometheus client where needed
* Testing: **pytest**, `pytest-asyncio`, `requests/httpx` testclients, **schemathesis** for OpenAPI conformance

---

## 5) Testing Strategy (Pyramid)

* **Unit tests** (fast, mock external IO). Coverage goal: **≥80%** per service/package.
* **Contract tests**

  * OpenAPI/GQL schemas validated; `schemathesis` fuzzing on critical endpoints.
  * Plugin UI contracts validated with a host harness.
* **Integration tests**

  * Spin up service + dependencies (see [Local Development Setup](/docs/developer/LOCAL.md) for Docker Compose configuration).
* **End‑to‑End (E2E)**

  * Playwright flows for login, story create/edit, media upload, search, AI chat streaming.
* **Performance smoke**

  * K6/Gatling lightweight checks for p95 latency budgets.

**Rule:** New features must land with tests at the lowest reasonable level + at least one E2E per flow.

---

## 6) Security Standards

* **Secrets:** Never commit; use AWS Secrets Manager + External Secrets.
* **Scanning:**

  * **gitleaks** (pre‑commit + CI)
  * **pip‑audit** / **npm audit**; block critical
  * **Bandit** (Python) + ESLint security rules
  * Optional: **semgrep** policies
* **Dependency policy:** license allowlist (MIT/Apache2/BSD/ISC); avoid AGPL unless isolated.
* **CSP:** strict defaults; list allowed plugin origins only.
* **Sanitization:** DOMPurify/rehype‑sanitize for user content.
* **Input validation:** zod (frontend), Pydantic (backend) at boundaries.
* **AuthZ:** single call to central policy function per request; no duplicated logic in clients/plugins.
* **Transport:** TLS everywhere; mTLS optional later; JWT between services.

---

## 7) Observability & Logging

* **Traces:** OTel context propagated across HTTP and SNS/SQS via message attributes; Jaeger backend.
* **Metrics:** Prometheus format; standard labels: `service`, `component`, `version`.
* **Logs:** Structured JSON; required fields: `ts`, `level`, `service`, `component`, `version`, `request_id`, `user_id` (if present), `tenant` (omit, single‑tenant), `path`, `status`, `latency_ms`.
* **Sampling:** keep 100% in dev/stage; reduce in prod if needed.
* **Dashboards:** Grafana JSON in repo; each service owns one overview + one SLO.

---

## 8) Performance Budgets

* **Web:** initial JS ≤ 250KB gz; FCP < 2s, TTI < 2.5s (reference hardware/connection); image lazy‑load; code‑split routes and MF remotes.
* **API:** p95 read < 200ms; p95 write < 400ms (excluding media processing); clear timeouts and retries.
* **Graph:** cap traversal depth; paginate edges; timebox queries.

---

## 9) Branching, Commits, Reviews

* **Branching:** trunk‑based with short‑lived feature branches.
* **Commits:** **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, etc.).
* **PR size:** target < 400 LOC; split if larger.
* **Reviews:** min 1 approval (the other dev); pair on risky changes. Required checklist (see §16).
* **Merging:** squash‑merge; auto‑close linked Issues.
* **Releases:** `release‑please` or Semantic Release; tags like `v1.4.2`.

---

## 10) CI/CD Requirements

* **GitHub Actions** jobs:

  * `verify`: type‑check, lint, unit tests, build
  * `security`: gitleaks, audit, Bandit/Ruff report
  * `build`: container, SBOM (syft), scan (grype/trivy), **cosign sign**
  * `package`: Helm chart (OCI), **cosign sign**
  * `preview`: spin a namespace; run smoke tests
  * `promote`: open PR to GitOps repo (ArgoCD watches)
* **Blocking rules:** tests + linters must pass; signatures required for deploy.

---

## 11) Configuration & Environment

* **12‑factor**: config via env vars; document required vars in `README` and Helm values.
* **Naming:** `SERVICE_UPPER_SNAKE_CASE` (e.g., `BFF_BASE_URL`, `OPENSEARCH_URL`).
* **Profiles:** `dev`, `staging`, `prod` envs with separate values.
* **Feature flags:** static flags via env or config initially; Unleash later if needed.

---

## 12) Data & Migrations

* **Postgres:** Alembic migration per schema change; forward‑compatible; include rollback notes.
* **Neo4j:** idempotent Cypher migration scripts; record applied versions.
* **OpenSearch:** versioned index aliases; reindex jobs under `infra/ops/`.
* **Backfill jobs:** use SNS/SQS workers; idempotent; checkpointing.

---

## 13) Documentation

* **Docs in repo** (`docs/`) + Notion for product specs/runbooks.
* **ADRs:** `/docs/adr/` using MADR template; short, dated decisions.
* **API docs:** OpenAPI published from BFF; Storybook published for UI.
* **README** in each service/package: purpose, run, env vars, endpoints.

---

## 14) Developer Environment

See **[Local Development Setup](/docs/developer/LOCAL.md)** for complete setup instructions including prerequisites, Docker Compose stack, and development workflow.

* **Devcontainers** (`.devcontainer`) for consistent local setup (Node, Python, pnpm, uv, Docker, make/just).
* **Make/just** commands (`just dev`, `just test`, `just fmt`, `just lint`, `just e2e`).
* **Pre‑commit** configured repo‑wide.

---

## 15) AI Coding Assistant Usage Policy

* **Prompt structure:** Always include *goal*, *inputs/constraints*, *acceptance criteria*, and *file targets*. Prefer the patterns in `FRONTEND-ARCHITECTURE.md §22` and service‑specific equivalents.
* **No secrets or proprietary keys** in prompts; use placeholders.
* **Generated code review:** human reads every line; ensure **tests** accompany generated code.
* **Licensing:** The assistant must not paste third‑party code beyond fair use. Verify license compatibility before adoption.
* **Annotations:** Mark machine‑generated files with a header (`// @generated`) when appropriate.
* **Refuse unsafe patterns:** If generation suggests insecure code (e.g., `eval`, unsafe HTML), replace with safe alternatives.

---

## 16) PR Template (Definition of Ready/Done)

**Link Issue:** #

**What & Why**

* Summary of change and intended outcome.

**Scope**

*

**Tests**

*

**Observability**

*

**Security**

*

**Docs**

*

---

## 17) Monitoring Playbook Snippets

* **OTel span names:** `bff.auth.exchange`, `stories.create`, `stories.update`, `graph.traverse`, `media.upload`, `search.query`, `ai.stream`.
* **Prom metrics naming:** `service_component_operation_{count|duration_ms|errors_total}`; include `status` label for HTTP.
* **Loki labels:** `app`, `component`, `env`, `version`, `request_id`.

---

## 18) Deployment Standards

* **Helm chart** per service: Deployment, Service, HPA, PDB, NetworkPolicy, ServiceAccount, Probes, ConfigMap/Secret.
* **Chart tests:** `helm lint` + `ct` (chart‑testing) in CI.
* **Rollouts:** Blue/green or simple rolling; Argo Rollouts optional. Define readiness gates to check health endpoints and OpenSearch reachability after index migrations.
* **SSE endpoints:** NGINX annotations to disable buffering & raise timeouts.

---

## 19) Library Allow/Prefer Lists

* **Prefer:** FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, httpx, tenacity, boto3/aioboto3, OpenSearch client, Neo4j driver, OTel, Prom client, pytest, schemathesis, TipTap, TanStack Query, Zustand, zod, Vite, React Router, Vitest, Testing Library, Playwright.
* **Avoid:** Heavy global state libs unless proven; direct WebSocket chat until needed; unmaintained markdown renderers; unsafe HTML renderers.

---

## 20) Acceptance Gates per Environment

* **dev:** non‑blocking checks; CI must pass `verify`.
* **staging:** require all tests + signatures; deploy via ArgoCD from GitOps repo; smoke + E2E.
* **prod:** manual approval; migrations run with back‑out plan; SLO alerts green; dashboards updated.
