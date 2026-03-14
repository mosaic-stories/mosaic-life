# Favorites System Design

**Date:** 2026-03-02
**Status:** Approved
**Approach:** Inline Count Column (denormalized counts on entity tables)

## Overview

Full favorites system for stories, legacies, and media. Users can favorite any entity they can view. Favorite counts are publicly visible; individual favorites are private to the user. A "My Favorites" section on the homepage shows the logged-in user's saved items.

## Requirements

- **Scope:** Stories, legacies, and media — all three in one pass
- **Storage:** Single polymorphic `user_favorites` table with `entity_type` discriminator
- **Visibility:** Public favorite counts on entities, private identity (who favorited)
- **Homepage:** Single mixed "My Favorites" section with type filter tabs
- **Existing UI:** Non-functional heart icon on StoryCard needs to become functional

## Database Design

### New table: `user_favorites`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `user_id` | UUID | FK -> users.id (CASCADE), NOT NULL, indexed |
| `entity_type` | VARCHAR(20) | NOT NULL, indexed (values: `story`, `legacy`, `media`) |
| `entity_id` | UUID | NOT NULL, indexed |
| `created_at` | TIMESTAMPTZ | NOT NULL, server default NOW() |

- **Unique constraint:** `(user_id, entity_type, entity_id)` — prevents duplicate favorites
- **Composite index:** `(entity_type, entity_id)` — fast count queries per entity

### Additions to existing tables (via migration)

| Table | New Column | Type | Default |
|-------|-----------|------|---------|
| `stories` | `favorite_count` | INTEGER | 0 |
| `legacies` | `favorite_count` | INTEGER | 0 |
| `media` | `favorite_count` | INTEGER | 0 |

Count is incremented/decremented in the same transaction as the favorite insert/delete.

## Backend API

All routes under `/api/favorites`, requiring authentication.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/favorites` | Toggle favorite (add/remove). Body: `{ entity_type, entity_id }`. Returns `{ favorited: bool, favorite_count: int }` |
| `GET` | `/api/favorites` | List user's favorites. Query params: `entity_type?`, `limit?`, `cursor?`. Returns favorites with entity metadata. |
| `GET` | `/api/favorites/check` | Batch check if entities are favorited. Query param: `entity_ids=id1,id2,...`. Returns `{ [entity_id]: bool }` map. |

### Toggle semantics

Single endpoint checks existence and flips state atomically. Uses `INSERT ... ON CONFLICT DO NOTHING` + existence check in one transaction. Simpler frontend — one button, one call, no race conditions.

### Schema changes to existing responses

- `StorySummary`, `StoryDetail` — add `favorite_count: int`
- `LegacyResponse` — add `favorite_count: int`
- `MediaSummary`, `MediaDetail` — add `favorite_count: int`

These read directly from the new column — no extra queries.

### New backend files

- `services/core-api/app/models/favorite.py` — UserFavorite model
- `services/core-api/app/schemas/favorite.py` — Pydantic schemas
- `services/core-api/app/routes/favorite.py` — API routes
- `services/core-api/app/services/favorite.py` — Business logic

## Frontend Design

### FavoriteButton component

Reusable component accepting `entityType`, `entityId`, `favoriteCount`, `isFavorited`. Used in:
- `StoryCard` — replaces non-functional heart icon
- Legacy cards (homepage explore) — heart icon in card corner
- Media gallery items — heart icon overlay

Behavior:
- Stops event propagation (doesn't trigger card navigation)
- Optimistic update — immediately flips icon and adjusts count, reverts on error
- Disabled while mutation is in-flight
- Shows `favorite_count` next to heart when count > 0

### Hooks

- `useFavoriteToggle()` — mutation calling `POST /api/favorites`
- `useFavoriteCheck(entityIds)` — query calling `GET /api/favorites/check`
- `useMyFavorites(entityType?)` — query calling `GET /api/favorites`

### Query keys

```
favorites.check([id1, id2, ...])
favorites.list({ entityType? })
```

On toggle success: invalidate `favorites.check`, `favorites.list`, and parent entity list queries.

### New frontend files

- `apps/web/src/features/favorites/api/favorites.ts` — API functions
- `apps/web/src/features/favorites/hooks/useFavorites.ts` — TanStack Query hooks
- `apps/web/src/features/favorites/components/FavoriteButton.tsx` — Reusable button

## Homepage Favorites Section

Placement: between "My Legacies" and "Explore Legacies", authenticated users only.

### Layout

- Filter tabs: All | Stories | Legacies | Media
- 4-column grid, up to 8 items
- Each item renders as its native card type with heart filled
- "View All Favorites" link if > 8 items (dedicated page deferred)
- Hidden entirely if user has no favorites

### Entity metadata in response

`GET /api/favorites` returns entity summary via JOIN — enough to render cards without extra API calls:

```json
{
  "id": "uuid",
  "entity_type": "story",
  "entity_id": "uuid",
  "created_at": "...",
  "entity": { "title": "...", "content_preview": "...", "author_name": "..." }
}
```

Payload shape varies by `entity_type`.

## Edge Cases & Authorization

### Access control
- Only authenticated users can favorite
- Toggle verifies view access (public entity, or user is member of private legacy) — 403 if not
- Favorites are private — only the owning user can see their list

### Orphan cleanup
No FK on `entity_id` (polymorphic). When `GET /api/favorites` loads entity metadata via LEFT JOIN, entities that no longer exist return `entity: null`. Response filters these out and lazily deletes orphaned rows.

### Visibility changes
If a legacy goes private, existing favorites from non-members remain in DB but won't be returned at read time (JOIN won't satisfy access). If user later gains access, favorite reappears.

### Concurrency
- Toggle uses atomic insert/check/delete in single transaction
- Frontend disables button during mutation (optimistic UI still shows flip)

### Performance
- `favorite_count` column avoids COUNT queries on every list render
- Batch check endpoint avoids N+1 for card lists
- Composite index on `(entity_type, entity_id)` for efficient count reconciliation
