# User-Scoped Content Architecture

**Date:** 2025-01-15
**Status:** Approved
**Author:** Design Session

## Overview

Restructure stories, media, and AI conversations from legacy-scoped to user-scoped ownership, with many-to-many relationships to legacies.

### Goals

1. Clean ownership model for account export and deletion
2. Support shared memories involving multiple legacies
3. Maintain legacy-based access control for viewing content

### Non-Goals

- Complex role taxonomy beyond primary/secondary
- Hard database constraint requiring at least one legacy
- E2E test coverage for this change
- S3 migration tooling (not needed pre-launch)

## Data Model

### New Association Tables

Three junction tables replace single `legacy_id` foreign keys:

```sql
CREATE TABLE story_legacies (
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'primary',
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (story_id, legacy_id)
);

CREATE INDEX idx_story_legacies_legacy ON story_legacies(legacy_id);
CREATE INDEX idx_story_legacies_story ON story_legacies(story_id);

CREATE TABLE media_legacies (
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'primary',
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (media_id, legacy_id)
);

CREATE INDEX idx_media_legacies_legacy ON media_legacies(legacy_id);
CREATE INDEX idx_media_legacies_media ON media_legacies(media_id);

CREATE TABLE conversation_legacies (
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'primary',
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, legacy_id)
);

CREATE INDEX idx_conversation_legacies_legacy ON conversation_legacies(legacy_id);
CREATE INDEX idx_conversation_legacies_conversation ON conversation_legacies(conversation_id);
```

### Role Values

- `primary` - Main subject of the content
- `secondary` - Also featured/mentioned in the content

Position field (integer) determines display order within a story's legacies.

### Modified Existing Tables

**stories**
- Remove: `legacy_id` column
- Keep: `author_id` (now clearly the owner)

**media**
- Remove: `legacy_id` column
- Rename: `uploaded_by` → `owner_id`

**ai_conversations**
- Remove: `legacy_id` column
- Keep: `user_id` (already the owner)

## S3 Storage

### New Path Structure

```
Before: legacies/{legacy_id}/{media_id}.{ext}
After:  users/{user_id}/{media_id}.{ext}
```

### Benefits

- **Export**: Query all media where `owner_id = user_id`, zip from S3 prefix
- **Delete**: Delete S3 prefix `users/{user_id}/` removes all user media

### Implementation

```python
def generate_storage_path(user_id: UUID, media_id: UUID, ext: str) -> str:
    return f"users/{user_id}/{media_id}.{ext}"
```

## Access Control

### Union Access Rule

A user can view content if ANY condition is met:

1. They own the content (`author_id`/`owner_id`/`user_id` matches)
2. They are a member of ANY legacy linked to the content
3. The content's visibility is `public`

### Query Example

```sql
SELECT DISTINCT s.*
FROM stories s
LEFT JOIN story_legacies sl ON s.id = sl.story_id
LEFT JOIN legacy_members lm ON sl.legacy_id = lm.legacy_id
WHERE
    s.author_id = :user_id
    OR lm.user_id = :user_id
    OR s.visibility = 'public'
ORDER BY s.created_at DESC;
```

### Write Permissions

Only owners can edit/delete content. Legacy membership grants read access only.

- **Create**: Authenticated user (must link at least one legacy they're a member of)
- **Read**: Owner OR legacy member OR public
- **Update/Delete**: Owner only

## Orphaned Content

### Behavior

When a legacy is deleted, junction table rows cascade delete. Content losing ALL legacy links becomes "orphaned."

### Detection Query

```sql
SELECT s.*
FROM stories s
LEFT JOIN story_legacies sl ON s.id = sl.story_id
WHERE s.author_id = :user_id
  AND sl.story_id IS NULL;
```

### User Experience

- Orphaned content appears in "Needs Assignment" dashboard section
- UI prompts user to assign to one or more legacies
- No auto-delete; content remains accessible to owner

## API Changes

### Stories

**POST /api/stories**
```json
{
  "title": "Family Vacation",
  "content": "...",
  "visibility": "private",
  "legacies": [
    {"legacy_id": "uuid", "role": "primary", "position": 0},
    {"legacy_id": "uuid", "role": "secondary", "position": 1}
  ]
}
```

**GET /api/stories/{id}** response includes:
```json
{
  "id": "uuid",
  "title": "Family Vacation",
  "author_id": "uuid",
  "legacies": [
    {"legacy_id": "uuid", "name": "Mom", "role": "primary", "position": 0},
    {"legacy_id": "uuid", "name": "Dad", "role": "secondary", "position": 1}
  ]
}
```

**GET /api/stories** query params:
- `legacy_id` - Filter by linked legacy
- `orphaned=true` - Return user's unassigned stories

### Media

**POST /api/media/presign** - No legacy_id required; S3 key uses authenticated user_id

**POST /api/media** - `legacies` array (optional, can create unassigned)

### AI Chat

**POST /api/chat/conversations** - `legacies` array replaces `legacy_id`

## Frontend Changes

### Multi-Select Component

```typescript
<LegacyMultiSelect
  value={selectedLegacies}
  onChange={setSelectedLegacies}
  requirePrimary={true}
/>
```

### Display Format

```
"Family Vacation 1995"
About: Mom (primary) · Dad
```

### Dashboard

New "Needs Assignment" section showing orphaned content with reassignment prompt.

### Type Changes

```typescript
// Before
interface Story {
  legacy_id: string;
  legacy: Legacy;
}

// After
interface Story {
  legacies: LegacyAssociation[];
}

interface LegacyAssociation {
  legacy_id: string;
  legacy?: Legacy;
  role: 'primary' | 'secondary';
  position: number;
}
```

## Testing

### Unit Tests

- Junction table relationships
- Cascade delete behavior
- Orphan detection queries

### Integration Tests

- Create story with multiple legacies
- Union access control verification
- Orphaned content filtering
- S3 path generation

## Implementation Order

### Phase 1: Database Layer
1. Create SQLAlchemy models for junction tables
2. Update Story, Media, AIConversation models
3. Write and run Alembic migration
4. Unit tests for model relationships

### Phase 2: Service Layer
5. Update story service (CRUD with multi-legacy)
6. Update media service (owner_id, new S3 paths)
7. Update AI conversation service
8. Implement orphan detection queries
9. Update access control checks

### Phase 3: API Layer
10. Update story routes
11. Update media routes
12. Update chat routes
13. Integration tests

### Phase 4: Frontend
14. Update TypeScript types
15. Update API client functions
16. Build LegacyMultiSelect component
17. Update creation forms
18. Add orphaned content dashboard
19. Update display components

## Files to Modify

### Backend

```
services/core-api/app/models/
├── story.py
├── media.py
├── ai.py
└── associations.py (new)

services/core-api/app/routes/
├── stories.py
├── media.py
└── chat.py

services/core-api/alembic/versions/
└── xxx_user_scoped_content.py (new)
```

### Frontend

```
apps/web/src/
├── types/
├── api/
├── components/legacy/
└── pages/dashboard/
```

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Legacy relationship | Many-to-many | Support shared memories |
| Roles | primary/secondary | Start simple, expand later |
| Orphan handling | Soft orphan | Preserve user content |
| S3 structure | users/{user_id}/ | Clean export/delete |
| Access control | Union | Intuitive for family sharing |
| Write permissions | Owner only | Simple, secure |
| Migration | Clean change | Pre-launch, no data |
