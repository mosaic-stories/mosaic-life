# Legacy Visibility (Public/Private) Design

## Overview

Legacies can be **public** or **private**. Public legacies are visible to everyone on the explore page and home page. Private legacies are only visible to members who have been invited by the creator.

## Access Control Model

### Layered Visibility

The application uses a layered access control model:

1. **Legacy visibility** - The outer gate (`public` | `private`)
2. **Story visibility** - Inner gate (`public` | `members` | `private`) - future work
3. **Media visibility** - Inner gate (`public` | `members` | `private`) - future work

A story or media item's effective visibility is constrained by its legacy's visibility. For example, a "public" story on a private legacy is only visible to legacy members.

### Legacy Access Rules

| User State | Legacy Visibility | Can View? |
|------------|-------------------|-----------|
| Unauthenticated | Public | Yes |
| Unauthenticated | Private | No (403 with login prompt) |
| Authenticated, not member | Public | Yes |
| Authenticated, not member | Private | No (403 with "Request Access") |
| Authenticated, member | Public | Yes |
| Authenticated, member | Private | Yes |

### Story Access Rules (Future)

| Story Visibility | Who Can View |
|------------------|--------------|
| Public | Anyone who can view the legacy |
| Members | Legacy members only |
| Private | Story creator only |

### Media Access Rules (Future)

Same as story rules, with one constraint:
- Media used as legacy profile picture must be `public` or `members` (not `private`)

## Data Model

### Legacy Model

Add `visibility` field:

```python
visibility: Mapped[str] = mapped_column(
    String(20),
    nullable=False,
    server_default="private",
    index=True,
)
```

- Values: `"private"` | `"public"`
- Default: `"private"`
- Only the `creator` role can change visibility

## API Changes

### Modified Endpoints

**`GET /api/legacies/explore`**
- Add query param: `visibility_filter` = `"all"` | `"public"` | `"private"`
- Default: `"all"` for authenticated users
- Unauthenticated: Returns only public legacies (filter ignored)
- Authenticated with `"all"`: Returns public + private legacies user is member of
- Response includes `visibility` field

**`GET /api/legacies/search`**
- Unauthenticated: Returns only public matches
- Authenticated: Returns public + private legacies user is member of

**`GET /api/legacies/{id}` and `GET /api/legacies/{id}/public`**
- Private legacy + no access = 403 with appropriate message
- Private legacy + unauthenticated = 403 with login prompt

**`POST /api/legacies/`**
- Accept optional `visibility` field (defaults to `"private"`)

**`PUT /api/legacies/{id}`**
- Accept `visibility` field
- 403 if non-creator attempts to change visibility

### Unchanged Endpoints

- `POST /api/legacies/{id}/join` - Reused for "Request Access" on private legacies
- Member management endpoints - Unaffected

## Frontend Changes

### Explore Page

- Filter toggle (authenticated only): "All" | "Public" | "Private"
- Default filter: "All"
- Legacy cards show visibility indicator (lock icon for private)
- Unauthenticated users see public legacies only, no filter UI

### Legacy Detail Page

Private legacy without access:
- Show "Request Access" button
- Clicking triggers existing join flow with in-app notification to creator

Private legacy with access:
- Show full content with private indicator badge

### Legacy Creation Form

- Visibility selector: "Private" (default) | "Public"
- Helper text: "Private legacies are only visible to invited members"

### Legacy Settings/Edit Form

- Visibility toggle visible only to `creator` role
- Confirmation dialog when changing private → public
- No confirmation for public → private

### My Legacies Page

- Shows all legacies user is member of (unchanged)
- Display visibility indicator on each card

## Database Migration

1. Add `visibility` column with default `'private'`
2. Update all existing legacies to `'public'` (preserve current behavior)
3. Add index on `visibility` column

```sql
ALTER TABLE legacies ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'private';
CREATE INDEX ix_legacies_visibility ON legacies(visibility);
UPDATE legacies SET visibility = 'public';
```

## Files to Modify

| Layer | Files |
|-------|-------|
| Model | `services/core-api/app/models/legacy.py` |
| Schema | `services/core-api/app/schemas/legacy.py` |
| Service | `services/core-api/app/services/legacy.py` |
| Routes | `services/core-api/app/routes/legacy.py` |
| Migration | `services/core-api/alembic/versions/xxx_add_legacy_visibility.py` |
| Frontend | Explore page, Legacy detail, Legacy create/edit, My Legacies |

## Out of Scope

The following are related but separate features:

- Story visibility (`public` | `members` | `private`)
- Media visibility (`public` | `members` | `private`)
- Profile picture visibility constraint
- Email notifications for access requests
