## Context

`PUT /api/stories/{id}` currently does three expensive things on every content-changing save: an inline LLM change-summary call inside the open transaction, a `StoryVersion` INSERT, and a background full re-embed of the story. The debounced autosave from `story-lifecycle-split` fires roughly once per typing pause, so all three run at keystroke frequency. See [proposal.md](proposal.md) and [issue #112](https://github.com/mosaic-stories/mosaic-life/issues/112) for motivation and measurements.

Relevant current state:

- `update_story()` ([story.py:1233](../../../services/core-api/app/services/story.py)) calls `generate_change_summary()` then `create_version()` before `db.commit()`. The transaction opened by the initial access-check SELECT is held across the LLM round trip.
- `create_version()` ([story_version.py:374](../../../services/core-api/app/services/story_version.py)) owns the version invariants: deactivate the current active version, mark any draft stale, insert, and repoint `stories.active_version_id`.
- The route already runs post-commit work via `BackgroundTasks` + `get_db_for_background()` for reindexing ([routes/story.py:277](../../../services/core-api/app/routes/story.py)).
- `generate_change_summary()` uses `max_tokens=2048` for a one-sentence output, has no timeout, and — unlike every other LLM path — passes through neither `ai_rate_limit` nor `ai_concurrency_guard`.
- `story_evolution` prefers the *active version's* content over `stories.content` as the AI-rewrite base ([story_evolution.py:967](../../../services/core-api/app/services/story_evolution.py)).

Constraint: no worker process or queue is available (MVP architecture defers SNS/SQS), so all deferred work must hang off a request via `BackgroundTasks` or be evaluated lazily on a subsequent request.

## Goals / Non-Goals

**Goals:**
- A content-only save is a single `UPDATE stories` and returns without waiting on any LLM or embedding work.
- No DB transaction is held open across an external network call on the save path.
- A version represents one editing session or one deliberate action, not one typing pause.
- `change_summary` is never null; LLM unavailability degrades its text, never the save.
- Existing version history reads consistently across the cutover.

**Non-Goals:**
- Queue/outbox/worker infrastructure.
- Rejecting saves under load (change-summary work is bounded by dropping to fallback, not by 429 — see [proposal.md](proposal.md) Non-goals).
- Optimistic concurrency between tabs; last-write-wins is unchanged.
- Changes to Evolve internals beyond the rewrite-base correction.

## Decisions

### Decision 1: Session state is a single nullable timestamp on `stories`

The server must answer two questions: *are there edits not yet captured in a version?* and *when did this editing session start?* One nullable column answers both.

`stories.pending_edit_since TIMESTAMPTZ NULL`
- NULL → every saved edit is captured in a version; no session open.
- non-NULL → uncaptured edits exist, and this is when the session began.

Transitions:
- Content-changing autosave: if NULL, set to `now()`. Otherwise leave untouched (session continues).
- Version minted at any boundary: set back to NULL.
- Combined with the existing `stories.updated_at` (last save time), this supports both the idle rule (`updated_at` older than the idle threshold) and the max-interval cap (`pending_edit_since` older than the cap).

*Options considered:*

| Option | Trade-off |
|---|---|
| **A. `pending_edit_since` column (recommended)** | One nullable timestamp, exact, no extra reads on the save path. Requires a migration. |
| B. Derive by comparing `stories.content` to the active version's content | Zero schema change, but loads full version text on every save purely to compare, and can't express session start for the max-interval cap. |
| C. New `story_edit_sessions` table | Richest history and per-device attribution, but a whole table and lifecycle for state that is one timestamp. Over-built for the need. |

**Recommendation: A.**

### Decision 2: Boundary evaluation is lazy and server-authoritative, with a client hint

With no worker process, "the session ended" can only be noticed when some later request arrives. Evaluation happens in two places:

1. **On the next save** — before applying the incoming update, if `pending_edit_since IS NOT NULL` and `updated_at < now() - idle_threshold`, mint a version capturing the *currently stored* content (the state the previous session ended at), then apply the new save and open a fresh session. Also mint when `now() - pending_edit_since > max_interval`, capping long continuous sessions.
2. **On version-history read** — the same idle check, so opening history after an editing session shows that session's version rather than nothing.

Both thresholds are settings (`story_edit_session_idle_seconds`, default 900; `story_edit_session_max_seconds`, default 1800).

The client posts a best-effort hint on navigate-away to `POST /api/stories/{story_id}/edit-session/close`, which mints only when `pending_edit_since IS NOT NULL` and is otherwise a no-op — safe to call repeatedly and safe to lose. It uses `fetch(..., { keepalive: true })` rather than `navigator.sendBeacon`, because sendBeacon cannot set the CSRF header the platform requires.

*Trade-off accepted:* minting on a GET makes a read path write. It is a bounded local INSERT with no external call, and the alternative — a periodic sweep — needs the worker process this architecture defers. Documented rather than hidden.

### Decision 3: One boundary helper owns all deferred work

All boundaries route through a single service function rather than repeating the pattern at six call sites:

```
mint_version_at_boundary(db, story, *, reason, user_id, background_tasks)
```

It calls the existing `create_version()`, writes the deterministic fallback summary inline so the column is never null, clears `pending_edit_since`, and schedules two post-commit background tasks: change-summary generation and re-embedding. Boundaries: `publish`, `evolve_entry`, `ai_rewrite_applied`, `restore`, `session_close`, `session_idle`, `session_max_interval`.

**`reason` and `source` are different fields and must not be conflated** (clarified during implementation, 2026-08-14). `story_versions.source` describes *what produced the content* and keeps its existing vocabulary — it is user-visible in version history via `getSourceLabel`, and the collapse migration keys on `source='manual_edit'`. `reason` describes *why the version was minted now* and is observability-only: it appears in the span attribute, the metric label, and the log event, and is never persisted. The helper maps one to the other:

| `reason` | persisted `source` |
|---|---|
| `session_close`, `session_idle`, `session_max_interval`, `publish`, `evolve_entry` | `manual_edit` |
| `ai_rewrite_applied` | `ai_enhancement` |
| `restore` | `restoration` (with `source_version`) |

This keeps `FALLBACK_SUMMARIES` lookups working, keeps history labels human-readable, and leaves the collapse migration's run detection valid.

**Correction found during implementation (2026-08-14): "publish" is not a distinct boundary.** The proposal listed "publish (draft→published)" as a boundary separate from "AI rewrite applied / draft approved." Implementation found this doesn't correspond to any real code path: `StoryUpdate` has no `status` field, the plain Edit page never sends one, and the only place `story.status` transitions `draft → published` is inside `accept_session()` ([story_evolution.py:883](../../../services/core-api/app/services/story_evolution.py)) — which is the *same event* as draft approval. There is no standalone publish action to hang a separate reason on. The reason set is therefore six, not seven: `evolve_entry`, `ai_rewrite_applied`, `restore`, `session_close`, `session_idle`, `session_max_interval`. `ai_rewrite_applied` covers both `approve_draft()` (story_version.py) and `accept_session()` (story_evolution.py) — accept's status flip to `published` is an unrelated side effect of the same call, not a second boundary. If the product later adds a real "Publish" affordance to the plain editor, it gets its own reason then.

### Decision 3a: Promoting an existing draft is not the same operation as minting a new version

`mint_version_at_boundary` always creates a new `StoryVersion` row via `create_version()`. But `approve_draft()` and `accept_session()` don't create anything — they promote an *already-existing* draft row (created earlier by an AI rewrite, at `rewrite.py:332` or `story_evolution.py:1070`) to `status="active"`. Routing them through `mint_version_at_boundary` unmodified would mint a second, redundant active version on top of the promoted draft, corrupting the draft→active semantics the frontend depends on (`get_draft_version`, the draft indicator in `VersionsTool.tsx`).

The fix: extract the shared tail of `mint_version_at_boundary` (clear `pending_edit_since`, emit the span/metric/log, schedule the two background tasks) into a private `_finalize_mint()` used by both:

- `mint_version_at_boundary(...)` — unchanged for `evolve_entry`, `restore`, and the three session reasons: creates a new row via `create_version()`, then finalizes.
- `promote_draft_at_boundary(db, story, draft, *, reason, user_id, background_tasks)` — new, for `ai_rewrite_applied` only: deactivates the current active version, promotes `draft` in place (`status="active"`), backfills `draft.change_summary` with the deterministic fallback if still null (true for every draft today — neither creation site sets one), updates `story.title`/`content`/`active_version_id`, then finalizes using the same shared tail.

Both existing route-level `_queue_reindex()` calls in `routes/story_version.py` (on `approve_draft` and `restore_version`) are removed — reindexing now happens once, inside the boundary helper, not twice.

Re-embedding moves here from the PUT route, which is what takes it off the per-autosave path.

### Decision 4: Change summary is a post-commit upgrade, never a blocking call

The background task opens its own session via `get_db_for_background()`, generates the summary, and updates the row **only if `change_summary` still equals the fallback** — so it can never clobber a restore summary or a racing writer.

Hardening applied at the same time:
- `max_tokens` 2048 → 96 (one sentence).
- `asyncio.timeout(settings.change_summary_timeout_seconds)`, default 10s, falling back on expiry.
- Wrapped in `ai_concurrency_guard(bucket="change_summary")`. Because there is no client to reject, `AIConcurrencyLimitError` keeps the fallback and logs rather than raising.
- Base content is the previous version's content — the state at the last boundary — so the diff describes the session, not the last 1.2 seconds.

### Decision 5: AI-rewrite base becomes `stories.content`

Under the new model the active version lags the story during an open session, so [story_evolution.py:967](../../../services/core-api/app/services/story_evolution.py)'s preference for active-version content would feed the model stale text. It changes to read `stories.content` directly. Entering Evolve is also a boundary, so a version still exists marking the pre-AI state.

### Observability

**Spans**
- `story.version.mint` — attributes `story_id`, `version_number`, `boundary_reason`.
- `story.change_summary` — attributes `story_id`, `version_id`, `outcome`, `model_id`.
- Existing `ingestion.index_story` is unchanged, now called from the boundary helper.

**Metrics** (following the existing `core_api_*` convention in `app/observability/metrics.py`)
- `core_api_story_version_mints_total{reason}`
- `core_api_story_change_summary_total{outcome}` — `outcome` ∈ `generated | fallback_timeout | fallback_error | fallback_concurrency`
- `core_api_story_change_summary_duration_seconds`
- `core_api_story_save_duration_seconds{minted}`

**Log events** (structured, existing field conventions)
- `story.version.minted` — `story_id`, `version_number`, `reason`, `user_id`
- `story.edit_session.idle_boundary` — `story_id`, `idle_seconds`
- `story.change_summary.completed` / `story.change_summary.fallback` — `story_id`, `version_id`, `outcome`, `latency_ms`

## Risks / Trade-offs

- **Search results go stale during an editing session** (re-embedding no longer runs per save) → Staleness is bounded by the idle threshold, and the author reads their own story from `stories.content`, not the index. Acceptable for a memorial-stories corpus where search is discovery, not correctness.
- **A version for the final session appears late if the client hint is lost** (tab crash, offline) → `stories.content` always holds the text, so nothing the user typed is lost; only history granularity is deferred until the next save or history read. The idle check on the read path makes the common case invisible to users.
- **Minting on a GET is surprising** → Confined to one helper, no external calls, logged with `reason=session_idle`, and documented in the spec.
- **The collapse migration destroys restorable snapshots** → Two-step with a dry-run report and a DB snapshot first; see Migration Plan.
- **`change_summary` may briefly read "Manual edit"** before the background task lands → It is a truthful description, not a placeholder; the UI needs no loading state.
- **Long single-session versions lose intermediate granularity** compared to today → This is the intended change (per-keystroke versions are noise), bounded by the max-interval cap.

## Migration Plan

**Schema (reversible)**
- Alembic revision adding `stories.pending_edit_since TIMESTAMPTZ NULL`, default NULL. Backfill is not required — NULL correctly means "no open session" for every existing row. Downgrade drops the column.

**Data: collapse of existing per-save versions (destructive, not reversible by downgrade)**

Per story, order versions by `version_number` and split into runs, where a run is a maximal sequence of versions that share `source = 'manual_edit'` and `created_by`, with consecutive versions no further apart than the idle threshold. Within each run, keep the newest version and delete the rest.

Never deleted, regardless of run membership:
- the row referenced by `stories.active_version_id`
- any version with `status IN ('active', 'draft')`
- any version referenced by `story_evolution_sessions.draft_version_id`

Implementation must first audit all FKs into `story_versions.id` (currently `stories.active_version_id` and `story_evolution_sessions.draft_version_id`, both `ON DELETE SET NULL`) and confirm the exclusion list is complete. `story_versions.source_version` holds a version *number*, not an FK — collapsing can leave a restore pointer referencing a deleted number, so the report must count those and they must be excluded from deletion too.

Rollout:
1. Ship the schema migration and application change first. The new code is correct against un-collapsed history.
2. Run the collapse in **report mode** (`--dry-run`): per-story counts, total rows that would be deleted, and any excluded-by-rule rows. Review the totals with the owner.
3. Take a database snapshot.
4. Run the destructive step.

**Rollback**
- Application and schema: standard Alembic downgrade plus redeploy; the old code path works against the new column (it simply ignores it).
- Collapsed rows: **restore from the snapshot taken in step 3.** There is no downgrade path that recovers deleted versions — this is why the collapse ships separately from the code change and behind a reviewed dry run.

## Open Questions

None outstanding. The five questions from [proposal.md](proposal.md) were resolved by owner decision on 2026-08-14 and are recorded there.
