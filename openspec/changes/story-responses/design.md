## Context

The Read page (from the `story-lifecycle-split` change) renders a story with no way to respond to it, and the existing notification/activity plumbing (`services/core-api/app/{models,services,routes}/notification.py`, `apps/web/src/features/activity/`) has no story-level event to carry. Two close analogs already exist in the codebase and set the conventions this change follows:

- **`UserFavorite`** (`app/models/favorite.py`, `app/services/favorite.py`, `app/routes/favorite.py`): a per-user toggle on an entity, with a **denormalized counter column** on the target entity (`Legacy.favorite_count`) maintained by atomic DB-side increment/decrement in the same transaction as the toggle row insert/delete. This is the direct template for reactions.
- **Activity feed cursor pagination** (`app/routes/activity.py`, `app/services/activity.py`): ISO-timestamp `cursor` query param, `next_cursor` + `has_more` in the response — the established cursor pattern (the "Cursor pagination per API standards" note in the proposal refers to this, not the offset/limit used by the older `favorite`/`notification` list endpoints).
- **Notification fan-out** (`app/services/notification.py`): `create_notification(db, user_id, notification_type, title, message, link, actor_id, resource_type, resource_id)` — a plain async function called inline by the mutating route/service, not an event bus. Responses/reactions call this directly.

## Goals / Non-Goals

**Goals:**
- Responses and reactions follow the same data-access and membership-gating rules as reading the story itself (no new access model).
- Counters (`response_count`, per-reaction counts) are cheap to read on list/card surfaces — no N+1 aggregate queries.
- Reuse `create_notification` as-is; no new notification transport.
- Invite-moment trigger logic is computed from data that already exists (published story count, member count) rather than a new "first publish" event log.

**Non-Goals:**
- No new event-bus/outbox plumbing — this MVP still writes directly (per `MVP-SIMPLIFIED-ARCHITECTURE.md`).
- No threaded replies, no reactions-on-responses, no rich text — flat list, plain text + line breaks only (unchanged from proposal).
- No email notification path.
- No change to the story visibility/access rules in `story-access` — responses/reactions gating is a new, narrower rule (legacy members only) layered on top, not a modification of existing scopes.

## Decisions

### 1. Data model: two new tables, denormalized counters on `stories`

`story_responses`:
| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `story_id` | UUID fk → `stories.id`, `ondelete=CASCADE` | indexed |
| `user_id` | UUID fk → `users.id`, `ondelete=CASCADE` | indexed |
| `body` | Text | plain text; line breaks preserved, no HTML |
| `created_at` | timestamptz | server default now |
| `edited_at` | timestamptz, nullable | set on edit; presence drives the "edited" marker |
| `deleted_at` | timestamptz, nullable | soft delete, so notification history and "also responded" logic stay consistent after removal |

`story_reactions`:
| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `story_id` | UUID fk → `stories.id`, `ondelete=CASCADE` | indexed |
| `user_id` | UUID fk → `users.id`, `ondelete=CASCADE` | indexed |
| `reaction_type` | String(20), one of `heart`/`candle`/`smile` | |
| `created_at` | timestamptz | |

Unique constraint `(story_id, user_id, reaction_type)` — matches `UserFavorite`'s `uq_user_favorite`, giving "one of each type per user, toggleable" for free via insert-or-delete.

`stories` gains: `response_count`, `reaction_heart_count`, `reaction_candle_count`, `reaction_smile_count` (all `Integer, server_default="0"`), maintained by atomic `UPDATE ... SET count = count ± 1` in the same DB transaction as the response/reaction insert/delete — the same pattern `favorite.py` uses for `Legacy.favorite_count`.

**Alternatives considered:**
- *Compute counts via `COUNT()` subquery at read time* — avoids denormalization drift, but every story list/card render would need an aggregate join; rejected to match the existing `favorite_count` precedent and keep list queries cheap.
- *Single JSONB `reaction_counts` column instead of three integer columns* — more flexible if the reaction set grows, but the set is explicitly fixed (non-goal: no new reaction types without a follow-up spec change) and three typed columns are simpler to query/index and keep mypy/Pydantic types exact.
- *Hard delete responses instead of soft delete* — simpler, but breaks "also responded" notification history and would let a removed response's notification silently 404; soft delete (`deleted_at`) keeps the row for notification/audit purposes and is filtered out of list/serializer output.

### 2. Access gating: reuse the private-story membership check, narrowed to non-pending members

Per the source review's Q1 decision, responses/reactions are **legacy-member-only**, even on `public` stories (narrower than `story-access`'s existing read rules). The route dependency reuses the same "non-pending member of any legacy the story is associated with, or the story's author" check that `story-access`'s private-story requirement already implements, rather than the story's own visibility scope. This is intentionally a *new, additional* gate layered on top of read access — it does not change any `story-access` requirement, since a user who can read a public story may still be denied the ability to respond to it.

### 3. Notification fan-out: direct calls, mirroring the proposed-direction "also responded" model

On response create: notify the story author (if not the actor) with `notification_type="story_response"`, then notify each distinct prior responder (excluding the actor and the author, to avoid duplicate/self notification) with the same type — implementing "also responded" without threading. On reaction create: notify the story author only (if not the actor), `notification_type="story_reaction"`. Both call `create_notification` synchronously in the same request as the mutation, matching the existing favorite/notification code — no background job.

### 4. Invite-moment trigger: derived state, not a stored "first publish" event

The frontend already has the data needed to compute the moment: the legacy's member count and the count of published stories. The prompt shows when `published_story_count == 1 && member_count == 1` (i.e., right after the founding member's first publish, or right after creating a legacy with no stories yet, per the proposal). No new "first publish" event is stored — this avoids adding an events table for a condition fully derivable from existing counts.

Dismissal is legacy-scoped, not user-scoped (per proposal: "Dismissal persists per legacy"), so it needs server-side storage: add `Legacy.invite_prompt_dismissed_at` (timestamptz, nullable). Any member dismissing the card sets it once; the prompt never reappears for that legacy. This is a single-column migration, following the same low-ceremony pattern as `favorite_count`.

**Alternative considered:** per-user dismissal (localStorage or a per-user dismissal table) — rejected because the proposal explicitly wants one dismissal to hide the prompt for everyone on that legacy, and a single column is simpler than a join table for a boolean-ish, single-fire flag.

### 5. Activity feed language: template map + drop-list, evaluated at read time

`features/activity/` already renders `ActivityItem` (action, entity_type, entity_id, metadata). Add a template function keyed by `(action, entity_type)` that returns a human sentence (e.g. `story.created` + `story` → "{actor} added a memory to {legacy}'s legacy"); actions with no template entry are filtered out of the feed response before serialization (so the API — not just the UI — never emits raw system events, matching the acceptance criterion "no raw filenames or system identifiers"). Filtering happens server-side in `activity_service.get_activity_feed`/`get_social_feed` so paginated `limit` counts reflect only feed-worthy items.

## Risks / Trade-offs

- **[Denormalized counters can drift from actual rows]** → Toggle/response services are the only writers of the counters and always update them in the same transaction as the row change (per `favorite.py`'s pattern); no other code path touches these tables.
- **[Soft-deleted responses still count toward `response_count` until decremented]** → Delete endpoint decrements `response_count` in the same transaction as setting `deleted_at`, identical to how favorite removal decrements `favorite_count`.
- **[Filtering activity-feed events server-side could hide items an operator wants for debugging]** → Debugging uses structured logs/OTel traces, not the user-facing activity feed; no change to log verbosity.
- **[Legacy-scoped invite-dismissal means one member can hide the prompt for co-members who haven't seen it]** → Accepted per the proposal's explicit "dismissal persists per legacy" decision; revisit only if user feedback surfaces this as a problem.

## Migration Plan

Two additive Alembic migrations (no data backfill needed — all new columns default to `0`/`NULL`):
1. Create `story_responses`, `story_reactions` tables; add `response_count`, `reaction_heart_count`, `reaction_candle_count`, `reaction_smile_count` to `stories` (`server_default="0"`, `nullable=False`).
2. Add `invite_prompt_dismissed_at` to `legacies` (`nullable=True`).

Both are additive/backward-compatible — safe to deploy ahead of the frontend that reads them. Rollback is a straight `alembic downgrade -1` per migration; no destructive step since nothing existing is altered.

## Observability

- Spans: `story_response.create`, `story_response.update`, `story_response.delete`, `story_reaction.toggle` (component `story-responses`), following the existing `story.create`/`media.upload`-style span naming.
- Logs: `story_response.created` / `.updated` / `.deleted`, `story_reaction.toggled`, `notification.created` (already emitted by `create_notification`) — structured JSON with `story_id`, `user_id`, `legacy_id` fields alongside the standard `service`/`component`/`version`/`request_id` fields.
- Metrics: counters `story_responses_created_total`, `story_reactions_toggled_total` labeled by `reaction_type` where applicable, following the existing Prometheus label set (`service`, `component`, `version`).
