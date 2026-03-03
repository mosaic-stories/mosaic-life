# Activity Tracking System Design

**Date:** 2026-03-02
**Status:** Approved

## Overview

A personal activity tracking system that records user interactions across all entity types (Legacy, Story, Media, Conversation) to power an activity feed and "recently worked on" views. Includes privacy opt-out and tiered data retention.

## Requirements

- **Full activity feed** tracking CRUD, views, social actions, and AI interactions
- **Personal-only** visibility — each user sees only their own activity
- **Privacy opt-out** in user preferences — disables tracking AND purges all existing data
- **Tiered retention** — high-value events kept longer than low-value events
- **Entity types:** Legacy, Story, Media, AIConversation

## Approach

**Single Activity Table** (Approach A) — one `user_activity` table following the established polymorphic pattern used by `user_favorites` and `notifications`.

### Alternatives Considered

- **Partitioned by Tier (two tables):** Ephemeral vs durable tables. Better isolation but more complex queries (UNION for unified feed) and maintenance. Violates MVP simplicity principle.
- **Event Sourcing with Materialized Views:** Append-only events with materialized views. Maximum flexibility but significant complexity overhead, refresh latency, harder privacy purges.

## Data Model

### `user_activity` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | uuid4 default |
| `user_id` | UUID (FK users) | CASCADE, indexed |
| `action` | String(50) | indexed |
| `entity_type` | String(20) | `'legacy'`, `'story'`, `'media'`, `'conversation'` — indexed |
| `entity_id` | UUID | no FK (polymorphic, entity may be deleted) |
| `metadata` | JSONB | snapshot of display-relevant fields at time of action |
| `created_at` | DateTime(tz) | indexed, used for retention cleanup |

### Indexes

- Composite: `(user_id, created_at DESC)` — feed query
- Composite: `(user_id, entity_type, entity_id, created_at DESC)` — recent items and dedup queries

### Action Vocabulary

| Tier | Actions | Retention |
|------|---------|-----------|
| **Ephemeral** | `viewed` | 30 days |
| **Standard** | `favorited`, `unfavorited`, `shared`, `joined`, `invited`, `ai_conversation_started`, `ai_story_evolved` | 90 days |
| **Durable** | `created`, `updated`, `deleted` | 365 days |

### Denormalized Metadata

The `metadata` JSONB stores a snapshot of display-relevant fields so the feed can render without joins (and works after entity deletion):

```json
{
  "title": "Grandpa's Garden Stories",
  "legacy_name": "John Smith",
  "legacy_id": "uuid-if-relevant",
  "content_preview": "First 100 chars...",
  "previous_title": "Old Title"
}
```

## Privacy & User Preferences

### Preference Extension

Add `activity_tracking_enabled` to `UserPreferences` Pydantic schema:

```python
class UserPreferences(BaseModel):
    theme: str = "warm-amber"
    default_model: str = "claude-sonnet-4.5"
    hidden_personas: list[str] = []
    activity_tracking_enabled: bool = True  # defaults to opted-in
```

Stored in existing `users.preferences` JSONB — no migration needed for the preference.

### Opt-Out Behavior

When `activity_tracking_enabled` is set to `false`:

1. **Stop recording** — guard check before every insert
2. **Purge all data** — `DELETE FROM user_activity WHERE user_id = :id`
3. **Return confirmation** in the API response

Re-enabling starts fresh — no historical backfill.

### Guard Implementation

```python
async def record_activity(session, user_id, action, entity_type, entity_id, metadata=None):
    user = await get_user(session, user_id)
    if not user.preferences.get("activity_tracking_enabled", True):
        return  # respect privacy preference
    # ... insert activity record
```

Guard lives at the service layer so it applies regardless of call site.

## API Endpoints

All routes mounted under `/api/activity`.

### `GET /api/activity` — Activity Feed

Query parameters:
- `entity_type` (optional) — filter: `legacy`, `story`, `media`, `conversation`
- `action` (optional) — filter: `viewed`, `created`, `updated`, etc.
- `cursor` (optional) — ISO timestamp for cursor-based pagination
- `limit` (optional, default 20, max 100)

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "action": "updated",
      "entity_type": "story",
      "entity_id": "uuid",
      "metadata": {"title": "...", "legacy_name": "..."},
      "created_at": "2026-03-02T10:30:00Z"
    }
  ],
  "next_cursor": "2026-03-02T10:29:00Z",
  "has_more": true
}
```

If tracking is disabled, returns empty feed with `tracking_enabled: false`.

### `GET /api/activity/recent` — Recent Items

Deduplicated by entity, grouped by `(entity_type, entity_id)` with `MAX(created_at)`.

Query parameters:
- `entity_type` (optional)
- `limit` (optional, default 10, max 50)

Response:
```json
{
  "items": [
    {
      "entity_type": "story",
      "entity_id": "uuid",
      "last_action": "updated",
      "last_activity_at": "2026-03-02T10:30:00Z",
      "metadata": {"title": "...", "legacy_name": "..."}
    }
  ]
}
```

### `DELETE /api/activity` — Clear History

Clears all activity data without disabling tracking. Returns `204 No Content`.

## Activity Recording Strategy

### Where to Record

Activity is recorded at the **route/service layer** (not via triggers or middleware) for explicit control over what gets tracked and metadata captured.

- **CRUD actions** — in route handlers after successful DB operation
- **View actions** — in GET-by-ID endpoints with deduplication
- **Social actions** — in favorite toggle, share, join, invitation endpoints
- **AI interactions** — on conversation creation and evolution session start

### View Deduplication

Only record a view if the last identical view was >5 minutes ago:

```sql
SELECT 1 FROM user_activity
WHERE user_id = :uid AND action = 'viewed'
  AND entity_type = :type AND entity_id = :eid
  AND created_at > now() - interval '5 minutes'
LIMIT 1
```

### Non-Blocking

Activity recording failures are logged but never fail the parent request. The user's primary action always succeeds.

## Data Lifecycle Management

### Retention Cleanup

A daily cleanup task enforces tiered retention:

```sql
-- Ephemeral: views > 30 days
DELETE FROM user_activity
WHERE action = 'viewed' AND created_at < now() - interval '30 days';

-- Standard: social/AI actions > 90 days
DELETE FROM user_activity
WHERE action IN ('favorited','unfavorited','shared','joined','invited',
                 'ai_conversation_started','ai_story_evolved')
  AND created_at < now() - interval '90 days';

-- Durable: CRUD actions > 365 days
DELETE FROM user_activity
WHERE action IN ('created','updated','deleted')
  AND created_at < now() - interval '365 days';
```

### Scheduling

Kubernetes CronJob calls `GET /api/internal/activity/cleanup` daily at 3 AM UTC. Deletes are batched (1000 rows per iteration) to avoid long-running transactions.

### Account Deletion

Cascade delete via FK on `user_id` — handled automatically when user deletes their account.

### Growth Projections

- ~100 bytes per record
- ~50 events/day per active user (with view dedup)
- 1000 users = ~5K events/day = ~150K/month
- Steady state after retention: ~2M rows at 1000 users

## Testing Strategy

- **Unit tests** for `record_activity` — privacy guard, deduplication, metadata capture
- **Unit tests** for retention cleanup — each tier purged at correct threshold
- **Integration tests** for API endpoints — feed pagination, filtering, cursor, empty states
- **Integration test** for opt-out flow — preference change triggers purge
- **Edge cases**: deleted entities in feed, concurrent operations, account deletion cascade

## Error Handling

- Activity recording failures are logged but swallowed
- Cleanup endpoint returns `{"deleted_count": N}` for observability
- Disabled tracking + feed request returns empty with `tracking_enabled: false` flag

## Observability

- OTel span: `activity.record` on each insert
- OTel span: `activity.cleanup` on retention job
- Prometheus counter: `activity_events_recorded_total` (labels: `action`, `entity_type`)
- Prometheus counter: `activity_events_purged_total` (label: `tier`)

## Files to Create/Modify

### New Files
- `services/core-api/app/models/activity.py` — SQLAlchemy model
- `services/core-api/app/schemas/activity.py` — Pydantic schemas
- `services/core-api/app/routes/activity.py` — API endpoints
- `services/core-api/app/services/activity.py` — Business logic (record, query, cleanup)
- `alembic/versions/xxx_add_user_activity.py` — Migration

### Modified Files
- `services/core-api/app/schemas/preferences.py` — Add `activity_tracking_enabled`
- `services/core-api/app/routes/settings.py` — Purge on opt-out
- `services/core-api/app/routes/legacy.py` — Record CRUD + view activity
- `services/core-api/app/routes/stories.py` — Record CRUD + view activity
- `services/core-api/app/routes/media.py` — Record CRUD + view activity
- `services/core-api/app/routes/ai.py` — Record conversation/evolution activity
- `services/core-api/app/routes/favorites.py` — Record favorite/unfavorite activity
- `services/core-api/app/main.py` — Register activity router
- `infra/helm/core-api/templates/cronjob.yaml` — Cleanup CronJob (or add to existing)
