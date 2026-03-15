# Design: User Connections, Profiles & Legacy Access Requests

**Date:** 2026-03-15
**Status:** Approved
**Source:** [Initial draft](2026-03-15-user-connections-initial-draft.md) (externally developed, adapted to project conventions)

## Context

Mosaic Life captures and preserves personal stories and memories. Users create legacies and invite others to contribute. This design introduces three interconnected capabilities to strengthen the social layer:

1. **User Profiles** — a presence on the platform beyond legacy memberships, with configurable visibility
2. **User-to-User Connections** — symmetric, mutual-consent relationships between users
3. **Legacy Access Requests** — user-initiated requests to join legacies, supplementing the existing admin-initiated invite flow

## Design Decisions

Key decisions made during design review, with rationale:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | All three features in one cohesive design | Tightly coupled — profiles need visibility for connections, access requests need connections for trust signals |
| Relationship data model | Shared `relationships` table with explicit FK columns (Approach B) | Real FK constraints, clean SQLAlchemy typing, single table for both connection and legacy membership contexts |
| Relationship data migration | Full migration now | Small user base — pay down debt early before it becomes harder |
| Email notifications | Deferred | No email infrastructure exists today; in-app notifications sufficient for launch |
| Username system | Simplified — uniqueness + reserved words, no cooldown/history/redirects | Can add change tracking later; simpler to launch |
| Profile visibility | Per-content-type with four audience tiers | Aligns with platform's data ownership principle; users get full control |
| Connection requests | Separate table from connections | Keeps connections table clean; mirrors existing invitation pattern |
| Request message privacy | Visible to recipient; relationship data private per-user | Message is context for the request; relationship descriptions are personal |
| Enhanced duplicate detection | Included | Surfaces connections' legacies during creation, reducing duplicates |
| Neptune sync | Included | Follows existing async best-effort pattern; lays groundwork for graph queries |
| Existing `/connections` route | Repurposed | Current implementation is a placeholder, not permanent |

---

## Part 1: Data Model

### Username — Addition to Users Table

Add `username` directly to the existing `users` table (1:1 relationship, avoids unnecessary join).

**New column on `users`:**
- `username` (String 30, unique, indexed, not null)

**Auto-generation for existing users:**
- Lowercase display name, replace spaces with hyphens, append 4-char random alphanumeric suffix
- Example: `joe-smith-a1b2`

**Validation rules:**
- Lowercase alphanumeric and hyphens only
- 3–30 characters
- Must not start or end with a hyphen
- Must be unique
- Checked against reserved words blocklist

**Reserved words:**
`admin`, `api`, `settings`, `legacy`, `legacies`, `help`, `support`, `about`, `auth`, `login`, `signup`, `profile`, `user`, `users`, `story`, `stories`, `media`, `search`, `explore`, `notifications`, `account`, `privacy`, `terms`, `null`, `undefined`, `system`, `connections`, `favorites`, `activity`

**URL structure:** `/u/{username}`

### Profile Settings Table (new)

```
profile_settings
├── user_id          UUID, FK → users, PK
├── discoverable     Boolean, default false
├── visibility_legacies    Enum(nobody|connections|authenticated|public), default nobody
├── visibility_stories     Enum, default nobody
├── visibility_media       Enum, default nobody
├── visibility_connections Enum, default nobody
├── visibility_bio         Enum, default connections
├── created_at       DateTime
├── updated_at       DateTime
```

Default rows created for existing users on migration.

### Connections Table (new)

Stores accepted connections only. Consistent ordering ensures no duplicate pairs.

```
connections
├── id           UUID, PK
├── user_a_id    UUID, FK → users (lower UUID of the pair)
├── user_b_id    UUID, FK → users (higher UUID of the pair)
├── connected_at DateTime
├── removed_at   DateTime, nullable (soft-delete)
├── UNIQUE(user_a_id, user_b_id)
```

### Connection Requests Table (new)

Separate from connections. Mirrors the existing invitation pattern.

```
connection_requests
├── id                      UUID, PK
├── from_user_id            UUID, FK → users
├── to_user_id              UUID, FK → users
├── relationship_type       String (family, friend, colleague, neighbor, etc.)
├── message                 Text, nullable (visible to recipient)
├── status                  Enum(pending|accepted|declined|cancelled)
├── declined_cooldown_until DateTime, nullable (30 days after decline)
├── created_at              DateTime
├── resolved_at             DateTime, nullable
├── UNIQUE(from_user_id, to_user_id) WHERE status = 'pending'
```

**Rate limit:** Max 20 pending outgoing requests per user (service layer).

### Relationships Table (new — shared model)

Uses explicit nullable FK columns with a CHECK constraint ensuring exactly one context is set.

```
relationships
├── id                       UUID, PK
├── owner_user_id            UUID, FK → users (who provided this data)
├── connection_id            UUID, FK → connections, nullable
├── legacy_member_legacy_id  UUID, nullable ─┐ composite FK → legacy_members(legacy_id, user_id)
├── legacy_member_user_id    UUID, nullable ─┘
├── relationship_type        String (family, friend, colleague, etc.)
├── who_they_are_to_me       Text, nullable
├── who_i_am_to_them         Text, nullable
├── nicknames                ARRAY[String], nullable
├── character_traits         ARRAY[String], nullable
├── created_at               DateTime
├── updated_at               DateTime
├── CHECK: exactly one context is set (connection_id XOR legacy_member composite)
```

**Migration from `legacy_members.profile` JSON:**
| Old field (JSON) | New column |
|------------------|------------|
| `relationship_type` | `relationship_type` |
| `viewer_to_legacy` | `who_they_are_to_me` |
| `legacy_to_viewer` | `who_i_am_to_them` |
| `nicknames` | `nicknames` |
| `character_traits` | `character_traits` |

The `profile` column is dropped from `legacy_members` after migration.

### Legacy Access Requests Table (new)

```
legacy_access_requests
├── id              UUID, PK
├── user_id         UUID, FK → users
├── legacy_id       UUID, FK → legacies
├── requested_role  Enum(admirer|advocate)
├── assigned_role   Enum(admirer|advocate|admin), nullable (set on approval)
├── message         Text, nullable
├── status          Enum(pending|approved|declined|expired)
├── reviewed_by     UUID, FK → users, nullable
├── created_at      DateTime
├── resolved_at     DateTime, nullable
├── expires_at      DateTime (created_at + 60 days)
├── UNIQUE(user_id, legacy_id) WHERE status = 'pending'
```

**Rate limit:** Max 10 pending outgoing requests per user (service layer).

### Neptune Graph Edges

- `CONNECTED_TO` edge between user nodes on connection acceptance
- Removed on soft-delete
- Async best-effort sync via existing graph adapter pattern
- Uses env-prefixed labeling convention

---

## Part 2: API Design

All endpoints require authentication unless noted. Follow existing patterns: RESTful, Pydantic request/response models, dependency-injected `AsyncSession`.

### Profile Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/{username}` | Profile page data, filtered by viewer relationship |
| PATCH | `/api/users/me/profile` | Update bio, display name, avatar_url |
| PATCH | `/api/users/me/profile/settings` | Update visibility settings + discoverability |
| PATCH | `/api/users/me/username` | Change username |
| GET | `/api/users/search?q={query}` | Search users (respects discoverability) |

**Profile endpoint (`GET /api/users/{username}`):**
- Evaluates viewer's relationship to profile owner at request time (unauthenticated, authenticated, connected)
- Returns only sections the viewer is authorized to see based on visibility settings
- Includes a `visibility_context` field so the frontend knows which sections to render
- Works for unauthenticated viewers (only `public`-tier content)
- Profiles with all content set to `nobody`/`connections` return `noindex` SEO directive

**User search:**
- Discoverable users appear in platform-wide results
- Non-discoverable users only appear if they share a legacy membership with the searcher
- Extends the existing `/api/users` search endpoint

### Connection Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/connections/requests` | Send connection request |
| GET | `/api/connections/requests/incoming` | Pending incoming requests |
| GET | `/api/connections/requests/outgoing` | Pending outgoing requests |
| PATCH | `/api/connections/requests/{id}/accept` | Accept request |
| PATCH | `/api/connections/requests/{id}/decline` | Decline request |
| DELETE | `/api/connections/requests/{id}` | Cancel outgoing request |
| GET | `/api/connections` | List accepted connections |
| DELETE | `/api/connections/{id}` | Remove connection (soft-delete) |
| GET | `/api/connections/{id}/relationship` | Get own relationship data |
| PATCH | `/api/connections/{id}/relationship` | Update relationship data |

**On accept:**
1. Create `connections` row (ordered UUIDs)
2. Create `relationships` row for the requester (from request's `relationship_type`)
3. Neptune sync — `CONNECTED_TO` edge
4. Notification for requester (`connection_request_accepted`)

**On decline:**
1. Set `declined_cooldown_until` to now + 30 days
2. Notification for requester (`connection_request_declined` — gentle: "not accepting new connections at this time")

**On remove:**
1. Soft-delete: set `removed_at` on connection
2. Both users lose access to `connections`-tier profile content on each other's profiles
3. Legacy memberships unaffected
4. Neptune sync — remove `CONNECTED_TO` edge
5. Relationship data retained but hidden

### Legacy Access Request Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/legacies/{id}/access-requests` | Submit request |
| GET | `/api/legacies/{id}/access-requests` | List pending (admin/creator only) |
| PATCH | `/api/legacies/{id}/access-requests/{id}/approve` | Approve with role |
| PATCH | `/api/legacies/{id}/access-requests/{id}/decline` | Decline |
| GET | `/api/access-requests/outgoing` | User's pending outgoing requests |

**On approve:**
1. Create `legacy_members` row with assigned role
2. Notification for requester (`legacy_access_request_approved`)
3. Neptune sync if applicable

**Admin approval screen includes:**
- Requester info (name, avatar)
- Their message and requested role
- List of legacy members who are connected to the requester (names only — trust signal without revealing the connection path)

### Relationship Endpoints (Legacy Membership context)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/legacies/{id}/members/{user_id}/relationship` | Get relationship data |
| PATCH | `/api/legacies/{id}/members/{user_id}/relationship` | Update relationship data |

Replaces the existing member profile endpoints. Same behavior, backed by the shared `relationships` table.

### Notification Types

Six new types using the existing notification model (`type`, `title`, `message`, `actor_id`, `resource_type`, `resource_id`, `link`):

| Type | Recipient | Message Pattern |
|------|-----------|-----------------|
| `connection_request_received` | Request target | "{Name} would like to connect with you" |
| `connection_request_accepted` | Requester | "{Name} accepted your connection request" |
| `connection_request_declined` | Requester | "{Name} is not accepting new connections at this time" |
| `legacy_access_request_received` | Legacy admin/creator | "{Name} has requested to join {Legacy}" |
| `legacy_access_request_approved` | Requester | "You've been added to {Legacy} as {role}" |
| `legacy_access_request_declined` | Requester | "{Legacy} is not accepting new members at this time" |

---

## Part 3: Frontend & UI Design

Builds on existing shadcn/ui components. No new component library additions needed.

### New Route: Profile Page (`/u/{username}`)

Public route (works for unauthenticated visitors).

**Layout:**
- **Header:** Display name, `Avatar` (existing), bio
- **Content sections** (conditionally rendered based on `visibility_context` from API):
  - **Legacies** — grid of `Card` components: legacy name, subject photo, story count
  - **Stories** — story cards (reuses existing `StoryCard` pattern)
  - **Media** — media grid (reuses existing `MediaSection` pattern)
  - **Connections** — list of connected users: avatar + display name, links to their profile
- **Action area:** `ConnectButton` (new component)
- **Nameplate fallback:** When all content is hidden → display name + avatar + Connect button only

**SEO:** `SEOHead` component generates meta tags for profiles with `public`-tier content. All-private profiles get `noindex`.

### New Component: ConnectButton

Stateful button for profiles and search results. Built with existing `Button` + `DropdownMenu`.

| State | Label | Action |
|-------|-------|--------|
| No relationship | "Connect" | Opens `ConnectionRequestDialog` |
| Pending (I sent) | "Request Pending" | Disabled |
| Pending (they sent) | "Respond to Request" | Opens accept/decline |
| Connected | "Connected" (dropdown) | View relationship, Remove |
| Declined (in cooldown) | Hidden | — |
| Declined (cooldown expired) | "Connect" | Opens dialog again |

### New Component: ConnectionRequestDialog

`Dialog` (existing shadcn) with React Hook Form + Zod:
- **Relationship type** (required) — `Select` dropdown: Family, Friend, Colleague, Neighbor, Caregiver, Mentor, Other
- **Message** (optional) — `Textarea`
- Submit / Cancel

### New Component: LegacyAccessRequestDialog

`Dialog` with React Hook Form + Zod:
- **Requested role** — `Select`: Admirer (default), Advocate
- **Message** (optional) — `Textarea`
- Submit / Cancel

### Repurposed Route: `/connections`

Replaces the existing placeholder. Two tabs using existing `Tabs` component:

**Connections Tab:**
- `Card` components: avatar, display name, relationship type `Badge`, connected-since date
- Click → navigate to `/u/{username}`
- `DropdownMenu`: Edit relationship, Remove connection

**Requests Tab:**
- **Incoming:** Cards with accept/decline actions; shows requester name, relationship type, message
- **Outgoing:** Cards with cancel action; shows status

### Settings Addition: "Connections" Tab

New 6th tab in existing settings layout:

- **Profile visibility** — `Select` dropdowns for each content-type visibility tier + `Switch` for discoverability
- **Username** — current username display with edit capability via `Input` + inline validation

### Modifications to Existing Components

**Legacy profile page (`LegacyProfile`):**
- "Request Access" button for authenticated non-members viewing public legacies
- Conditional on membership status and pending request state

**Member management (`MemberDrawer`):**
- New section: "Pending Access Requests" with approve (role `Select`)/decline actions
- Each card: requester info, message, requested role, connected legacy members list

**Legacy creation (`LegacyCreation`):**
- Enhanced duplicate detection surfaces legacies where user's connections are members (only if those connections share legacy memberships via `visibility_legacies`)
- Prompt: "Your connection {name} is a member of a legacy for {subject} — would you like to request access instead?"

**Notifications:**
- Extend notification card renderer with handlers for 6 new types
- Appropriate icons and action links per type

**Search (`SearchBar`):**
- Wire up to `/api/users/search` (currently mock data)
- User results: avatar, display name, inline Connect action

### Component Reuse Summary

| Need | Existing Component |
|------|--------------------|
| Dialogs/Modals | `Dialog` |
| Cards | `Card` |
| Forms | `Form` + React Hook Form + Zod |
| Dropdowns | `Select`, `DropdownMenu` |
| Toggles | `Switch` |
| Avatars | `Avatar` |
| Role/type labels | `Badge` |
| Tab navigation | `Tabs` |
| Notifications | Existing notification card renderer |

---

## Part 4: Implementation Phasing

Three phases, each independently deployable and testable.

### Phase 1: Foundation

Username, profile settings, shared relationship model with migration.

**Backend:**
1. Add `username` to `users` table; auto-generate for existing users
2. Create `profile_settings` table; default rows for existing users
3. Create `relationships` table
4. Migrate `legacy_members.profile` JSON → `relationships` rows
5. Drop `profile` column from `legacy_members`
6. Refactor member profile service/routes to use `relationships` table
7. Profile endpoints: GET profile, PATCH profile, PATCH settings, PATCH username
8. User search with discoverability

**Frontend:**
1. Profile page at `/u/{username}` with visibility-filtered rendering
2. Settings > Connections tab: visibility controls + username management
3. Wire search bar to live user search

### Phase 2: Connections

User-to-user connection lifecycle.

**Backend:**
1. Create `connections` and `connection_requests` tables
2. Connection request service: create, accept, decline, cancel (rate limits + cooldown)
3. Connection service: list, remove (soft-delete)
4. Connection relationship endpoints
5. Neptune sync on accept/remove
6. Notifications for connection events (3 types)

**Frontend:**
1. Repurpose `/connections` route: Connections + Requests tabs
2. `ConnectButton` component
3. `ConnectionRequestDialog`
4. Connection cards with relationship management
5. Notification rendering for connection types

### Phase 3: Legacy Access Requests

User-initiated legacy membership requests.

**Backend:**
1. Create `legacy_access_requests` table
2. Access request service: submit, list, approve, decline, expiration
3. Connected-members query for admin approval screen
4. Enhanced duplicate detection in legacy creation
5. Notifications for access request events (3 types)

**Frontend:**
1. "Request Access" button on legacy pages
2. `LegacyAccessRequestDialog`
3. Access request section in `MemberDrawer`
4. Enhanced legacy creation flow
5. Notification rendering for access request types

### Migration Strategy

Phase 1 includes the critical `legacy_members.profile` migration:

1. Alembic migration creates `relationships` table
2. Data migration (same revision) reads `legacy_members` rows with non-null `profile`, inserts `relationships` rows
3. Second migration drops `profile` column
4. Service layer updated between migrations

Small user base — single deployment, no dual-write period needed.

### Rollback

- **Phase 1:** Alembic downgrade restores `profile` column, drops new tables
- **Phase 2/3:** Drop new tables, remove routes — no impact on existing functionality

---

## Testing Considerations

- **Privacy boundaries:** Verify content scoped to `connections` is invisible to non-connected users. Non-discoverable users must not appear in search. Relationship data must never be exposed to the other party.
- **Connection lifecycle:** Request → accept → remove; request → decline → cooldown → re-request; concurrent requests between two users.
- **Access control:** Request by non-connected user for public legacy; request by connected user; admin approval with role override; expiration after 60 days.
- **Username:** Uniqueness, reserved words, validation rules.
- **Migration:** Verify all existing `legacy_members.profile` data is correctly migrated to `relationships` table with proper field mapping.
- **Notifications:** All 6 new types trigger with correct content and deep links.
- **Neptune sync:** Connection edges created/removed; verify env-prefixed labels.
