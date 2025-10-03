# Execution Plan — MVP

Owner: Core Team (2 devs + DevOps)
Scope: Core API + Web app with OpenSearch, SNS/SQS, LiteLLM; Graph/Plugins deferred

## Goals & Success Criteria

- Users can authenticate, create/edit stories (markdown), upload media, and search stories.
- Telemetry: OTel traces across web → BFF → Core → SNS/OpenSearch; JSON logs; Prom metrics.
- CI: verify pipeline; signed images/charts; deploy to staging via ArgoCD.

## Constraints & Inputs

- Single‑tenant; OIDC via Cognito; Helm‑only; OpenSearch preferred; SNS/SQS for events; LiteLLM proxy.
- Performance budgets: p95 read <200ms; write <400ms (excluding media).
- Security: httpOnly cookies; CSRF protection; sanitize user content; External Secrets.

## Work Streams & Sprints (3–4 weeks)

### Sprint 1 — Bootstrap & Auth

Deliverables:
- Monorepo structure: `apps/web`, `services/core-api`, `packages/shared-types`, `infra/helm/*`, `infra/compose/`.
- Devcontainer, pre‑commit, pnpm/uv, basic `just` commands.
- Core API skeleton: FastAPI app, OTel, JSON logging, health/readiness, config.
- OIDC PKCE via BFF; cookie issuance; `/me`; CSRF pattern.

Files to create/touch:
- services/core-api/app/main.py, app/auth/*, app/observability/*, app/config.py
- apps/web/src/app.tsx, src/routes/auth.tsx, src/lib/api/client.ts
- packages/shared-types/src/auth.ts, src/common.ts
- infra/helm/core-api/*, infra/helm/web/*, infra/compose/docker-compose.yml

Tests/Telemetry:
- Unit tests for auth handlers; E2E Playwright for login/logout; OTel span `bff.auth.exchange`.

### Sprint 2 — Stories + Outbox + Search (keyword)

Deliverables:
- Stories CRUD with revisions (SQLAlchemy + Alembic) and basic ACL (owner/editor/viewer).
- Transactional outbox table; publisher to SNS; idempotency keys.
- SearchAdapter (OpenSearch) with `stories-v1` mapping and index‑on‑write.
- Generated TS client from OpenAPI; UI editor (TipTap), list/detail pages.

Files to create/touch:
- services/core-api/app/stories/models.py, schemas.py, routes.py, repo.py, service.py
- services/core-api/app/adapters/search.py, events.py
- services/core-api/migrations/* (Alembic)
- apps/web/src/features/stories/* (list, detail, editor)
- packages/shared-types/src/stories.ts; api client artifacts

Tests/Telemetry:
- Pytests for repo/service; Schemathesis on `/v1/stories`.
- E2E: create/edit story, search; spans `stories.create`, `search.query`.

### Sprint 3 — Media & Polish

Deliverables:
- Presigned S3 upload endpoints; basic metadata; inline previews.
- Optional: mock processing → `MediaProcessed` event; UI status indicators.
- Harden observability dashboards; Helm values per env; staging deploy.

Files to create/touch:
- services/core-api/app/media/routes.py, s3.py, schemas.py
- apps/web/src/features/media/* (uploader, preview)
- infra/helm/values.{dev,staging}.yaml updates; External Secrets refs

Tests/Telemetry:
- E2E: upload flow; metrics for upload and presign endpoints; logs with request IDs.

## Telemetry & Tests Summary

- OTel spans: `bff.auth.exchange`, `stories.create`, `stories.update`, `search.query`, `media.upload`.
- Prom metrics: request count/duration; SNS publish outcomes; OpenSearch indexing latency.
- Logs: JSON with `service`, `version`, `request_id`, `user_id`.
- Tests: unit (≥80% for stories), contract (Schemathesis), E2E (auth, stories, media, search).

## Migration/Backout

- Feature flags for search indexing path (inline vs. consumer).
- Database migrations forward‑compatible; backout by disabling outbox publisher and rolling back app version.
- Helm values keep previous image tags for rollback; ArgoCD rollback documented.

## Risks & Mitigations

- OpenSearch ops overhead → prefer managed service in staging; local OpenSearch in Compose for dev.
- Event delivery complexity → Localstack in CI; DLQs monitored later.
- Security oversights → enforce External Secrets from start; add gitleaks in CI.

## Next Actions

1) Scaffold monorepo layout and Core API skeleton.
2) Add Helm chart stubs for `core-api` and `web` with health probes and External Secrets references.
3) Implement auth flow and `/me`; ship Playwright login test.
4) Implement Stories CRUD + outbox + OpenSearch indexing; ship tests.
5) Implement media presign/upload + basic UI; finalize MVP E2E.

