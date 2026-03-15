# Feature Spec: User Connections, Profiles & Legacy Access Requests

## Context

Mosaic Life is a platform for capturing and preserving personal stories and memories. Users create "legacies" — memorial or biographical collections honoring a person — and invite others to contribute stories, media, and memories. The platform's aesthetic is warm and heartfelt (cream/gold parchment palette, Georgia serif), and its core principle is **user data ownership**: users have full control over what they share and with whom.

### Existing Architecture
- **Monorepo**: `apps/web` (React frontend), `services/core-api` (FastAPI backend), `infra/` (Helm/CDK/compose), `packages/shared-types`
- **Database**: PostgreSQL (primary), AWS Neptune (knowledge graph, openCypher over HTTPS, IAM SigV4, env-prefixed labels)
- **Auth**: Custom OAuth via authlib (Google OIDC currently, more providers planned). NOT Cognito.
- **AI**: LiteLLM proxy on EKS → Bedrock (Sonnet 4.6 for personas, Haiku 4.5 for summaries/extraction)
- **Infra**: EKS, RDS, GitHub Actions CI, ArgoCD/GitOps deployment, AWS Secrets Manager via external-secrets
- **Existing notification system**: Bell icon + menu item + email capability. Currently used for legacy membership invites. Supports searching existing users or entering email for new user invites.
- **Existing legacy membership model**: Roles are Creator, Admin, Advocate, Admirer. Visibility is public or private. Members describe their relationship to the legacy subject (nicknames, who-they-are-to-you, who-you-are-to-them, character traits, relationship type).
- **Existing legacy lookup**: When creating a new legacy, basic lookup logic suggests existing legacies to help avoid duplicates.
- **SEO**: Prerender for React SPA indexing
- **Task runner**: `just`; Python managed with `uv`; Node 22, npm primary
- **Public repo**: github.com/mosaic-stories/mosaic-life (GPLv3)
- **AI agent guidance**: CLAUDE.md and AGENTS.md exist in the repo

---

## Feature Overview

This feature introduces three interconnected capabilities:

1. **User Profiles** — Every user gets a profile page with configurable visibility controls, giving them a presence on the platform beyond their legacy memberships.
2. **User-to-User Connections** — A symmetric, mutual-consent connection system that lets users form direct relationships with each other, independent of legacies.
3. **Legacy Access Requests** — Users can request access to legacies (not just be invited), reducing friction for organic growth and helping prevent duplicate legacies.

---

## Part 1: User Profiles

### 1.1 Username System

Every user gets a username that serves as their unique, URL-safe identifier.

**Auto-generation on account creation:**
- Derive from the user's display name: lowercase, replace spaces with hyphens, append a short random disambiguator (4-6 alphanumeric chars). Example: `joe-smith-a1b2`.
- Users can customize their username later from profile settings.

**Validation rules:**
- Lowercase alphanumeric and hyphens only
- Min 3 characters, max 30 characters
- Must not start or end with a hyphen
- Must be unique across the platform
- Maintain a reserved words blocklist: `admin`, `api`, `settings`, `legacy`, `legacies`, `help`, `support`, `about`, `auth`, `login`, `signup`, `profile`, `user`, `users`, `story`, `stories`, `media`, `search`, `explore`, `notifications`, `account`, `privacy`, `terms`, `null`, `undefined`, `system`. Review existing route paths and add any that would conflict.

**Username changes:**
- Users can change their username from profile settings.
- Enforce a cooldown: one change per 60 days.
- When a username changes, retain the old username in a `username_history` table for 90 days. During that retention period, the old URL redirects (301) to the new one. After 90 days, the old username is released.

**URL structure:** `mosaiclife.me/u/{username}`

### 1.2 Profile Page

A public-facing page at `/u/{username}` that displays information the user has chosen to share.

**Profile content sections:**
- **Header**: Display name, profile photo (if set), bio (optional, short text)
- **Legacies**: Legacy cards showing legacies the user is a member of (minimal view: legacy name, subject name, subject photo, story count)
- **Stories**: Story cards for stories the user has authored
- **Media**: Media items the user has contributed
- **Connections**: List of the user's connections (display names and profile photos)

**Design direction:**
- Follow the existing warm parchment palette (cream/gold, Georgia serif)
- Minimal, clean layout — the profile should feel personal and intimate, not like a social media wall
- Two possible states: "full profile" for users who've opted in to sharing, and a "nameplate" view for users who haven't (just display name and profile photo, with a Connect button if applicable)

### 1.3 Profile Visibility Settings

All visibility settings live in a dedicated settings area. **Everything defaults to the most private option.**

**Discoverability setting:**
- `discoverable`: boolean, default `false`
- When `true`, the user appears in platform-wide search results
- When `false`, the user can only be found by co-members of shared legacies (and eventually friends-of-friends, but not for MVP)

**Profile audience tiers** (used for per-content-type visibility):
- `nobody` — hidden entirely (default for all content types)
- `connections` — visible only to mutual connections
- `authenticated` — visible to any logged-in user
- `public` — visible to anyone, including unauthenticated visitors and search engines

**Per-content-type visibility settings:**
- `visibility_legacies`: audience tier (default: `nobody`)
- `visibility_stories`: audience tier (default: `nobody`)
- `visibility_media`: audience tier (default: `nobody`)
- `visibility_connections`: audience tier (default: `nobody`)
- `visibility_bio`: audience tier (default: `connections`)

Note: These are content-type-level settings, not per-item. A user cannot show some legacies but hide others — it's all or nothing per content type. Per-item overrides may come later but are out of scope.

**Implementation note:** The profile page rendering logic must evaluate the viewer's relationship to the profile owner at request time (unauthenticated, authenticated, connected) and filter sections accordingly. This is the core access control gate for profiles.

### 1.4 SEO Considerations

- Profile pages with `public`-tier content should be indexable via Prerender
- Generate appropriate meta tags (og:title, og:description, og:image) for social sharing
- Profiles with all content set to `nobody` or `connections` should include `noindex` meta tags

---

## Part 2: User-to-User Connections

### 2.1 Connection Model

Connections are **symmetric and require mutual consent**. User A sends a request, User B accepts or declines.

**Connection record:**
- This is a join/association — store the pair of user IDs, the connection status, and timestamps
- Statuses: `pending`, `accepted`, `declined`, `removed`
- Track `requested_by` (which user initiated), `requested_at`, `resolved_at`
- On decline: record is kept (to prevent re-request spam), but the relationship is effectively null
- On removal: soft-delete — set status to `removed`, retain the record. Plan for hard-delete capability in a future iteration where the removing user can choose to purge their relationship data entirely.

### 2.2 Relationship Data (Shared Model)

Relationship data is **per-user, per-relationship-context** — it describes how one user sees their relationship with another user or with a legacy. This is the same conceptual model used in legacy membership today.

**Design a reusable `Relationship` model** that can be attached to different contexts:
- User-to-User connection (each side stores their own)
- User-to-Legacy membership (already exists — refactor to use the shared model)

**Relationship fields (captured per-side):**
- `relationship_type`: enum or controlled vocabulary (family, friend, colleague, neighbor, etc.)
- `who_they_are_to_me`: freeform short text ("my brother", "my college roommate")
- `who_i_am_to_them`: freeform short text ("his sister", "her coworker")
- `nicknames`: array of strings
- `character_traits`: array of strings

**Privacy of relationship data:** Each user's relationship description is **private to that user only**. User A's description of User B is never shown to User B. This is critical for trust — a user's perspective on a relationship is their own.

**Collection at connection time (MVP):** When sending a connection request, capture only:
- `relationship_type` (required)
- A freeform message / note (optional, shown to the recipient as context for the request)

The remaining relationship fields (nicknames, traits, who-they-are/who-i-am) can be filled in later from a connection management UI. The recipient does NOT fill in relationship data at accept time — they can do so later if they choose.

**Refactoring note:** The existing legacy membership relationship data should be migrated to use this shared model. This is a refactor of the existing data, not new functionality. Handle this carefully — the existing schema should be wrapped into the new model without breaking current behavior. This can be phased: Phase 1 introduces the new model for connections; Phase 2 migrates legacy membership to use it.

### 2.3 Connection Request Flow

1. **User A visits User B's profile** (or finds them via search, or sees them as a co-member of a legacy)
2. **User A clicks "Connect"** and is prompted to select a relationship type and optionally write a message
3. **Request is created** with status `pending`
4. **User B receives a notification** (in-app bell + email) with User A's name, relationship type, and message
5. **User B can Accept or Decline** from the notification or from their pending requests tab
6. **On Accept**: status becomes `accepted`, User A is notified of acceptance
7. **On Decline**: status becomes `declined`, User A receives a gentle decline notification (e.g., "{Name} is not accepting new connections at this time" — do NOT frame it as a personal rejection)

**Constraints:**
- A user cannot send a connection request to someone they already have a pending, accepted, or recently-declined request with. After a decline, enforce a cooldown before re-requesting (30 days).
- Rate limit: a user can have at most 20 pending outgoing requests at any time.

### 2.4 Connection Management

Users manage their connections from a tab in **User Settings**.

**Connections tab shows:**
- List of current connections with display name, photo, relationship type, and connected-since date
- Ability to view/edit relationship data for each connection
- Ability to remove a connection (with confirmation dialog — explain that this revokes connection-level visibility in both directions)

**Pending tab shows:**
- Incoming requests (with accept/decline actions)
- Outgoing requests (with cancel option)

### 2.5 Connection Removal

When a connection is removed:
- Connection status is set to `removed`
- Both users immediately lose access to any profile content scoped to `connections` on the other's profile
- Legacy memberships are **unaffected** — if both users are members of the same legacy, they still see each other's contributions there
- Relationship data is retained (soft-delete) but hidden from both parties. Future hard-delete option will allow the removing user to purge their relationship data entirely.

### 2.6 Neptune Sync (Dual Storage)

The social graph should be stored in both PostgreSQL (source of truth for ACID operations) and Neptune (for graph queries).

- PostgreSQL is the primary store for all connection data and relationship records
- On connection creation, acceptance, removal: sync the relevant edges to Neptune
- Neptune edges should use the same env-prefixed labeling convention as existing graph data
- This sync can be async (event-driven) — it does not need to be in the same transaction
- Neptune enables future queries like: "find all legacies where someone within 2 hops of me is a member" — not needed for MVP but the sync lays the groundwork

---

## Part 3: Legacy Access Requests

### 3.1 Request Flow

Users can request access to legacies they are not currently members of.

**Where requests originate:**
1. **Public legacies**: Any authenticated user can see a "Request Access" button on a public legacy page.
2. **Private legacies visible through connections**: If a user's connection has opted to show their legacy memberships, and the user can see a private legacy on that connection's profile, they can request access from the minimal legacy card.
3. **Duplicate detection during legacy creation**: The existing legacy lookup logic that suggests existing legacies when creating a new one should be enhanced to also suggest legacies that the user's connections are members of (only if those connections have opted to share their legacy memberships). Instead of just "this legacy already exists," the flow can say "Your connection {name} is a member of a legacy for {subject name} — would you like to request access instead?"

### 3.2 Request Details

**Request record:**
- `user_id`: the requesting user
- `legacy_id`: the target legacy
- `requested_role`: `admirer` (default) or `advocate`
- `message`: freeform text explaining their relationship to the legacy subject (e.g., "I was her college roommate for 4 years")
- `status`: `pending`, `approved`, `declined`, `expired`
- `reviewed_by`: the admin/creator who acted on the request
- `assigned_role`: the role actually granted (may differ from requested role)
- `created_at`, `resolved_at`

**Constraints:**
- Users cannot request `admin` or `creator` roles — those must be granted by an existing admin/creator
- If the request is approved, the admin can override the requested role (e.g., approve as Admirer even if Advocate was requested, or approve as Advocate even if Admirer was requested)
- A user cannot have more than one pending request per legacy
- Rate limit: a user can have at most 10 pending legacy access requests at any time
- Requests that go unanswered for 60 days automatically expire

### 3.3 Admin Approval Flow

1. **Legacy admin/creator receives a notification** (in-app + email) when a request is submitted
2. **The notification or approval screen shows:**
   - Requester's display name and profile photo
   - The message they included with their request
   - The role they requested
   - A list of current legacy members who are connected to the requester (just names — this helps the admin assess trust without revealing which specific member is the connection. For MVP, simply list the names without indicating the connection path.)
3. **Admin can Approve (with role selection) or Decline**
4. **On Approve**: user is added as a member with the assigned role, user receives a notification
5. **On Decline**: user receives a gentle decline notification. Similar to connection declines, frame it softly — "{Legacy name} is not accepting new members at this time" rather than a personal rejection.

### 3.4 Integration with Existing Invite System

The existing invite flow (admin searches for a user or enters an email) should continue to work unchanged. Access requests are a parallel path — they don't replace invites, they supplement them.

On the legacy admin's management screen, there should be a section showing pending access requests alongside the existing member management UI.

---

## Part 4: Notification System Extensions

### 4.1 New Notification Types

Extend the existing notification model with new types. All notifications follow the same data model pattern with a `type` discriminator and context-specific metadata.

**New types:**
- `connection_request_received` — "Joe Smith would like to connect with you" + relationship type + message
- `connection_request_accepted` — "Sarah Jones accepted your connection request"
- `connection_request_declined` — "{Name} is not accepting new connections at this time"
- `legacy_access_request_received` — "{Name} has requested to join {Legacy Name} as {role}" (admin-facing)
- `legacy_access_request_approved` — "You've been added to {Legacy Name} as {role}"
- `legacy_access_request_declined` — "{Legacy Name} is not accepting new members at this time"

### 4.2 Email Notifications

All new notification types should trigger email notifications using the existing email infrastructure. Follow the same patterns and templates currently used for legacy invite emails.

### 4.3 Settings Tab

Add a **"Requests & Connections"** tab (or similar) within User Settings that provides:
- Pending incoming connection requests
- Pending outgoing connection requests
- Pending incoming legacy access requests (for legacies the user admins)
- Pending outgoing legacy access requests
- Current connections list with relationship management

---

## Part 5: Data Model Summary

### New PostgreSQL Tables

```
usernames (or add columns to existing users table)
├── user_id (FK → users)
├── username (unique, indexed)
├── created_at
├── updated_at
└── previous_username_released_at (nullable, tracks cooldown)

username_history
├── id
├── user_id (FK → users)
├── username (the old username)
├── changed_at
├── expires_at (changed_at + 90 days)
└── redirects_to_username

profile_settings
├── user_id (FK → users, unique)
├── discoverable (boolean, default false)
├── visibility_legacies (enum: nobody|connections|authenticated|public, default nobody)
├── visibility_stories (enum, default nobody)
├── visibility_media (enum, default nobody)
├── visibility_connections (enum, default nobody)
├── visibility_bio (enum, default connections)
├── updated_at

connections
├── id
├── user_a_id (FK → users) — always the lower user_id for consistent ordering
├── user_b_id (FK → users) — always the higher user_id
├── status (enum: pending|accepted|declined|removed)
├── requested_by (FK → users)
├── message (text, nullable — the connection request message)
├── requested_at
├── resolved_at
├── declined_cooldown_until (nullable, set on decline)
├── removed_at (nullable)
├── UNIQUE(user_a_id, user_b_id)

relationships (shared model — replaces/wraps existing legacy membership relationship data)
├── id
├── owner_user_id (FK → users) — the user who provided this data
├── context_type (enum: connection|legacy_membership)
├── context_id (FK → connections.id or legacy_memberships.id depending on context_type)
├── relationship_type (enum or controlled vocab: family, friend, colleague, neighbor, etc.)
├── who_they_are_to_me (text, nullable)
├── who_i_am_to_them (text, nullable)
├── nicknames (text[] or jsonb)
├── character_traits (text[] or jsonb)
├── created_at
├── updated_at

legacy_access_requests
├── id
├── user_id (FK → users)
├── legacy_id (FK → legacies)
├── requested_role (enum: admirer|advocate)
├── assigned_role (enum: admirer|advocate|admin, nullable — set on approval)
├── message (text, nullable)
├── status (enum: pending|approved|declined|expired)
├── reviewed_by (FK → users, nullable)
├── created_at
├── resolved_at
├── expires_at (created_at + 60 days)
├── UNIQUE(user_id, legacy_id) WHERE status = 'pending'
```

### Neptune Graph Edges (synced from PostgreSQL)

- `CONNECTED_TO` edge between user nodes (bidirectional semantically, stored as single edge)
- `MEMBER_OF` edge between user and legacy nodes (may already exist)
- Relationship metadata can be stored as edge properties if needed for graph queries

### Migration Notes

- Existing users get auto-generated usernames and default profile_settings rows on migration
- Existing legacy membership relationship data should be wrapped into the new `relationships` table in Phase 2 (after connections are stable). Phase 1 can introduce the `relationships` table for connections only and leave legacy memberships on their existing schema.

---

## Part 6: API Endpoints

### Profiles
- `GET /api/users/{username}` — public profile page data (filtered by viewer's relationship to profile owner)
- `PATCH /api/users/me/profile` — update bio, display name, photo
- `PATCH /api/users/me/profile/settings` — update visibility settings
- `PATCH /api/users/me/username` — change username (enforces cooldown)
- `GET /api/users/search?q={query}` — search for users (respects discoverability setting)

### Connections
- `POST /api/connections/request` — send a connection request
- `PATCH /api/connections/{connection_id}/accept` — accept a request
- `PATCH /api/connections/{connection_id}/decline` — decline a request
- `DELETE /api/connections/{connection_id}` — remove a connection (soft-delete)
- `GET /api/connections` — list current user's connections
- `GET /api/connections/requests/incoming` — pending incoming requests
- `GET /api/connections/requests/outgoing` — pending outgoing requests
- `GET /api/connections/{connection_id}/relationship` — get relationship data for a connection
- `PATCH /api/connections/{connection_id}/relationship` — update relationship data

### Legacy Access Requests
- `POST /api/legacies/{legacy_id}/access-requests` — submit a request
- `GET /api/legacies/{legacy_id}/access-requests` — list pending requests (admin only)
- `PATCH /api/legacies/{legacy_id}/access-requests/{request_id}/approve` — approve with role
- `PATCH /api/legacies/{legacy_id}/access-requests/{request_id}/decline` — decline
- `GET /api/access-requests/outgoing` — current user's pending outgoing requests

---

## Part 7: UI Components

### New Pages/Views
- **Profile page** (`/u/{username}`) — renders profile content filtered by viewer relationship
- **Requests & Connections tab** in User Settings — connection management, pending requests

### New Components
- **ConnectButton** — contextual button shown on profiles and user search results. States: Connect, Pending, Connected, Reconnect (after cooldown)
- **ConnectionRequestModal** — captures relationship type, optional message
- **ConnectionCard** — displays a connection in the connections list with relationship info
- **RequestAccessButton** — shown on legacy pages and legacy cards on connection profiles
- **LegacyAccessRequestModal** — captures requested role and message
- **LegacyAccessRequestCard** — shown to admins in legacy management, includes requester info and connected members list
- **ProfileVisibilitySettings** — toggle controls for each content-type visibility setting
- **UserSearchResult** — compact user card shown in search results with Connect action
- **MinimalLegacyCard** — the "nameplate" view shown on connection profiles for opted-in legacy memberships (legacy name, subject name, subject photo, story count, Request Access button)

### Modifications to Existing Components
- **Legacy creation flow**: Enhance existing duplicate-detection to also surface legacies where the user's connections are members (only for connections who've opted to share legacy memberships)
- **Legacy admin/management page**: Add section for pending access requests
- **Notification components**: Extend to handle new notification types with appropriate context-specific rendering
- **User Settings**: Add the Requests & Connections tab

### Design Notes
- Follow the existing warm parchment palette (cream, gold, earth tones) and Georgia serif typography
- Interactions should feel personal and heartfelt — avoid clinical or social-media-like patterns
- Decline notifications should be gentle and impersonal ("not accepting at this time") rather than personal rejections
- Connection and request flows should feel lightweight — minimal required fields, with the option to enrich later
- The profile page should feel like a personal space, not a feed. Think "about me" page, not "timeline."

---

## Implementation Phasing Recommendation

### Phase 1: Foundation
- Username system (auto-generation, validation, URL routing, change with cooldown)
- Profile settings model and visibility controls
- Profile page (basic rendering with visibility filtering)
- User search (respecting discoverability)

### Phase 2: Connections
- Connection request/accept/decline flow
- Relationship data model (for connections only initially)
- Connection management UI in Settings
- Neptune sync for connection edges
- Notifications for connection events

### Phase 3: Legacy Access Requests
- Request submission flow
- Admin approval flow with connected-members display
- Integration with legacy creation duplicate detection
- Notifications for access request events
- Minimal legacy card ("nameplate") on connection profiles

### Phase 4: Shared Relationship Model Migration
- Refactor existing legacy membership relationship data to use the shared `relationships` table
- Ensure backward compatibility with all existing legacy membership features

---

## Testing Considerations

- **Privacy boundary tests**: Verify that content scoped to `connections` is truly invisible to non-connected authenticated users. Verify that non-discoverable users do not appear in search. Verify that relationship data is never exposed to the other party.
- **Connection lifecycle tests**: Request → accept → remove flow; request → decline → cooldown → re-request flow; concurrent requests between two users
- **Access control tests**: Legacy access request by non-connected user for public legacy; request by connected user for private legacy visible on connection's profile; admin approval with role override; request expiration
- **Username tests**: Uniqueness, reserved words, cooldown enforcement, redirect behavior during retention period
- **Notification tests**: All 6 new notification types trigger correctly with appropriate content and email delivery