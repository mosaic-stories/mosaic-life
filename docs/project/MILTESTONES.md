# Milestones: MVP → Full Implementation

This roadmap captures the key milestones from first working MVP to a hardened, extensible product. It reflects the architecture and standards in:

* `/docs/architecture/CORE-BACKEND-ARCHITECTURE.md`
* `/docs/architecture/FRONTEND-ARCHITECTURE.md`
* `/docs/architecture/PLUGIN-ARCHITECTURE.md`
* `/docs/ops/SHARED-SERVICES.md`
* `/docs/standards/CODING-STANDARDS.md`
* `/docs/AGENT.md`

> **Stack anchors:** Single‑tenant, Vite + React Router, TipTap editor, SSE streaming, FastAPI services, Postgres + Neo4j (self‑hosted), OpenSearch, SNS/SQS, LiteLLM proxy, Helm‑only, GitHub Actions → ArgoCD, ALB + WAF, Jaeger/Loki/Prometheus+Thanos/Grafana.

---

## M1 — Foundations & Repo/Infra Bootstrap (Pre‑MVP)

**Scope / Features**

* Monorepo skeleton (`apps/`, `services/`, `packages/`, `infra/`), devcontainers, pre‑commit, pnpm + uv, Make/Just.
* GitHub Actions pipelines (verify → build → package → preview → promote). SBOM (syft) + scans (trivy/grype) + cosign.
* Helm charts (OCI) per service; ArgoCD app-of-apps (or ApplicationSets); preview envs.
* Observability stack online: OTel Collector → Jaeger; Prometheus + Thanos; Loki; Grafana dashboards seeded.
* External Secrets wired to Secrets Manager; IRSA roles for services; base NetworkPolicies.

**Acceptance Criteria**

* `just dev` boots local Compose (Localstack SNS/SQS, MinIO, Neo4j, OpenSearch, Jaeger, Prom, Grafana, Loki).
* CI builds signed images/charts; ArgoCD deploys to a staging namespace from Git.
* Base dashboards present; traces from a sample request visible end‑to‑end.

---

## M2 — Auth & App Shell (MVP Core)

**Scope / Features**

* Public landing page (unauth). App shell behind BFF with Cognito OIDC (code + PKCE), httpOnly cookies.
* Session refresh, `/me` endpoint, route guards; basic RBAC/ABAC scaffolding.
* Design system tokens, theme switcher (light/dark), user preferences.

**Acceptance Criteria**

* Login/logout flows pass E2E; cookies are httpOnly, SameSite=Lax; CSRF protections in place.
* App shell loads with user profile; OTel spans: `bff.auth.exchange`, `web.route.load`.

---

## M3 — Core Domain & Persistence (MVP Core)

**Scope / Features**

* Stories Service (Postgres): story CRUD, revisions, tags, invitations, moderation flags; **Transactional Outbox**.
* Graph Service (Neo4j self‑hosted): nodes (Person, Legacy, Story, Context), relationship APIs with guardrails.
* Basic authorization checks (owner/editor/contributor/viewer) enforced in BFF/services.

**Acceptance Criteria**

* OpenAPI published; Schemathesis contract tests green.
* Outbox events (`StoryCreated/Updated`, `LegacyCreated`, `RelationshipAdded`) delivered to SNS; consumers receive via SQS with idempotency.
* Graph traversals capped/paginated; integration tests pass.

---

## M4 — Media Pipeline (MVP Core)

**Scope / Features**

* Presigned S3 uploads; resumable uploads for large files; progress UI.
* Post‑upload pipeline: AV scan → thumbnails/transcodes → metadata extraction → `MediaProcessed` event.
* Inline viewers/players for images/audio/video; basic quotas.

**Acceptance Criteria**

* E2E test: upload → processed artifacts visible; S3 objects tagged; failures surface in UI with retry.
* Metrics for pipeline stages; Grafana dashboard shows throughput and errors.

---

## M5 — Search & Discovery v1 (Completes MVP)

**Scope / Features**

* OpenSearch indexes: `stories-v1`, `media-v1`; ingestion from outbox consumers.
* Unified search UI: keyword search with filters (type, tags, author, time); ACL-aware.
* API for suggestions/autocomplete (debounced); result deep links.

**Acceptance Criteria**

* Hybrid keyword queries return relevant results with correct ACL filtering.
* Indexer is idempotent; alias pattern used for reindex; CI integration test with Localstack/OpenSearch.

> **MVP BAR:** M1–M5 provide a usable product for early adopters.

---

## M6 — Plugin Platform v1 (Extensibility)

**Scope / Features**

* Frontend: Module Federation remote loading; contribution points (routes, panels, settings tabs); error boundaries.
* Backend: Helm‑only deployment pattern for plugins; registration handshake; capability gating.
* Example plugin (backend + UI) demonstrating a non‑trivial feature (e.g., external data source panel).

**Acceptance Criteria**

* Core registers and loads a sample plugin UI at runtime; CSP allows only configured origins.
* Plugin backend deployed via Helm; `/healthz`, `/readyz`, `/manifest` pass; disabled state removes UI and blocks calls.

---

## M7 — AI Registry & AI UX v1

**Scope / Features**

* LiteLLM deployed centrally; providers/models configured; per‑plugin allowlists.
* Frontend AI chat with **SSE** streaming; model selection (if allowed), saved presets; basic moderation hooks.
* Embedding endpoint for vectorization; shared adapter in services.

**Acceptance Criteria**

* Usage tracked by plugin/service and surfaced in Grafana; cost estimates visible.
* E2E chat flow passes; SSE stable through ALB/Ingress with buffering disabled.
* Embedding jobs index chunks into OpenSearch (vector‑ready mapping present though not required for MVP).

---

## M8 — Production Hardening & Ops

**Scope / Features**

* Alerts with runbooks; SLO dashboards; error budgets defined per service.
* Backups & DR: RDS PITR, Neo4j dumps, OpenSearch snapshots; restore drills.
* Security: WAF tuned, NetworkPolicies default‑deny, IAM/IRSA least‑privilege reviews, image signing enforcement.
* Autoscaling: KEDA on SQS depth; HPA settings; canary/blue‑green (optional) via Argo Rollouts.

**Acceptance Criteria**

* Top 5 failure modes have alerts + runbooks; pager/notification path tested.
* Quarterly restore test steps documented and validated in staging.
* Policy checks block unsigned images and critical CVEs in CI.

---

## M9 — Search v2 (Semantic & RAG‑Ready)

**Scope / Features**

* Chunking & embeddings pipeline (LiteLLM) for stories/media; `chunks-v1` index with dense vectors.
* Hybrid retrieval (keyword + vector) API; UI explainability toggle; groundwork for RAG (context bundles returned).
* Optional: Retrieval adapters to allow future swap to purpose‑built vector DB (kept behind `SearchAdapter`).

**Acceptance Criteria**

* k‑NN queries return semantically relevant chunks; latency within budget.
* API returns source citations; UI renders context chips.
* Backfill job can (re)embed and (re)index the corpus idempotently.

---

## Notes

* The order of M6–M9 can be adjusted based on integrator demand (plugins) vs. AI features vs. scale needs.
* Throughout, keep **single‑tenant** assumptions in UI/UX, but keep APIs forward‑compatible for a future `tenant_id`.
* Any change to contracts/schemas must follow the **plan‑first** approval flow in `/docs/AGENT.md`.
