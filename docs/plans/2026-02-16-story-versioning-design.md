# Story Versioning Design

**Date:** 2026-02-16
**Status:** Approved
**Feature:** Story version history with draft support for AI-generated content

## Overview

Story versioning allows authors to preserve the full history of changes to their stories. Each edit creates a new version with a full content snapshot, giving authors confidence to edit freely knowing they can always revert. This feature is also a prerequisite for AI personas creating or enhancing stories — AI-generated changes land as drafts that the author must explicitly approve.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | Full snapshot per version | Keeps rollback clean, content is small (50K max), simplifies deletion |
| Version metadata | Source + change summary | Source distinguishes human vs AI edits; summary aids history browsing |
| Change summary generation | Auto-generated with override | Small/cheap model generates summary; author can edit. Falls back to generic text on failure |
| Version limits | Soft cap with user control (50) | Warning nudge, no auto-deletion. Author stays in control |
| Activation model | Append-only (restoration creates new version) | Linear history, simple to reason about and display |
| Visibility | Story-level only | Only author sees versions; visibility is access control, not content concern |
| Embedding reprocessing | Atomic swap | Generate new embeddings first, then swap in single transaction. No search gap |
| AI version creation | Draft-first | AI creates draft; author must approve before it becomes active |
| Draft limit | One draft max per story | Simple mental model, linear workflow |
| Draft + manual edit | Preserve draft with stale warning | Respects both author's edit and AI's work |
| Active version deletion | Disallowed | Author must activate another version first. No ambiguous states |
| Deleted version numbering | Never reuse numbers | Avoids confusion in audit logs and source_version references |

## Data Model

### New Table: `story_versions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `story_id` | UUID | FK to `stories.id`, indexed, CASCADE delete |
| `version_number` | int | Auto-incrementing per story (1, 2, 3...) |
| `title` | varchar(500) | Snapshot of title |
| `content` | text | Snapshot of content (markdown) |
| `status` | varchar(20) | `active`, `draft`, `inactive` |
| `source` | varchar(50) | `manual_edit`, `ai_enhancement`, `ai_interview`, `restoration` |
| `source_version` | int | Nullable — which version this was restored from |
| `change_summary` | text | Auto-generated (small model) or user-provided |
| `stale` | boolean | True if the story was edited after this draft was created |
| `created_by` | UUID | FK to `users.id` — who created this version |
| `created_at` | timestamp | When this version was created |

**Constraints:**
- Unique on `(story_id, version_number)`
- At most one row per `story_id` with `status = 'active'`
- At most one row per `story_id` with `status = 'draft'`

### Changes to `stories` Table

- `title` and `content` remain (always reflect active version for query simplicity)
- Add `active_version_id` (FK to `story_versions.id`) — pointer to current active version

## Version Lifecycle

### Creating a New Story

1. Create the `stories` row with `title` and `content`
2. Create `story_versions` row: `version_number=1`, `status=active`, `source=manual_edit`
3. Set `stories.active_version_id` to the new version
4. Background: generate embeddings via atomic swap

### Author Manually Edits a Story

1. Current active version's status changes from `active` to `inactive`
2. New `story_versions` row: next `version_number`, `status=active`, `source=manual_edit`
3. Auto-generate `change_summary` using small/cheap model (diff old vs new content)
4. Update `stories.title`, `stories.content`, and `active_version_id`
5. Background: atomic swap of embeddings
6. If a draft exists, mark it as `stale=true`

### AI Creates a Draft Version

1. New `story_versions` row: next `version_number`, `status=draft`, `source=ai_enhancement` or `ai_interview`
2. AI provides the `change_summary` as part of its workflow
3. `stories` table is NOT updated — active version unchanged
4. No embedding processing (drafts are not embedded)

### Author Approves a Draft

1. Current active version's status changes to `inactive`
2. Draft version's status changes to `active`, `stale` flag cleared
3. Update `stories.title`, `stories.content`, and `active_version_id`
4. Background: atomic swap of embeddings

### Author Discards a Draft

1. Draft row is hard-deleted from `story_versions`

### Author Restores an Old Version (e.g., v3)

1. Current active version's status changes to `inactive`
2. New `story_versions` row: next `version_number`, `status=active`, `source=restoration`, `source_version=3`, content copied from v3
3. Auto-generate `change_summary` (e.g., "Restored from version 3")
4. Update `stories.title`, `stories.content`, and `active_version_id`
5. Background: atomic swap of embeddings

### Author Deletes a Version

- **Active version:** Blocked (409 response). Must activate another version first.
- **Draft version:** Hard-deleted.
- **Inactive version:** Hard-deleted.

## API Design

### New Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stories/{story_id}/versions` | List all versions (author only). Paginated, newest first. Excludes full content. |
| `GET` | `/api/stories/{story_id}/versions/{version_number}` | Get full version detail including title and content (author only). |
| `DELETE` | `/api/stories/{story_id}/versions/{version_number}` | Delete a version. 409 if active. |
| `DELETE` | `/api/stories/{story_id}/versions` | Bulk delete versions. Request body: list of version numbers. Validates none are active. |
| `POST` | `/api/stories/{story_id}/versions/{version_number}/activate` | Restore old version (creates new version via restoration flow). |
| `POST` | `/api/stories/{story_id}/versions/draft/approve` | Approve current draft, promoting to active. |
| `DELETE` | `/api/stories/{story_id}/versions/draft` | Discard current draft. |

### Changes to Existing Endpoints

- **`PUT /api/stories/{story_id}`** — Now creates a new version behind the scenes. Response includes `version_number`.
- **`POST /api/stories/`** — Creates v1 automatically. No change to request schema.
- **`GET /api/stories/{story_id}`** — For the author, includes `version_count` and `has_draft` fields. Non-authors see no change.

### Authorization

All version endpoints are author-only. Non-authors receive 403. Existing story visibility rules are unchanged.

## Embedding Reprocessing

### Atomic Swap Flow

1. Chunk the new active version's content using existing `chunk_story()`
2. Generate embeddings via embedding provider (Bedrock Titan v2, 1024 dimensions)
3. In a single database transaction:
   - Delete all existing `story_chunks` for the `story_id`
   - Insert new `story_chunks` with fresh embeddings
4. If embedding generation fails, no chunks are modified — old embeddings remain intact

### Reprocessing Triggers

| Event | Reprocess? |
|---|---|
| Manual edit (new active version) | Yes |
| Draft approved (promoted to active) | Yes |
| Old version restored (new active version) | Yes |
| AI creates draft | No |
| Author discards draft | No |
| Author deletes inactive version | No |
| Visibility change | No (handled at story level) |

### No Changes to `story_chunks`

Chunks reference `story_id` only. Since only one version is active at a time, chunks always correspond to the active version. No version FK needed on chunks.

### Change Summary Generation

- Uses a small/cheap model (Haiku-class) with a prompt to summarize changes between old and new content
- Non-blocking: if the model call fails or times out, falls back to generic summary based on source ("Manual edit", "AI enhancement", "Restored from version N")
- Summary generation must not prevent the save from completing

## Soft Cap Warning

- Default threshold: **50 versions** per story (configurable via environment variable)
- When exceeded, `GET /api/stories/{story_id}/versions` includes: `"warning": "This story has N versions. Consider removing old versions you no longer need."`
- UI surfaces this as a non-blocking banner on the version history view
- No auto-deletion — author is always in control
- All versions count toward cap (active, inactive, draft). Discarded drafts do not count (hard-deleted).

## Edge Cases & Error Handling

### Concurrent Operations

- **Author edits while AI generates draft:** Draft lands with `stale=true` since the active version changed after the AI started. The AI doesn't need awareness of this — staleness is detected on save.
- **Rapid sequential edits:** Each creates a new version. Last edit's atomic swap overwrites the previous chunks. Both versions preserved in history.

### Draft Staleness

- Stale drafts show a warning in the UI: "This draft was created based on an older version. The story has been edited since."
- Author can still approve (intentionally replacing current content) or discard
- Approving a stale draft is allowed — the author has seen the warning

### Story Deletion

- Deleting a story cascades to all `story_versions` (FK CASCADE) and all `story_chunks` (existing CASCADE)

### Version Number Integrity

- Version numbers are strictly incrementing per story and never reused after deletion
- If versions 1, 2, 3 exist and v2 is deleted, the next version is v4

## Migration Strategy

### Alembic Migration Steps

1. Create `story_versions` table with all columns and constraints
2. Add `active_version_id` column to `stories` (nullable initially)
3. Backfill: for each existing story, create a `story_versions` row with `version_number=1`, `status=active`, `source=manual_edit`, `change_summary='Initial version'`
4. Set `stories.active_version_id` for all backfilled rows
5. Add NOT NULL constraint on `active_version_id`

### Backward Compatibility

- `stories.title` and `stories.content` stay in sync with active version — all existing queries work unchanged
- `story_chunks` table is unchanged
- Non-author users experience zero change

### Rollback Safety

If migration must be reversed:
1. Drop `active_version_id` from `stories`
2. Drop `story_versions` table
3. No data loss — story content was duplicated into versions, not relocated

## Future Enhancements

- **Side-by-side comparison UI** — Compare any two versions with visual diff
- **Bulk version management** — Select and delete multiple versions at once
- **Version branching** — If needed, support non-linear history (deferred, likely YAGNI)
