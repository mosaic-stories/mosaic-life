## Context

Five handlers invoke an LLM with no per-user throttle (proposal.md): `ai.py::send_message`, `ai.py::seed_conversation`, `rewrite.py::rewrite_story`, `story_context.py::extract_context`, `story_evolution.py::generate_draft`/`revise_draft`. All resolve `session_data = require_auth(request)` synchronously before doing any work, giving a consistent hook point.

Four of the five stream via SSE (`StreamingResponse` wrapping an `async def *_stream()` generator); `extract_context` instead returns `202` immediately and does its LLM work inside a `background_tasks.add_task(background_extract)` closure that runs after the response is sent. `rewrite_story` already establishes the pattern this change follows: authorization/validation happens as plain pre-stream checks that raise `HTTPException` (see its comment: *"Pre-stream checks must raise JSON HTTP errors (not SSE error streams)"*) — the actual `async def rewrite_stream()` body only wraps genuinely-in-stream failures as SSE `error` events. Rate-limit and concurrency checks must follow the same rule: reject before the stream starts, with a normal `HTTPException(429, ...)`, never as an SSE event.

Constraints from the existing deployment (verified, not assumed):
- **No Redis anywhere in the stack.** `infra/compose/docker-compose.yml` has no redis service; `services/core-api/pyproject.toml` has no redis/`slowapi`/`limits` dependency. CLAUDE.md states the MVP's architecture explicitly avoids new distributed-systems components ("PostgreSQL for everything... no distributed systems").
- **2 production replicas, 1 process each.** `infra/helm/core-api/values.yaml:6` sets `replicaCount: 2`; `scripts/start.sh` runs plain `uvicorn app.main:app` with no `--workers` flag, so each pod is a single asyncio event loop. In-process state is safe *within* a pod (no thread-safety concern) but is **not shared across the 2 pods** — anything kept only in memory caps per-pod, not per-user-globally.
- **Existing precedent is Postgres-backed, not a library.** `app/services/support.py::enforce_support_rate_limit` counts rows in the `SupportRequest` table created in the trailing hour for a user and raises a `ValueError` subclass, caught by the route as `HTTPException(429, detail=...)`. No `Retry-After` header is set today (this change adds one). No global exception envelope exists anywhere in the codebase (`grep` for `exception_handler`/`ErrorResponse` returns nothing) — routes raise plain `HTTPException(status_code, detail=str)` directly; this change follows that same shape.
- **Metrics label convention**: existing security-relevant counters (`AUTHZ_DECISIONS`, `AUTH_LOGIN_REJECTIONS` in `app/observability/metrics.py`) pass `service="core-api"` explicitly as a label at `.labels()` call time, not as a global constant label. This change follows the same pattern.

## Goals / Non-Goals

**Goals:**
- Every LLM-invoking route enforces a per-user request-frequency limit, correct regardless of which of the 2 replicas handles a given request.
- Every LLM-invoking route enforces a per-user concurrency cap on in-flight LLM operations.
- Rejections return `429` with a `Retry-After` header and are observable (metric + structured log).
- No new infrastructure component (no Redis, no new managed service) — reuse Postgres, matching the codebase's existing anchor and precedent.

**Non-Goals:**
- Perfect cross-replica precision on the concurrency cap (see Decision 2) — bounded imprecision is acceptable for MVP.
- IP-based limiting, per-tenant quotas, or LiteLLM/Bedrock-side budget controls (proposal.md Non-goals).
- A generic reusable rate-limiting *library* for the whole codebase — this change builds a purpose-fit module for AI endpoints; migrating `support.py` onto it is a possible follow-up, not required here.

## Decisions

### 1. Frequency-limit mechanism: Postgres-backed event table (not in-memory, not a Redis-backed library)

**Chosen: a dedicated `ai_rate_limit_events` table**, written by a new `app/services/ai_rate_limit.py` module.

```python
# app/models/ai_rate_limit.py
class AIRateLimitEvent(Base):
    __tablename__ = "ai_rate_limit_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    bucket: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

`enforce_ai_rate_limit(db, user_id, bucket, thresholds)` — `thresholds` is an ordered list of `(window_seconds, max_count)` pairs (e.g. `[(60, 20), (3600, 200)]` for "20/min and 200/hour"). For each threshold, `SELECT count(*) FROM ai_rate_limit_events WHERE user_id = :uid AND bucket = :bucket AND created_at > now() - :window`; on the first violated threshold, raise `AIRateLimitError(retry_after_seconds=...)` computed from that window (`window_seconds` minus the age of the oldest in-window row is more accurate than the full window, but "retry after `window_seconds`" is a simpler, acceptable-for-MVP first cut — flagged in tasks.md). If all thresholds pass, insert one event row. Opportunistically prune rows older than the largest configured window (`DELETE ... WHERE bucket = :bucket AND created_at < now() - :max_window`) in the same call, avoiding unbounded table growth without a separate cron job (no scheduled-job infra exists in this stack today).

**Rejected — in-process/in-memory counter** (dict/token-bucket keyed on `user_id`, the issue's own suggested fallback): would only cap per-pod. With 2 replicas, a user (especially an "automated/compromised account," the exact threat this issue names) can trivially get up to 2x the intended rate by spreading calls across both pods — no load balancer affinity is configured that would prevent this. Weak as the primary defense against the adversarial case the issue describes as Medium severity. Rejected for the frequency limiter specifically (see Decision 2 for why the calculus differs for the concurrency cap).

**Rejected — `slowapi` (+ in-memory or Redis backend):** `slowapi` has no Postgres backend; its options are in-memory (same cross-replica gap as above) or Redis/memcached (new distributed-system dependency, contradicting CLAUDE.md's stated MVP anchor and adding an operational component — deployment, health checks, a new failure mode for what happens to AI endpoints if it's down — for a single control). Rejected: doesn't fit this stack today without also taking on the infra cost this MVP has explicitly deferred.

**Rejected — piggyback rate counting on existing business tables** (e.g. count `AIMessage` rows for the chat bucket): would work for `send_message` (which persists a message per call) but not uniformly — `rewrite_story`, `extract_context`, and evolution `generate`/`revise` don't all persist one row per *attempt* in a shape convenient to count, and coupling rate-limit bookkeeping to business-data schema evolution (e.g. a future change to how messages are persisted) is a maintenance hazard. A dedicated table decouples the two and gives one consistent implementation across all five endpoints.

**Cost accepted:** one extra indexed insert (+ occasional prune delete) per LLM call. Negligible next to the LLM call itself (seconds to tens of seconds per `adapters/litellm.py`'s 600s timeout).

### 2. Concurrency-cap mechanism: in-process semaphore (per pod), not Postgres

**Chosen:** an in-process `dict[UUID, int]` (guarded by `asyncio.Lock` for atomicity, even though a single event loop makes races unlikely, not impossible across `await` points) in a new `app/services/ai_concurrency.py`, exposing an async context manager: `async with ai_concurrency_guard(user_id, bucket, limit):` — raises `AIConcurrencyLimitError` immediately if the user is already at `limit` for that bucket on *this pod*; otherwise increments on enter, decrements on exit (success, exception, or `GeneratorExit` from a client disconnect — see tasks.md for the exact placement inside each SSE generator's `try/finally`).

**Rejected — Postgres row-per-active-operation table** (insert at start, delete in `finally`, count active rows, with a staleness filter for orphaned rows from a crashed pod): would be correct across both replicas, unlike the in-memory option — but concurrency caps exist specifically to protect **per-pod** resources (worker/connection exhaustion, per the issue: *"long-running streams tie up connections... legitimate users get degraded or failed requests"* — connections are held by a specific pod's uvicorn process, not a global pool). An in-memory per-pod cap directly protects the resource that's actually at risk, at far less implementation cost than a crash-safe Postgres table (which needs a staleness/TTL window to avoid permanently locking out a user after a pod crash mid-stream, and an extra write+delete pair per stream on top of the frequency-limit insert). The accepted gap — a user could reach up to `limit × 2` concurrent streams by landing on both pods simultaneously — still bounds what is unlimited today, and is a smaller, well-understood trade-off than the added complexity buys back. **Confirmed by the owner (2026-08-12).**

**Follow-on scope note:** `extract_context` is not itself a stream (`202` + `BackgroundTasks`) — its concurrency guard wraps the `background_extract` closure (acquire before scheduling via `background_tasks.add_task`, i.e., synchronously in the route handler so a same-instant rejection is possible; release inside the background closure's `finally`), not the route's own response cycle.

### 3. Application shape: explicit per-route calls, not global middleware or `Depends`

**Chosen:** each target handler calls the two helpers explicitly, immediately after `require_auth`, mirroring `support.py`'s existing `await enforce_support_rate_limit(db, user_id)` call style (not FastAPI `Depends`, not a global `@app.middleware("http")`):

```python
session_data = require_auth(request)
await enforce_ai_rate_limit(db, session_data.user_id, bucket="chat_message", thresholds=CHAT_MESSAGE_THRESHOLDS)
async with ai_concurrency_guard(session_data.user_id, bucket="chat_message", limit=CHAT_MESSAGE_CONCURRENCY):
    ...
```

**Rejected — global ASGI/`@app.middleware("http")` limiter keyed on path:** the five endpoints need different bucket identities and thresholds (a chat message is cheap and frequent; a full story rewrite or evolution draft is expensive and rare), and `seed_conversation`/`send_message` share a bucket while living at different paths under the same router — expressing this cleanly from a single path-keyed middleware is awkward. Per-route calls keep each threshold visible at its call site and match the codebase's existing style (no middleware-based authz/rate-limiting precedent exists; `support.py` already established the explicit-call pattern).

**Rejected — FastAPI `Depends(rate_limit(...))`:** functionally similar to the chosen approach, but every target route currently calls `require_auth(request)` manually inside the function body rather than as a dependency (auth *could* be a dependency in FastAPI but isn't here), so a dependency-injected rate limiter would introduce a second calling convention alongside the existing manual-call style for no functional benefit. Explicit calls keep one convention.

### 4. Bucket/threshold table (owner-confirmed 2026-08-12)

| Bucket | Routes | Frequency | Concurrency (per pod) |
|---|---|---|---|
| `chat_message` | `ai.py::send_message`, `ai.py::seed_conversation` | 20/min, 200/hour | 2 |
| `story_rewrite` | `rewrite.py::rewrite_story` | 10/hour | 1 |
| `story_context_extract` | `story_context.py::extract_context` | 50/hour | 1 |
| `story_evolution` | `story_evolution.py::generate_draft`, `revise_draft` | 20/hour | 1 |

Context extraction and evolution generate/revise were raised from the original proposal (20/hour → 50/hour, and 15/hour → 20/hour respectively) per owner feedback. Not derived from real usage data, since no per-endpoint usage baseline exists yet — tasks.md makes thresholds a single named-constants module so they're a one-place, low-risk tuning point once the near-limit usage metrics (Decision 6) show real traffic patterns.

### 5. 429 response shape

Plain `HTTPException(status_code=429, detail="Rate limit exceeded, try again in {n}s", headers={"Retry-After": str(n)})` — matches the codebase's existing no-envelope convention (Context above); `Retry-After` is the standard HTTP header (RFC 9110 §10.2.3), giving the frontend a machine-readable backoff hint without inventing a new response schema.

### 6. Near-limit usage observability (owner-requested)

Rejection counters (Decision 1/Observability) only show that a limit was already hit — they don't help diagnose *why*, or show a user/bucket trending toward a cap before it starts producing 429s. Per owner feedback, this change also captures usage on every enforcement check, not just rejections:

- **`enforce_ai_rate_limit`** records a Prometheus Histogram observation of `count / max_count` (the ratio against the *tightest* violated-or-checked threshold) on every call, labeled only `service`, `bucket` — **not** `user_id`, to avoid unbounded Prometheus label cardinality (a per-user label on a Counter/Histogram is a well-known cardinality hazard as the user base grows). This gives ops a fleet-wide distribution — e.g. "p99 of `story_evolution` usage-ratio is climbing toward 1.0" flags a systemically-too-tight threshold before individual users start seeing 429s.
- **`ai_concurrency_guard`** similarly updates a Gauge of current in-flight count per `(service, bucket)` on acquire/release — real-time concurrency pressure per bucket, aggregated across the pod (still not per-user, same cardinality reasoning).
- **For per-user debugging** of a specific report ("why did user X get rate-limited?"), the Postgres-backed mechanism (Decision 1) is directly queryable: `SELECT bucket, created_at FROM ai_rate_limit_events WHERE user_id = :id ORDER BY created_at DESC` reconstructs that user's exact call pattern — no separate high-cardinality metric needed for this case, which is the practical payoff of choosing Postgres over in-memory for the frequency limiter.
- A near-limit **structured log** (`ai.rate_limit.near_limit`, INFO, fields `user_id`, `bucket`, `count`, `limit`, `window_seconds`) fires when a check's ratio crosses 0.8 for the tightest threshold — high-cardinality (`user_id`) is fine in logs (unlike Prometheus labels), giving a searchable trail in the log aggregator leading up to any specific rejection, ahead of the existing WARNING-level `ai.rate_limit.rejected` event.

## Risks / Trade-offs

- **[Risk]** Concurrency cap only correct per-pod (Decision 2) → an adversarial user can reach ~2x the nominal concurrency cap by targeting both replicas. **Mitigation:** the frequency limiter (Decision 1, correct across replicas) remains the primary defense against sustained cost abuse; the concurrency cap's job is bounding simultaneous worker/connection usage per pod, which it does correctly. Documented explicitly, not silently accepted — proposal.md Open Question 3.
- **[Risk]** New table (`ai_rate_limit_events`) grows unboundedly if the opportunistic prune-on-write (Decision 1) doesn't keep pace with write volume during a burst. **Mitigation:** prune runs on every write for the same `bucket`, so it self-corrects as soon as traffic for that bucket resumes; add an index on `(user_id, bucket, created_at)` so both the count query and the prune delete stay cheap even if the table temporarily grows. If this proves insufficient in practice, a scheduled cleanup job is a follow-up, not required at launch.
- **[Risk]** `Retry-After` computed as the full window rather than time-until-oldest-event-expires (Decision 1) overstates wait time right after a burst, potentially causing the frontend to back off longer than strictly necessary. **Mitigation:** acceptable conservative behavior for a first cut — precise computation is a one-line follow-up (subtract event age) once the simpler version is validated in production; noted in tasks.md as a possible refinement, not blocking.
- **[Risk]** Placing the concurrency-guard `finally`/release correctly across every exit path of four different SSE generators (normal completion, internal exception already caught-and-turned-into-an-SSE-error-event, and client-disconnect `GeneratorExit`) is easy to get subtly wrong, and a leaked "slot" silently locks a user out of that bucket on that pod until the pod restarts. **Mitigation:** tasks.md requires an explicit test per endpoint that forces a client disconnect mid-stream and asserts the slot is released; a single shared helper (not four hand-rolled copies) minimizes the number of places this can go wrong.
- **[Risk]** New DB write (insert, occasional delete) on the hot path of every LLM call adds latency before the LLM call starts. **Mitigation:** negligible vs. an LLM call's own latency (hundreds of ms to tens of seconds); no different in kind from the existing `support.py` precedent, which already does this for every support request.

## Migration Plan

New table (`ai_rate_limit_events`) via a standard Alembic migration (`uv run alembic revision --autogenerate -m "add ai_rate_limit_events"`, reviewed, then `alembic upgrade head` — already wired into `scripts/start.sh`'s deploy path). Purely additive: no existing table or column changes, no backfill needed (the table starts empty; absence of rows for a user simply means "no recent activity," which is the correct default). Deploys via the standard GitOps path (merge → CI → ArgoCD sync); rollback is a plain revert plus `alembic downgrade -1` if the table itself needs removing, though leaving an unused empty/small table behind is also a safe interim rollback (no other code reads it). The concurrency guard (in-memory) has no migration or rollback concerns — it's process-local state that resets cleanly on any deploy.

## Observability

- Structured log events (JSON, matching existing `<domain>.<action>` naming):
  - `ai.rate_limit.rejected` (fields: `user_id`, `bucket`, `window_seconds`, `limit`) — WARNING, mirroring the shape of the existing `auth.google.state_cookie_mismatch`-style events.
  - `ai.concurrency_limit.rejected` (fields: `user_id`, `bucket`, `limit`) — WARNING, same shape.
  - `ai.rate_limit.near_limit` (fields: `user_id`, `bucket`, `count`, `limit`, `window_seconds`) — INFO, fires at ≥80% of the tightest threshold (Decision 6), ahead of an actual rejection.
- New Prometheus metrics in `app/observability/metrics.py`, following the `AUTH_LOGIN_REJECTIONS` label convention (`service` passed explicitly at call time; no `user_id` label — cardinality, see Decision 6):
  ```python
  AI_RATE_LIMIT_REJECTIONS = Counter(
      "ai_rate_limit_rejections_total",
      "AI endpoint requests rejected by the per-user frequency limiter",
      ["service", "bucket"],
  )
  AI_CONCURRENCY_REJECTIONS = Counter(
      "ai_concurrency_rejections_total",
      "AI endpoint requests rejected by the per-user concurrency guard",
      ["service", "bucket"],
  )
  AI_RATE_LIMIT_USAGE_RATIO = Histogram(
      "ai_rate_limit_usage_ratio",
      "Observed count / threshold at each frequency-limit check (fleet-wide distribution, not per-user)",
      ["service", "bucket"],
      buckets=(0.25, 0.5, 0.75, 0.9, 1.0),
  )
  AI_CONCURRENCY_ACTIVE = Gauge(
      "ai_concurrency_active",
      "Current in-flight LLM operations per bucket on this pod",
      ["service", "bucket"],
  )
  ```
  `AI_RATE_LIMIT_USAGE_RATIO` and `AI_CONCURRENCY_ACTIVE` are the owner-requested "metrics leading up to hitting quota" — they surface trend/pressure, not just the moment of rejection, so a bucket's threshold can be tuned before users start seeing 429s. Per-user debugging of a specific rejection uses the queryable `ai_rate_limit_events` table (Decision 6) plus the `user_id`-tagged logs above, not a metric label.
- No new OTel spans — the five routes are already auto-instrumented, and `ai.chat.request`/`ai.conversation.seed` spans already exist in `ai.py` for the surrounding operation; a rejection is a fast pre-stream path not warranting its own span breakdown.

## Open Questions

None remaining. Resolved by the owner (2026-08-12): Decision 1 (Postgres-backed), Decision 2 (in-process per-pod concurrency), Decision 4 thresholds (context-extract 50/hour, evolution 20/hour, others as proposed), PR split (one PR). Decision 6 (near-limit observability) added per owner request in the same round.
