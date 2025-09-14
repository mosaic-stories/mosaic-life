# Core Backend Architecture

**Platform focus:** Kubernetes (Helm-only deployment), AWS-friendly primitives.
**AuthN/IdP:** OIDC (Cognito or Authentik).
**Eventing:** SNS/SQS.
**Search:** OpenSearch/Elasticsearch, vector-ready (k-NN).
**AI registry:** Centralized via LiteLLM (quota/proxy/spend), referenced by plugins/services.

---

## 1) Goals & Non‑Goals

### Goals

* Ship a **balanced service topology** (not a monolith, not microservice sprawl).
* Strong **multi-tenancy**, **security**, and **observability** from day one.
* Clean separation between **Core** and **Plugins**, with explicit contracts.
* **OIDC-first** auth with a BFF pattern for secure session handling.
* Durable **event-driven** consistency and scalable **search** that is RAG‑ready.
* Central **AI registry** (LiteLLM) to standardize model access, cost controls, and quotas.

### Non‑Goals

* In-process plugin execution (reserved for future micro-hooks only).
* Operator/CRD for plugins (v2 evolution; Helm-only for now).

---

## 2) High-Level Topology

```
[Browser SPA]
   |  OIDC (PKCE) + Cookies
   v
[Gateway/BFF]
   |  REST/GraphQL
   |--> [Stories Service] -----> Postgres (RLS)
   |--> [Graph Service] -------> Neo4j (or Open-source Neo4j helm) / Neptune (alt)
   |--> [Media Service] -------> S3 (uploads, AV scan, thumbnails)
   |--> [Search Indexer] -----> OpenSearch/Elasticsearch (k-NN ready)
   |--> [Plugin Host] --------> plugin services (HTTP/gRPC)
   |--> [AI Registry Proxy] --> LiteLLM (shared endpoint, per-tenant quotas)

[SNS] <--- Outbox publisher (Stories/Media/Graph)
  |\
  | \---> [SQS: Graph Indexer]
  | \---> [SQS: Search Indexer]
  | \---> [SQS: Notifications]
  +------> [SQS: Plugin subscribers]
```

* **North–south** API via BFF; **east–west** via typed REST/gRPC.
* **Outbox pattern** in Postgres emits domain events → SNS topics → SQS subscribers.

---

## 3) Identity: AuthN, Sessions, AuthZ

### 3.1 OIDC Flow (BFF pattern)

* Use **Authorization Code + PKCE**. The BFF completes the code exchange with IdP and issues **httpOnly, SameSite=Lax** cookies to the SPA.
* Short-lived access token + refresh rotation; store refresh token server-side (encrypted) or use token exchange with the IdP.
* Enforce **CORS** minimal allowlist; CSRF protection via double-submit or Origin checks.

### 3.2 Identities & Linking

* Support multiple IdPs (Cognito, Authentik). Maintain **account links** so the same user can sign in via different providers.

### 3.3 Authorization

* Use **RBAC + ABAC** with a central policy layer.
* Subject, action, resource, context (tenant\_id, legacy\_id, story\_id, relationship).
* Consider OPA/Cedar adapter but keep rules co-located initially for simplicity.
* **Tenancy propagation**: tenant\_id must be present in auth context and in all read/write paths.

---

## 4) Service Boundaries (v1)

* **Gateway/BFF** (FastAPI/Starlette): OIDC flows, cookie/session issuance, request fan‑out, response shaping, rate limits.
* **Stories Service**: story CRUD, versions, moderation flags, export; owns Postgres tables for stories, revisions, tags, invitations, and outbox.
* **Graph Service**: people/legacies/stories/contexts relationships + traversals. Enforces tenant boundary in every query.
* **Media Service**: presigned uploads to S3; AV scan; thumbnails/transcodes; metadata; emits `MediaUploaded`/`MediaProcessed` events.
* **Search Indexer**: consumes events, maintains indexes (text + vectors) in OpenSearch/Elasticsearch.
* **Plugin Host**: plugin registry, capability broker, authZ checks; proxies to plugin backends.
* **Notifications** (optional v1): email/webhook; can be folded into Stories initially.

> Keep service count small at v1. Split further only on clear pain (scaling, ownership, or failure domains).

---

## 5) Data Model & Persistence

### 5.1 Relational (Postgres)

* Authoritative store for **Stories**, **Users**, **Tenants**, **Invitations**, **ACLs**, **Plugin registrations**, **Media metadata**.
* **RLS** for tenant isolation; add compound indexes with tenant\_id first.
* IDs: **ULID** for globally sortable unique IDs; human slugs for `legacy` public URLs.
* Versioning: append-only revisions; soft delete via tombstones + cascaded effects.

### 5.2 Graph (Neo4j preferred; Neptune as alternative)

* Nodes: `Person`, `Legacy`, `Story`, `Context`, `PluginSource` (optional).
* Edges include tenant scoping: `(:Person {tenant})-[:RELATES_TO]->(:Legacy {tenant})`, etc.
* Decide whether **graph is authoritative** for relationships (recommended) or a projection of RDBMS data. If projection, define authoritative sources per edge.

### 5.3 Dual-Store Consistency

* Use **Transactional Outbox** in Postgres. A lightweight publisher reads the outbox rows and publishes to **SNS** with idempotency keys.
* Consumers (Graph Indexer, Search Indexer) read from **SQS**, upsert idempotently.
* Define rebuild path: reindex graph/search from Postgres snapshots + replay events.

---

## 6) Domain Events (SNS/SQS)

### 6.1 Envelope (JSON)

```json
{
  "id": "ulid",
  "type": "StoryCreated|StoryUpdated|LegacyCreated|RelationshipAdded|MediaUploaded|MediaProcessed|ModerationFlagged",
  "version": 1,
  "occurred_at": "RFC3339",
  "tenant_id": "...",
  "actor_id": "user|service|plugin",
  "resource": { "kind": "Story", "id": "..." },
  "correlation_id": "trace/span or request id",
  "payload": { /* type-specific */ }
}
```

* SNS **message attributes** mirror `type`, `tenant_id` for efficient filtering.
* **Idempotency**: consumers store last seen `id` per handler.

### 6.2 Topics & Queues

* Topics per domain (`stories`, `media`, `graph`), or one `domain-events` with attribute filters.
* One SQS **queue per service**; add DLQs + retry with backoff.

---

## 7) Search & RAG Readiness

### 7.1 Engine

* Default: **Amazon OpenSearch Service** (managed) or self‑hosted **OpenSearch/Elasticsearch**.
* Enable **k‑NN/vector** features (OpenSearch k‑NN plugin or Elasticsearch vector fields) for semantic search later.

### 7.2 Index Design

* `stories-v1`: fields for tenant\_id, legacy\_id, title, body (analyzed), tags, timestamps, ACL summaries.
* `media-v1`: captions, OCR/text tracks, EXIF, tenant\_id, story\_id.
* Optional `chunks-v1`: story/media chunks with **embedding** vectors for RAG.

### 7.3 Ingestion

* Indexer consumes domain events → denormalizes and indexes.
* For vectors, a **Vectorizer** worker calls LiteLLM to embed chunks; store `embedding` as dense vector.

### 7.4 Query API

* BFF exposes **hybrid search** (keyword + semantic).
* Pagination, score explanations (optional), per‑tenant filters, ACL filters.
* **RAG path reserved**: return chunk refs + contexts; clients (or plugins) can fetch originals and call LLMs.

> If later you prefer a purpose‑built vector DB (Qdrant/Weaviate), keep a **SearchAdapter** with a minimal interface so engines can be swapped.

---

## 8) AI Registry (LiteLLM)

### 8.1 Central Proxy

* Deploy **LiteLLM** once; configure providers/models centrally; set per‑tenant & per‑plugin quotas.
* Services/plugins call a **single internal endpoint** with a `model` name; credentials remain in LiteLLM.

### 8.2 Policy & Telemetry

* Enforce model allowlists per tenant; budget limits and rate limiting.
* Capture usage metrics and cost per call; forward trace/observability headers.

### 8.3 Contracts

* Define a small SDK surface: `generate`, `embed`, `moderate`.
* Short‑lived tokens from core to call LiteLLM; or mTLS in-cluster.

---

## 9) API Design (External & Internal)

* **External (BFF)**: REST for CRUD; optional GraphQL for aggregation across stories/graph/search.
* **Internal**: REST/gRPC with JSON/protobuf; consistent error model; idempotency keys for mutation endpoints.
* **Pagination**: cursor-based, stable ordering (ULID).
* **Caching**: ETag/If-None-Match on read endpoints; CDN for public assets.

---

## 10) Media Pipeline

* Browser gets **presigned S3 URLs** from Media Service; uploads directly.
* **ObjectCreated** event triggers: AV scan → thumbnails/transcodes → metadata extract → `MediaProcessed` event.
* Store derivatives as linked artifacts; lifecycle rules (hot→warm→archive) per tenant.

---

## 11) Permissions, Sharing, Consent

* Roles at scopes: **tenant**, **legacy**, **story** (`owner`, `editor`, `contributor`, `viewer`).
* Consent records for living persons referenced in stories; moderation queue.
* All read paths consult a centralized **authZ** service method with ABAC rules.

---

## 12) Multi‑Tenancy & Isolation

* **Postgres**: single DB with **RLS** by `tenant_id`.
* **Graph**: separate DB per tenant *or* strict tenant label filtering in every query.
* **Search**: index per tenant **or** tenant field filter + index-level routing; prefer the latter initially.
* **Secrets**: per-tenant namespaces in External Secrets (if tenants manage their own AI keys later).

---

## 13) Observability & SLOs

* **OpenTelemetry** everywhere; propagate tracecontext through BFF → services → SQS/SNS (message attributes carry `traceparent`).
* Structured JSON logs with `tenant_id`, `user_id`, `request_id`.
* Metrics: request rate/latency/error, queue lag, indexer throughput, LiteLLM cost usage.
* **SLOs** (initial): BFF availability 99.5%; p95 read < 200ms intra‑VPC; p95 write < 400ms excluding media.

---

## 14) Security Posture

* **NetworkPolicy** default‑deny; allow egress only to DBs, S3, IdP, LiteLLM, and approved externals.
* **mTLS** for service-to-service (mesh optional) and JWT between services.
* **Secrets** via External Secrets / AWS Secrets Manager; rotation playbooks.
* Content provenance on every write: `actor_id`, `plugin_id`, `source_ip`, `user_agent`.
* Data privacy: audit logs + subject access & erasure workflows (RDBMS, graph, search, media, plugin caches).

---

## 15) Schema & Migration Strategy

* **Postgres**: Alembic migrations; blue/green compatible changes; online backfills with feature flags.
* **Graph**: Cypher migration scripts (idempotent); record applied migrations per tenant.
* **Search**: versioned index aliases (e.g., `stories` → `stories-v2`); reindex jobs; backfill from Postgres snapshots.

---

## 16) Dev Experience & Environments

### 16.1 Local (Docker Compose)

* Core services + Localstack (SNS/SQS) + MinIO (S3) + Neo4j + OpenSearch + Mock OIDC (Keycloak/Authentik dev).
* Seed data and fake tenants; one command (`make dev`/`just dev`).

### 16.2 CI

* Contract tests for BFF and services; ephemeral k8s (kind) for smoke tests.
* Integration tests assert: outbox → SNS → SQS → indexers; search queries; graph traversals.

### 16.3 Repos

* Prefer a **monorepo** for core (BFF, Stories, Graph, Media, Search Indexer, shared libs).
* Plugins remain separate repos with their own release cadence.

---

## 17) Kubernetes (Helm‑Only)

* **Per-service Helm chart** with: Deployment, Service, HPA, PodDisruptionBudget, NetworkPolicy, ServiceAccount/RBAC, ConfigMap, Secret, Probes.
* Umbrella chart for the core stack (optional).
* Values pattern:

```yaml
image: { repo: ..., tag: ... }
resources: { requests: { cpu: 100m, memory: 256Mi }, limits: { cpu: 1, memory: 1Gi } }
env:
  OIDC_ISSUER: ...
  OIDC_CLIENT_ID: ...
  LITELLM_BASE_URL: http://litellm:4000
  SEARCH_BASE_URL: http://opensearch:9200
  SQS_QUEUE_URL_EVENTS: ...
  SNS_TOPIC_ARN_EVENTS: ...
secrets:
  OIDC_CLIENT_SECRET: from: ExternalSecrets
  DB_URL: from: ExternalSecrets
  S3_ACCESS_KEY: from: ExternalSecrets
```

---

## 18) Contracts & Interfaces (Adapters)

### 18.1 SearchAdapter

```ts
interface SearchAdapter {
  indexStory(story: StoryDoc): Promise<void>;
  indexMedia(media: MediaDoc): Promise<void>;
  searchStories(query: SearchQuery): Promise<SearchResults<StoryHit>>;
  upsertChunkEmbedding(doc: ChunkDoc): Promise<void>;
  knnSearchEmbedding(q: EmbeddingQuery): Promise<SearchResults<ChunkHit>>;
}
```

### 18.2 GraphAdapter

```ts
interface GraphAdapter {
  upsertLegacy(legacy: LegacyNode): Promise<void>;
  relateStoryToLegacy(storyId: ID, legacyId: ID): Promise<void>;
  addPersonEdge(personId: ID, legacyId: ID, rel: string): Promise<void>;
  traverse(query: GraphQuery): Promise<GraphPath[]>;
}
```

### 18.3 AIAdapter (LiteLLM-backed)

```ts
interface AIAdapter {
  generate(req: GenRequest): Promise<GenResponse>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  moderate(req: ModRequest): Promise<ModResponse>;
}
```

---

## 19) Performance & Caching

* BFF caches OIDC JWKS, config, and authorization decisions (short TTL).
* Service-level caches for hot reads; per-tenant cache keys.
* Graph traversals: cap depth/fan-out; guard with timeouts; paginate edges.

---

## 20) Roadmap & Deferments

* **RAG pipeline**: keep adapters ready; implement when demand is clear.
* **Operator/CRD** for plugins: move from Helm-only when plugin count grows.
* **Event-sourcing**: start with outbox; revisit if full audit trail & replay become primary.

---

## 21) Author/Reviewer Checklist

* [ ] OIDC/BFF flow documented and implemented (cookies, CSRF, CORS).
* [ ] Postgres schemas with RLS + Alembic migrations.
* [ ] Graph adapter + tenant scoping validated.
* [ ] Outbox → SNS/SQS wired with idempotency & DLQs.
* [ ] Search indexer + hybrid search APIs operational.
* [ ] LiteLLM endpoint configured; adapters for `generate`/`embed` ready.
* [ ] Observability (OTel traces, logs, metrics) across all services.
* [ ] Helm values & NetworkPolicies per service; secrets externalized.
* [ ] Local Compose with Localstack/MinIO/OpenSearch/Neo4j + seed data.
* [ ] CI contract tests green; smoke tests on ephemeral k8s.
