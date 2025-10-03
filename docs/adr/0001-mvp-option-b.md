# ADR 0001: MVP Profile — Option B (Consolidated Core + Key Infra)

Status: Accepted
Date: 2025-09-15
Deciders: Core Team (2 devs + DevOps)
Consulted: Architecture docs under `docs/architecture/*`, `AGENTS.md`

## Context

We need a fast path to a usable MVP for a memorial stories product. The target architecture favors multiple services (BFF, Stories, Graph, Media, Search Indexer) and shared services (OpenSearch, SNS/SQS, LiteLLM). For a two‑person team, we must minimize moving parts while staying aligned with anchors (FastAPI, OpenSearch, SNS/SQS, LiteLLM, Helm‑only, OIDC via Cognito).

We evaluated three options:

- Option A: Monolith + local stubs (fastest, deviates from anchors).
- Option B: Consolidated Core API service + key infra (OpenSearch, SNS/SQS, LiteLLM); Graph deferred. Smallest delta from anchors with manageable scope.
- Option C: Full target topology (slowest, highest ops overhead).

## Decision

Adopt Option B for MVP:

- One service: `Core API` (FastAPI) combining BFF + Stories + minimal Media + outbox → SNS.
- Keep adapters and typed interfaces: `SearchAdapter` (OpenSearch), `AIAdapter` (LiteLLM), `EventPublisher` (SNS/SQS). Graph service is deferred.
- Use OpenSearch for search v1 (keyword + filters). Vector features are prepared but optional for MVP.
- Use SNS/SQS for eventing (transactional outbox in Postgres) to stay compatible with indexers and future consumers.
- Deploy LiteLLM centrally (single endpoint) even if initial UI use is limited.
- Defer plugin platform and Graph service to post‑MVP; keep UI hooks behind flags.

## Consequences

Positive:

- Aligns with key architecture anchors (OpenSearch, SNS/SQS, LiteLLM) while minimizing service count.
- Clear migration path to split services later (Stories → Search Indexer; add Graph) because adapters and events exist from MVP.
- Limits ops surface to a single app service plus managed/shared dependencies.

Negative/Risks:

- Some duplication inside Core API (indexing inline initially vs. separate consumer) until split.
- Additional infra to stand up compared to Option A (OpenSearch, Localstack for CI), increasing initial setup time.

## Scope (MVP)

- Auth: OIDC code+PKCE via BFF; httpOnly cookies; `/me` endpoint; CSRF protections.
- Stories: CRUD + revisions + tags; Alembic migrations; transactional outbox rows for `StoryCreated/Updated`.
- Media: Presigned S3 uploads; basic metadata; events `MediaUploaded/Processed` shape defined (processing can be mocked initially).
- Search: `stories-v1` index; keyword search with ACL filters; OpenSearch client via `SearchAdapter`.
- Eventing: Outbox table + publisher to SNS; idempotency keys.
- AI: LiteLLM deployed; `AIAdapter` available (UI can hide features until needed).
- Observability: OTel traces end‑to‑end; JSON logs; basic Prom metrics.
- Deploy: Helm charts for `core-api`, `web`, and shared services values; ArgoCD GitOps.

## Non‑Goals (MVP)

- Graph service (Neo4j) and complex traversals.
- Plugin platform runtime loading (Module Federation) and plugin host.
- Advanced media pipeline (AV scan/transcodes at scale); resumable uploads can be added later.
- KEDA/Thanos/Rollouts; start with simple autoscaling and basic monitoring.

## Implementation Notes

- Keep `SearchAdapter`, `AIAdapter`, and `EventPublisher` interfaces in `services/core-api/app/adapters/` so a future split is a drop‑in.
- For search indexing, start by indexing on write within Core API; plan a small `search-indexer` consumer service later driven by SQS.
- Define events with a stable envelope (see `CORE-BACKEND-ARCHITECTURE.md §6.1`). Use message attributes for `type` and `tenant_id`.
- Use single‑tenant assumptions in UI, keep backend models forward‑compatible with a future `tenant_id` parameter.

## Migration Plan (post‑MVP)

1) Extract search indexing into `services/search-indexer` consuming SQS; Core API stops indexing inline.
2) Introduce Graph service with Neo4j; project relationships from Postgres events; add traversal APIs behind the BFF.
3) Enable Module Federation runtime loading; add Plugin Host service and registration handshake.
4) Expand media pipeline (AV scan, thumbnails/transcodes) and move to event‑driven workers.

## Security & Compliance

- No plaintext secrets; External Secrets → AWS Secrets Manager.
- CSP strict; sanitize Markdown/HTML using shared sanitizer.
- BFF issues httpOnly cookies; Origin checks + CSRF token for unsafe methods.
- IAM via IRSA with least privilege (S3, SNS/SQS, Secrets Manager, OpenSearch endpoints).

## Alternatives Considered

- Option A: Quicker, but diverges from OpenSearch/SNS anchors and increases rework risk.
- Option C: Clean separation early, but too heavy for two engineers to reach MVP quickly.

## Decision Owner & Review

Owner: @hewjoe
Reviewers: @drunkie-tech
Next Review: After MVP acceptance to decide on search indexer extraction.

