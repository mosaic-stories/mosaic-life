# Member Relationship Profiles — Design

**Date:** 2025-02-13
**Status:** Approved

## Problem

When viewing a legacy, members see only the legacy's universal details (name, dates, biography). There is no way to capture the personal relationship between a member and the legacy subject. This means:

- AI conversations lack relationship context (user must explain "this is my mom" every time)
- The experience feels generic rather than personal
- Valuable relationship knowledge that could enrich AI personas is never captured

## Solution

Add per-member relationship profiles to legacies — a JSONB column on `legacy_members` that stores each member's personal relationship context with the legacy subject. Combined with gender fields on `legacies` and `users`, this provides rich context for AI persona conversations.

## Data Model Changes

### `legacies` table — New column

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `gender` | `VARCHAR(20)` | Yes | Enum: `male`, `female`, `non_binary`, `prefer_not_to_say` |

### `users` table — New column

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `gender` | `VARCHAR(20)` | Yes | Enum: same as above |

### `legacy_members` table — New column

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `profile` | `JSONB` | Yes | Default `NULL`, created on first save |

### JSONB Profile Schema

Validated at the Pydantic layer, not DB-enforced. All fields optional.

```json
{
  "relationship_type": "parent | child | spouse | sibling | grandparent | grandchild | aunt | uncle | cousin | niece | nephew | in_law | friend | colleague | mentor | mentee | caregiver | neighbor | other",
  "nickname": "string, max 100 chars",
  "legacy_to_viewer": "string, max 1000 chars",
  "viewer_to_legacy": "string, max 1000 chars",
  "character_traits": ["string array, freetext tags"]
}
```

### Field Descriptions

- **`relationship_type`** — The viewer's relationship to the legacy subject. Selected from a predefined enum. "other" covers edge cases without a custom text field (can be added later if demand warrants).
- **`nickname`** — What the viewer calls the legacy subject (e.g., "Mom", "Papa", "Coach"). Single string.
- **`legacy_to_viewer`** — Free text describing who the legacy subject is to the viewer, in the viewer's own words.
- **`viewer_to_legacy`** — Free text describing who the viewer is to the legacy subject, in the viewer's own words.
- **`character_traits`** — Freetext tags describing the legacy subject's personality traits as perceived by the viewer.

## Backend API Changes

### New Endpoints

#### `GET /api/legacies/{id}/profile`

Returns the current authenticated user's relationship profile for this legacy.

- **Auth:** Required, must be a member of the legacy
- **Response:** `MemberProfileResponse` (the JSONB contents, or `null` if not yet set)
- **Access:** Only returns the requesting user's own profile — no endpoint exists to read another member's profile

#### `PUT /api/legacies/{id}/profile`

Creates or updates the current user's relationship profile.

- **Auth:** Required, must be a member of the legacy
- **Body:** `MemberProfileUpdate` — All fields optional, partial updates merge with existing JSONB
- **Response:** Full updated `MemberProfileResponse`
- **Validation:** Pydantic validates relationship_type against enum, enforces max lengths, validates character_traits as list of strings

### Modified Endpoints

- `PUT /api/legacies/{id}` — Extended to accept optional `gender` field (creator/admin only)
- User profile endpoint (`PATCH /api/users/me` or equivalent) — Extended to accept optional `gender` field

### Pydantic Schemas

```python
class MemberProfileUpdate(BaseModel):
    relationship_type: Optional[RelationshipType] = None
    nickname: Optional[str] = Field(None, max_length=100)
    legacy_to_viewer: Optional[str] = Field(None, max_length=1000)
    viewer_to_legacy: Optional[str] = Field(None, max_length=1000)
    character_traits: Optional[list[str]] = None

class MemberProfileResponse(BaseModel):
    relationship_type: Optional[RelationshipType] = None
    nickname: Optional[str] = None
    legacy_to_viewer: Optional[str] = None
    viewer_to_legacy: Optional[str] = None
    character_traits: Optional[list[str]] = None
```

### Service Layer

Extend the existing `member` service (or create a new `member_profile` service) with:

- `get_profile(legacy_id, user_id)` — Reads the JSONB profile column
- `update_profile(legacy_id, user_id, data)` — Merges partial update into existing JSONB

## Frontend Changes

### Legacy Page — "My Relationship" Section

A new collapsible card/section on the legacy detail page, visible only to authenticated members.

**Form fields:**
- **Relationship type** — Dropdown select from predefined list
- **Nickname** — Single text input
- **Who they are to me** — Textarea (`legacy_to_viewer`)
- **Who I am to them** — Textarea (`viewer_to_legacy`)
- **Character traits** — Tag input (type and press enter to add, click to remove)
- **Save button** — Sends PUT to the profile endpoint

**Behavior:**
- When populated: shows a summary/read view with an "Edit" button
- When empty: shows the form directly with a brief explanation of why the information is valuable

### Post-Join Nudge

When a user first joins a legacy (via invitation accept or join approval), show a lightweight toast or banner on the legacy page:

> "Help personalize your experience — tell us about your relationship with [legacy name]"

With a link/button that scrolls to or expands the "My Relationship" section. Dismissible, non-blocking.

### Gender Fields

- **Legacy gender** — Added to the existing legacy edit form (creator/admin only)
- **User gender** — Added to the user's account settings/profile page

### New Hooks

- `useMemberProfile(legacyId)` — Fetches current user's profile via `GET /api/legacies/{id}/profile`
- `useUpdateMemberProfile(legacyId)` — Mutation to save profile via `PUT /api/legacies/{id}/profile`

## Access Control

- **Profile data is private to the owner.** Each member can only read and write their own relationship profile. No endpoint exposes one member's profile to another.
- **All members can create a profile** regardless of role (creator, admin, advocate, admirer).
- **Gender on legacy** — Only creator/admin can set this (it's a property of the legacy, not the relationship).
- **Gender on user** — Each user manages their own.

## AI Context Integration (Future)

Deferred implementation, but the data shape is designed to serve this use case. When AI persona conversations are built, the member profile will be assembled into context:

```
The person you are speaking with is [user.name] ([user.gender]).
They are the [profile.relationship_type] of [legacy.name] ([legacy.gender]).
They call [legacy.name] "[profile.nickname]".
In their words, [legacy.name] is: "[profile.legacy_to_viewer]"
In their words, they are: "[profile.viewer_to_legacy]"
They describe [legacy.name] as: [profile.character_traits joined by ", "]
```

No code changes needed now. A utility function will assemble this context when AI conversations are implemented.

## Migration

Single Alembic migration adding three columns:

1. `legacies.gender VARCHAR(20)` nullable
2. `users.gender VARCHAR(20)` nullable
3. `legacy_members.profile JSONB` nullable

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage approach | JSONB column on `legacy_members` | Extensible without migrations, avoids redundant join table, simple queries |
| Relationship types | Gender-neutral enum | Combined with separate gender fields, avoids combinatorial explosion |
| Gender placement | On `legacies` and `users` tables | Gender is a property of the entity, not the relationship |
| Field requirements | All optional | Allows incremental filling, lowers friction |
| Character traits | Freetext tags | More expressive than predefined list; AI can normalize synonyms |
| Text field limits | 1000 chars | Descriptive but not essays |
| Profile visibility | Private to owner only | Encourages honest input; can open up later |
| Timeline events | Deferred | Broader feature requiring its own architecture |
| Custom relationship text | Deferred | "Other" category covers edge cases for now |
