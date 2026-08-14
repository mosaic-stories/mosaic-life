Each group below is sized to land as one PR (< 400 LOC). Groups are ordered by dependency; the system is coherent and shippable at the end of every group.

## 1. Session state and the boundary helper (PR 1)

- [x] 1.1 Add `stories.pending_edit_since TIMESTAMPTZ NULL` to the `Story` model and generate the Alembic revision (`uv run alembic revision --autogenerate`); confirm the downgrade drops the column and no backfill is needed
- [x] 1.2 Add settings: `story_edit_session_idle_seconds` (default 900), `story_edit_session_max_seconds` (default 1800), `change_summary_timeout_seconds` (default 10)
- [x] 1.3 Harden `generate_change_summary()` — `max_tokens` 2048 → 96, wrap in `asyncio.timeout(...)`, accept the base content explicitly, and wrap in `ai_concurrency_guard(bucket="change_summary")` treating `AIConcurrencyLimitError` as a fallback outcome rather than an error
- [x] 1.4 Add the metrics from design.md Observability to `app/observability/metrics.py` (`core_api_story_version_mints_total`, `core_api_story_change_summary_total`, `core_api_story_change_summary_duration_seconds`, `core_api_story_save_duration_seconds`)
- [x] 1.5 Implement `mint_version_at_boundary(db, story, *, reason, user_id, background_tasks)` in `app/services/story_version.py`: call `create_version()` with the deterministic fallback summary, clear `pending_edit_since`, emit the `story.version.mint` span and `story.version.minted` log, and schedule the post-commit summary + reindex tasks
- [x] 1.6 Implement the post-commit summary task — fresh session via `get_db_for_background()`, update `change_summary` only when it still equals the fallback, emit `story.change_summary` span and outcome metric
- [x] 1.7 Rewrite `update_story()`: drop the inline `generate_change_summary` + `create_story_version` block, set `pending_edit_since` on the first content-changing save of a session, and evaluate the idle / max-interval rules before applying the incoming update (minting from the stored content, then applying)
- [x] 1.8 Remove the per-save `background_reindex` from `routes/story.py`; reindexing now runs only from the boundary helper
- [x] 1.9 Unit tests: no version on a content-only save; idle threshold mints exactly one version holding the pre-idle content; max-interval mints and opens a new session; summary task upgrades the fallback but never overwrites a restoration summary; timeout and concurrency rejection both leave the fallback in place
- [x] 1.10 Gate: `just validate-backend` and `uv run pytest` pass

## 2. Remaining boundaries and read-path evaluation (PR 2)

- [ ] 2.1 Route the existing minting call sites (`restore_version`, `approve_draft`, evolution draft approval) through `mint_version_at_boundary` so they also clear `pending_edit_since` and schedule background work consistently
- [ ] 2.2 Add the publish boundary — a story transitioning draft → published mints with `reason="publish"`
- [ ] 2.3 Add the AI-workspace entry boundary — mint with `reason="evolve_entry"` when an author enters Evolve with an open session
- [ ] 2.4 Change the AI-rewrite base at `story_evolution.py:967` to read `stories.content` instead of the active version's content; audit `story_evolution.py:144` and `:862` for the same assumption
- [ ] 2.5 Add `POST /api/stories/{story_id}/edit-session/close` — idempotent, mints only when `pending_edit_since IS NOT NULL`, requires auth and story write access
- [ ] 2.6 Evaluate the idle rule on the version-list read path, minting via `BackgroundTasks` so the GET response is not delayed
- [ ] 2.7 Unit tests per `story-versioning` scenarios: publish captures a version; entering Evolve captures the pre-AI state; rewrite uses the latest saved content; close endpoint is a no-op when called twice; history read after idle shows the session's version
- [ ] 2.8 Gate: `just validate-backend` and `uv run pytest` pass

## 3. Client session-close hint (PR 3)

- [ ] 3.1 Post the close-session signal from `StoryEditPage.tsx` on navigate-away / unmount using `fetch(..., { keepalive: true })` with the CSRF header — best-effort, never blocking navigation, never surfacing an error to the author
- [ ] 3.2 Confirm autosave behavior is otherwise untouched (serialization, indicator states, retry affordance)
- [ ] 3.3 Vitest coverage: close is posted once on unmount after edits, not posted when nothing was edited, and a failed close never changes the save indicator
- [ ] 3.4 Gate: `just validate-frontend` and `npm run test` pass

## 4. Verification in the running stack

- [ ] 4.1 Bring up the compose stack and drive the real Edit page: type continuously, confirm autosave stays fast and version history gains no entries during the session
- [ ] 4.2 Measure `PUT /api/stories/{id}` latency under a deliberately slow model and confirm it is unaffected — this is the issue #112 acceptance check
- [ ] 4.3 Inspect `pg_stat_activity` during repeated saves and confirm no backend sits `idle in transaction` across a model call
- [ ] 4.4 Idle past `story_edit_session_idle_seconds` (temporarily lowered), save again, and confirm exactly one version appears holding the pre-idle content with a real generated summary
- [ ] 4.5 Confirm the story is re-indexed at the boundary and searchable with the session's final text

## 5. Collapse migration for existing versions (PR 4, runs after PRs 1–3 are deployed)

- [ ] 5.1 Audit every FK into `story_versions.id` and confirm the exclusion list in design.md is complete (currently `stories.active_version_id`, `story_evolution_sessions.draft_version_id`)
- [ ] 5.2 Implement run detection: per story, maximal sequences of consecutive versions sharing `source='manual_edit'` and `created_by`, split where the gap between versions exceeds the idle threshold; keep the newest of each run
- [ ] 5.3 Apply the exclusions — never delete the row referenced by `stories.active_version_id`, any version with `status IN ('active','draft')`, any version referenced by `story_evolution_sessions.draft_version_id`, or any version whose number is referenced by another row's `source_version`
- [ ] 5.4 Implement dry-run report mode: per-story counts, total deletions, and rows retained by each exclusion rule
- [ ] 5.5 Tests over fixture data covering each exclusion rule and the gap-splitting boundary
- [ ] 5.6 Run the dry run against a production snapshot and review the totals with the owner **before** the destructive step
- [ ] 5.7 Take a database snapshot, then run the destructive step; record the snapshot identifier in the PR as the rollback path

## 6. Close-out

- [ ] 6.1 Update `docs/architecture/` or `docs/developer/` only if the boundary model needs a durable home beyond the spec
- [ ] 6.2 Reference this change ID in each PR and link [issue #112](https://github.com/mosaic-stories/mosaic-life/issues/112); close the issue when PR 1 lands
- [ ] 6.3 Run `/opsx:archive` after the final PR merges
