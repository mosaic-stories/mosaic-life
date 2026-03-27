# Story Metadata & Title Image Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add persistent, reader-facing metadata to stories — people, places, events, and dates — along with a title image for visual presentation. Metadata can be entered manually or published from the existing context extraction workflow. Authors control visibility, and readers must have admirer+ legacy membership to see metadata regardless of story visibility.

## Requirements

- Store structured metadata details (person, place, event, date) with each story
- Allow manual entry and publishing from evolution context facts
- Optional linking of person details to canonical `Person` records
- Author-controlled visibility toggle (single on/off)
- Metadata visible only to admirer+ legacy members, even on public stories
- Title image displayed as story header background (similar to legacy background image)
- Title image selectable from legacy media or uploaded new
- Background sync of published metadata to Neptune for discovery/RAG
- Metadata lives at the story level, not tied to specific versions

## Data Model

### Story model changes

Two new fields on the existing `Story` model:

- `title_image_id` (FK to `Media`, nullable) — cover image for the story
- `metadata_visible` (Boolean, default `false`) — author toggle for metadata panel visibility

### New table: `story_metadata_detail`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | |
| `story_id` | FK to Story, indexed | cascade delete |
| `category` | Literal['person', 'place', 'event', 'date'] | indexed |
| `content` | String(500) | the label/name (e.g. "Uncle Ray", "Chicago") |
| `detail` | String(1000), nullable | additional context |
| `person_id` | FK to Person, nullable | optional link for person category |
| `source` | Literal['manual', 'context_fact'] | how this detail was created |
| `source_fact_id` | FK to ContextFact, nullable | if published from evolution |
| `position` | Integer, default 0 | display ordering within category |
| `graph_synced_at` | DateTime, nullable | tracks Neptune sync state |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |

**Unique constraint:** `(story_id, category, content)` — prevents duplicate entries.

No version coupling — metadata details are not tied to specific story versions. Stale details are managed manually by the author or via future AI prompts.

## API Design

### Story Metadata Details

**Base path:** `/api/stories/{story_id}/metadata`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List all metadata details for a story | Author or admirer+ (if `metadata_visible`) |
| POST | `/` | Add a metadata detail manually | Author only |
| POST | `/publish` | Publish selected context facts to metadata | Author only |
| PUT | `/{detail_id}` | Update a detail (content, detail, person link, position) | Author only |
| DELETE | `/{detail_id}` | Remove a metadata detail | Author only |

**POST `/publish` request body:**

```json
{
  "fact_ids": ["uuid1", "uuid2"]
}
```

Copies selected `ContextFact` entries into `StoryMetadataDetail` with `source=context_fact` and `source_fact_id`. Skips duplicates (unique constraint violations).

### Story Title Image

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/api/stories/{story_id}/title-image` | Set title image (media_id) |
| DELETE | `/api/stories/{story_id}/title-image` | Remove title image |

### Metadata Visibility Toggle

Handled via existing `PUT /api/stories/{story_id}` — new `metadata_visible` boolean field on update schema.

### Read Access Logic

When a non-author requests `GET /api/stories/{story_id}/metadata`:

1. Check `story.metadata_visible` is `true`
2. Check user has admirer+ role on at least one of the story's associated legacies
3. If either check fails, return empty list (not 403 — avoids leaking metadata existence)

## Frontend Design

### Metadata Panel (Story Reading Page)

Collapsible side panel on the story reading page, displayed to the right of story content.

**For readers (admirer+, metadata visible):**

- Metadata grouped by category with icons (person, map pin, calendar, flag)
- Person entries linked to a `Person` show as clickable links to their legacy
- Panel is collapsible

**For the author:**

- Same panel with edit controls — add, remove, reorder details
- "Publish from Context" button opens a picker showing pinned/active context facts not yet published
- Toggle for `metadata_visible` in story settings/toolbar
- Person entries show "Link to Person" action to connect to a `Person` record

### Story Title Image

- Background behind the story title in StoryViewHeader, mirroring the legacy ProfileHeader pattern — gradient overlay, blur, opacity
- Author sees "Add Cover Image" button when no title image is set
- Picker allows selecting from legacy media or uploading new
- Remove/change button overlay when image is set

### Story Cards

Story cards in the legacy stories grid can optionally show the title image as a card thumbnail for richer visual presentation.

## Neptune Graph Sync

### Background Sync

Periodic background task syncing published `StoryMetadataDetail` to Neptune:

- `person` with `person_id` → `MENTIONED_IN` edge (Person → Story)
- `place` → Location node + `LOCATED_AT` edge to Story
- `event` → Event node + `HAPPENED_IN` edge to Story
- `date` → properties on Story node or relevant edges

**Sync tracking:** `graph_synced_at` on `StoryMetadataDetail`. Task queries for records where `updated_at > graph_synced_at` or `graph_synced_at IS NULL`.

**Frequency:** Configurable, ~5-10 minutes for MVP.

**Circuit breaker:** Uses existing graph adapter circuit breaker — Neptune unavailability doesn't block anything.

### Read path

Reader-facing metadata panel reads exclusively from PostgreSQL. Neptune powers cross-story/cross-legacy discovery and AI persona RAG context, both tolerant of eventual consistency.

## Privacy Model

Metadata visibility requires **both**:

1. Author has enabled `metadata_visible` toggle
2. Reader has admirer+ membership on at least one of the story's associated legacies

Public story viewers without legacy membership never see metadata. This aligns with the platform's privacy-first approach — explicit membership agreement required before exposing structured details about people and events.

## Deferred

- Notifications when someone is tagged in a story
- Per-category or per-detail visibility toggles
- Additional categories: emotion, relationship, object
- Automatic stale-detail detection (AI prompting to remove outdated tags after edits)
