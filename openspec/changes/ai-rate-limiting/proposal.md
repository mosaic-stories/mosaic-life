## Why

None of the AI/LLM-invoking endpoints enforce per-user rate limiting. Each call triggers an LLM completion — the most expensive operation in the system, with a 600s httpx timeout and up to 4096 output tokens (`adapters/litellm.py:66`) — and there is no throttle on call frequency and no cap on concurrent in-flight streams per user. A logged-in (or compromised/automated) user can open unlimited conversations, stream completions in parallel, and repeatedly trigger context extraction / rewrite / evolution generate+revise on any story they can read, driving unbounded Bedrock/LiteLLM spend and starving server worker connections for other users. `routes/support.py` is the only rate-limited route in the codebase today; the far more expensive AI endpoints have nothing.

Requirement source: [issue #100](https://github.com/mosaic-stories/mosaic-life/issues/100) (automated security review, severity **Medium**).

## What Changes

- A shared, per-user rate-limiting mechanism is introduced and applied to every LLM-invoking route, keyed on `session.user_id` (not IP — all target routes already require auth):
  - `routes/ai.py`: `send_message` (chat completion) and `seed_conversation` (opening-message generation)
  - `routes/rewrite.py`: `rewrite_story`
  - `routes/story_context.py`: `extract_context` (`POST /extract`) — gates the route before the background extraction task is scheduled, not the task itself
  - `routes/story_evolution.py`: `generate_draft` (`/generate`) and `revise_draft` (`/revise`)
- A per-user concurrency cap on in-flight LLM streams/operations, refusing a new one once the user already has N open.
- Rate-limit and concurrency-cap rejections return `429 Too Many Requests` with a `Retry-After` header, so the frontend can back off instead of surfacing a generic error.
- New Prometheus counter and structured log events for rejections, following the existing `AUTH_LOGIN_REJECTIONS`-style observability precedent, so cost-abuse attempts are visible to ops.
- Observability also covers *approaching* the limit, not just rejections: a usage-ratio metric and near-limit debug logging so an engineer can see a user trending toward a cap (or a bucket's overall usage climbing) before it starts producing 429s — see design.md's Observability section.
- Mechanism: **Postgres-backed** (owner-confirmed), correct across the 2 production replicas, matching the existing `support.py` precedent. Concurrency cap: **in-process per-pod semaphore** (owner-confirmed), accepting a documented ~2x cross-replica gap in exchange for directly protecting the per-pod resource actually at risk. Full rationale and rejected alternatives in design.md Decisions 1-2.

## Capabilities

### New Capabilities
- `ai-rate-limiting`: Per-user request-frequency and concurrency limits on all LLM-invoking endpoints, including the 429/Retry-After contract and rejection observability. No existing spec covers AI endpoint behavior or abuse controls.

### Modified Capabilities
(none — no existing spec in `openspec/specs/` documents AI/chat/rewrite/evolution endpoint behavior, so there is nothing to amend; this is net-new coverage)

## Impact

- **Backend only** (`services/core-api`), no frontend contract change beyond handling an already-standard `429` (existing SSE error-event handling patterns in the frontend already tolerate stream failures):
  - `app/routes/ai.py`, `app/routes/rewrite.py`, `app/routes/story_context.py`, `app/routes/story_evolution.py`: each target handler gains a rate-limit + concurrency check immediately after `require_auth`.
  - New `app/services/ai_rate_limit.py` (Postgres-backed frequency limiter) and `app/services/ai_concurrency.py` (in-process concurrency guard) — see design.md.
  - New Alembic migration adding `ai_rate_limit_events` (Postgres-backed mechanism, confirmed).
  - `app/observability/metrics.py`: new rejection counters plus a usage-ratio metric for near-limit visibility (design.md Observability).
  - No new external dependency (`slowapi`/Redis considered and rejected in design.md) — no Redis is deployed in this stack today (`infra/compose/docker-compose.yml` has no redis service) and CLAUDE.md's MVP architecture explicitly anchors on "PostgreSQL for everything, no distributed systems."
  - `services/core-api/app/main.py`: no new global middleware — per-route calls, matching the per-endpoint-class thresholds (design.md Decision 3).

## Non-goals

- No IP-based or unauthenticated-request rate limiting — all target endpoints already require a session; this change is scoped to authenticated abuse.
- No change to `routes/support.py`'s existing rate-limit implementation, though the new shared mechanism may later be a candidate to migrate it onto (not in scope here).
- No per-tenant or per-organization quotas — single-tenant MVP, per-user only.
- No changes to LiteLLM/Bedrock-side quotas or budgets — this is an application-layer control only.
- No frontend UI changes for surfacing rate-limit state (e.g., a "you're sending messages too fast" banner) beyond the existing generic SSE error-event handling — a dedicated UX treatment is a possible follow-up, not in scope here.
- No changes to non-LLM endpoints.

## Open Questions

All resolved by the owner (2026-08-12):

1. ~~**Mechanism**~~ — **Resolved: Postgres-backed.**
2. ~~**Concurrency-cap correctness across the 2 production replicas**~~ — **Resolved: in-process per-pod semaphore**, accepting the documented cross-replica gap.
3. ~~**Per-endpoint-class thresholds**~~ — **Resolved:** `chat_message` 20/min + 200/hour (concurrency 2), `story_rewrite` 10/hour (concurrency 1), `story_context_extract` 50/hour (concurrency 1), `story_evolution` 20/hour (concurrency 1). See design.md Decision 4.
4. ~~**PR split**~~ — **Resolved: one PR** for the whole change.

No open questions remain blocking `/opsx:apply`.
