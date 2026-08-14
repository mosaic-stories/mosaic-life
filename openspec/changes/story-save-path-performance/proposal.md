## Why

`PUT /api/stories/{id}` takes 20–70s in local dev because it makes a synchronous LLM call (`generate_change_summary`) while holding an open DB transaction, leaving Postgres backends `idle in transaction` for the duration and putting the connection pool at risk ([issue #112](https://github.com/mosaic-stories/mosaic-life/issues/112)).

The blocking call is the symptom. The root cause is that the save path treats *every autosave as a version boundary*: the debounced autosave introduced by `story-lifecycle-split` fires roughly once per typing pause, and each firing mints a `StoryVersion` row, generates an LLM change summary, and re-embeds the entire story. Three expensive operations run at keystroke frequency for what is, semantically, one editing session.

## What Changes

- **Autosave becomes a cheap write.** A save that only changes title/content updates the `stories` row and returns. No version row, no LLM call, no re-embedding on the save path.
- **Versions are minted at real boundaries**, not per save: entering the AI workspace, applying/accepting an AI rewrite, restoring a version, and the close of an editing session. (A standalone "publish" boundary was considered but dropped during implementation — no such action exists today; see design.md.) A version therefore represents a meaningful unit of change rather than a typing pause. **BREAKING** (behavioral, not API-shape): `GET /stories/{id}/versions` returns far fewer, coarser entries for stories edited after this change; existing rows are unaffected.
- **Change-summary generation moves off the request path** entirely. A deterministic fallback (`"Manual edit"`) is written synchronously when the version is minted, so `change_summary` is never null; the LLM result upgrades the row afterward via a background task on its own session. A slow or unavailable model degrades the summary text and never delays or fails a save.
- **The summary call is bounded**: `max_tokens` capped to a one-sentence budget (currently 2048) and wrapped in a timeout, falling back on expiry.
- **Summary diffs become meaningful**: the comparison base is the previous version's content — the state at the last boundary — rather than the content from ~1.2s earlier.
- **Re-embedding follows the same rule**, running at version boundaries instead of on every autosave, removing a full delete-and-re-embed of the story per typing pause.
- **The AI-rewrite base is corrected**: `story_evolution` currently prefers the active version's content over `stories.content`, which becomes stale mid-session under the new model.
- **A one-time migration collapses existing per-save versions** so history reads consistently across the cutover: runs of consecutive same-author `manual_edit` versions on one story are reduced to the newest snapshot in each run. The active version is never removed.

## Capabilities

### New Capabilities
- `story-versioning`: when a story version is minted and what it represents; the change-summary contract (asynchronous, always-populated, bounded, never blocking a save); the latency budget for the save path.

### Modified Capabilities
- `story-authoring`: the autosave requirement gains an explicit cost contract — a content-only save persists without minting a version and without waiting on LLM or embedding work.
- `evolve-workspace`: AI rewrite and evolution SHALL operate on the latest saved story content, guaranteeing an editing session's most recent text is what the AI sees.

## Non-goals

- Introducing a queue, outbox, or worker process. Post-commit `BackgroundTasks` on a fresh session is the existing pattern in this route (used for reindexing) and is sufficient; SNS/SQS remains deferred per `MVP-SIMPLIFIED-ARCHITECTURE.md`.
- Adding change-summary generation to the `ai-rate-limiting` 429 contract. That capability rejects *user requests* with `Retry-After`; a post-commit background summary has no client to reject. Bounding it belongs to `story-versioning`.
- Optimistic concurrency / conflict detection on concurrent edits from multiple tabs. Last-write-wins is existing behavior and stays unchanged.
- Any change to Evolve's internals — tool rail, rewrite pipeline, diff review.

## Open Questions

All resolved by owner decision on 2026-08-14. No questions outstanding.

1. **Boundary set / session-close detection.**
   → Decision: **Server-side idle rule as the source of truth, plus a best-effort client hint.** The server mints a version for a closed session when a save arrives (or version history is read) more than an idle threshold after the last save, with a max-interval cap so a long continuous session still produces snapshots. The Edit page additionally posts an idempotent boundary signal on navigate-away for immediacy, but correctness never depends on it arriving. The full boundary set is: publish, entering the AI workspace, AI rewrite applied / draft approved, version restore, and session close.
2. **Safety net for long sessions.**
   → Decision: **Yes** — subsumed by the max-interval cap in decision 1.
3. **Existing version rows.**
   → Decision: **One-time collapse migration.** Runs of consecutive same-author `manual_edit` versions collapse to the newest snapshot in each run. The active version is never deleted. Because this discards restorable snapshots, it ships with a dry-run/report mode and a reviewed row count before the destructive step (see design.md).
4. **Summary generation timing.**
   → Decision: **Background task at each boundary**, post-commit on a fresh session, matching the existing reindex pattern in this route. Lazy-on-read is not needed once boundaries cut call volume.
5. **Re-embedding scope.**
   → Decision: **In scope for this change.** Re-embedding moves to the same boundary triggers.

## Impact

**Backend** (`services/core-api`)
- `app/services/story.py` — `update_story()`: drop the inline `generate_change_summary` + `create_story_version` block from the content-changed path.
- `app/services/story_version.py` — `create_version()`: fallback summary written at mint time; boundary-aware call sites.
- `app/services/change_summary.py` — `max_tokens` cap, timeout, base-content semantics.
- `app/routes/story.py` — post-commit background summary task; reindex trigger moves to boundaries.
- `app/services/story_evolution.py:967` — read `stories.content` as the rewrite base instead of the active version's content.
- New idempotent boundary endpoint plus the server-side idle evaluation invoked from the save and version-list paths.

**Frontend** (`apps/web`)
- `src/features/story/components/StoryEditPage.tsx` — post the best-effort session-close boundary on navigate-away. Autosave itself is unchanged; it simply gets fast.

**Data**
- Tracking for last-save time per story (column or derived from `stories.updated_at`, see design.md); `story_versions` growth rate drops sharply and the soft-cap warning in `list_versions` stops firing during normal editing.
- One-time collapse migration over existing `story_versions` rows — destructive, ships with a dry-run report.

**Docs / specs**
- Delta specs for `story-authoring` and `evolve-workspace`; new spec for `story-versioning`.
- Closes [issue #112](https://github.com/mosaic-stories/mosaic-life/issues/112).
