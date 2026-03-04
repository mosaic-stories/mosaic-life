# Connections Hub Redesign — Design Document

**Date:** 2026-03-03
**Status:** Approved
**Related:** [Legacies Hub Design](2026-03-03-legacies-hub-redesign-design.md), [Stories Hub Design](2026-03-03-stories-hub-redesign-design.md)

## Goal

Rename "Conversations" to "Connections" and redesign the `/connections` page from a placeholder into a full Connections Hub — a people-focused experience that surfaces both AI persona conversations and human connections through shared legacy membership. Follows the same hub pattern as Legacies and Stories while introducing connection-specific data shapes.

## Page Layout

```
┌──────────────────────────────────────────────────┐
│  Connections                      [+ New Chat]    │
│  Your personas, people, and conversations.        │
├──────────────────────────────────────────────────┤
│  ConnectionsStatsBar                              │
│  [💬 42 Conversations] [👥 7 People]              │
│  [🔗 5 Shared Legacies] [✨ 2 Personas Used]      │
├──────────────────────────────────────────────────┤
│  TopConnectionsChips (horizontal scroll)          │
│  ○ Sarah (3)  ○ James (2)  ○ Rosa (1)            │
├──────────────────────────────────────────────────┤
│  FavoritePersonasChips (horizontal scroll)         │
│  📖 Biographer (28)  ❤️ Friend (14)               │
├──────────────────────────────────────────────────┤
│  Tabs: [Personas] [People] [Activity]             │
│  ──────────────────────────────────────────────── │
│  QuickFilters (per tab)                           │
│  ──────────────────────────────────────────────── │
│  Content Grid / List                              │
└──────────────────────────────────────────────────┘
```

## Component Hierarchy

```
ConnectionsPage (rewritten from ConversationsPage)
├── PageHeader (inline — title, subtitle, + New Chat button)
├── ConnectionsStatsBar (new)
├── TopConnectionsChips (new — people with most shared legacies)
├── FavoritePersonasChips (new — personas ranked by conversation count)
└── Tabs (Radix Tabs)
    ├── PersonasTabContent (new)
    │   ├── QuickFilters (reused from legacies-hub)
    │   └── ConversationCard[] (new)
    ├── PeopleTabContent (new)
    │   ├── QuickFilters (reused)
    │   └── PersonCard[] (new)
    └── ConnectionsActivityTabContent (new)
        ├── QuickFilters (reused)
        └── ActivityFeedItem[] (existing)
```

## Rename: Conversations → Connections

- Route changes: `/conversations` → `/connections`
- Nav label: "Conversations" → "Connections"
- Nav icon: `MessageCircle` → `Link2` (or keep `MessageCircle` — TBD during implementation)
- File rename: `ConversationsPage.tsx` → `ConnectionsPage.tsx`
- Update router, nav config, and all tests referencing "Conversations"

## Tab Definitions

### Personas Tab

Quick filters: All, Biographer, Friend (expandable as more personas are enabled)

- **All** = all AI conversations across all personas
- **Biographer** = conversations with The Biographer persona
- **Friend** = conversations with The Friend persona

Each card shows:
- Persona icon + name
- Legacy context (which legacy this conversation is about)
- Last message preview (truncated)
- Message count badge
- Relative timestamp

Sorted by most recent conversation first.

Filter counts from existing `GET /api/ai/conversations` response (counted client-side per persona).

### People Tab

Quick filters: All, Co-creators, Collaborators

- **All** = all people the user shares at least one legacy with
- **Co-creators** = people who are creators or admins on shared legacies
- **Collaborators** = people who are advocates or admirers on shared legacies

Each card shows:
- User avatar + display name
- Shared legacies count badge
- Compact list of shared legacy names
- Role context

### Activity Tab

Quick filters: All Activity, My Activity

- **All Activity** = social feed filtered to conversation and connection events
- **My Activity** = user's own conversation and connection events only

Uses existing `useSocialFeed` filtered client-side to relevant entity types (`conversation`, `legacy` membership events).

## Component Details

### ConnectionsStatsBar

Horizontal row of 4 stat cards: Conversations, People, Shared Legacies, Personas Used

- Icons: MessageCircle, Users, Link, Sparkles (from lucide-react)
- Single `useConnectionsStats()` call
- Skeleton loading state

### TopConnectionsChips

Horizontal scrollable row of avatar + name + count chips showing people the user shares the most legacies with (up to 6).

- Each chip shows user avatar (or fallback), display name, shared legacy count badge
- Click navigates to user profile (or legacy context — TBD based on available routes)
- Uses `useTopConnections(6)` hook
- Hidden when user has no connections

### FavoritePersonasChips

Horizontal scrollable row showing personas ranked by conversation count (up to 4).

- Each chip shows persona icon, persona name, conversation count badge
- Click scrolls to / activates the Personas tab with that persona filter
- Uses `useFavoritePersonas(4)` hook
- Hidden when user has no conversations

### ConversationCard (new)

Card for displaying a conversation in the Personas tab grid.

- Persona icon + name header
- Legacy name as context subtitle (from conversation's legacy associations)
- Last message preview (first 100 chars, truncated)
- Message count badge
- Relative timestamp ("2h ago")
- No click-through navigation for MVP (conversation tracking normalization needed first)

### PersonCard (new)

Card for displaying a human connection in the People tab grid.

- User avatar + display name
- Shared legacies count ("3 shared legacies")
- Compact list of shared legacy names (max 3, "+N more" overflow)
- Highest shared role badge (admin > advocate > admirer)

### Tab Content Behavior

- Lazy load data only when tab is selected
- TanStack Query caching for instant tab switching
- Responsive grid: 1 col mobile, 2 col tablet, 3 col desktop
- Empty states per filter with contextual messaging

### URL State

- Active tab and filter stored in URL search params: `?tab=personas&filter=all`
- Default: `tab=personas&filter=all`
- Makes tabs linkable/bookmarkable, preserves state on browser back

### CTA: New Chat Button

- Opens a two-step dialog:
  1. Pick a legacy (reuses `LegacyPickerDialog` pattern from Stories Hub)
  2. Pick a persona
- Navigates to `/legacy/:legacyId` with AI chat panel open
- Future: may navigate to a standalone conversation page once globally-scoped conversations are supported

## API Changes

### New: `GET /api/connections/stats`

Returns connection-specific stats for the authenticated user.

**Response:**
```json
{
  "conversations_count": 42,
  "people_count": 7,
  "shared_legacies_count": 5,
  "personas_used_count": 2
}
```

**Queries:**
- `conversations_count`: `COUNT(ai_conversations) WHERE user_id = :user_id`
- `people_count`: `COUNT(DISTINCT other_user_id)` from legacy_members where both the user and another user are members
- `shared_legacies_count`: `COUNT(DISTINCT legacy_id)` from legacies where the user AND at least one other user are members
- `personas_used_count`: `COUNT(DISTINCT persona_id) FROM ai_conversations WHERE user_id = :user_id`

### New: `GET /api/connections/top-connections?limit=6`

Returns people the user shares the most legacies with.

**Response:**
```json
[
  {
    "user_id": "uuid",
    "display_name": "Sarah Chen",
    "avatar_url": "/api/media/.../content",
    "shared_legacy_count": 3
  }
]
```

**Query:** Join `legacy_members` on legacy_id where both user_id = current_user AND user_id != current_user, group by other user, order by count desc, limit.

### New: `GET /api/connections/favorite-personas?limit=4`

Returns personas ranked by conversation count for the authenticated user.

**Response:**
```json
[
  {
    "persona_id": "biographer",
    "persona_name": "The Biographer",
    "persona_icon": "BookOpen",
    "conversation_count": 28
  }
]
```

**Query:** `SELECT persona_id, COUNT(*) FROM ai_conversations WHERE user_id = :user_id GROUP BY persona_id ORDER BY COUNT(*) DESC LIMIT :limit`, enriched with persona metadata from config.

### New: `GET /api/connections/people?filter=all|co_creators|collaborators`

Returns the user's human connections with shared legacy details.

**Response:**
```json
{
  "items": [
    {
      "user_id": "uuid",
      "display_name": "Sarah Chen",
      "avatar_url": "/api/media/.../content",
      "shared_legacy_count": 3,
      "shared_legacies": [
        { "legacy_id": "uuid", "legacy_name": "Margaret Chen", "user_role": "admin", "connection_role": "advocate" }
      ],
      "highest_shared_role": "admin"
    }
  ],
  "counts": {
    "all": 7,
    "co_creators": 3,
    "collaborators": 4
  }
}
```

**Filter definitions:**
- `all`: all users who share at least one legacy
- `co_creators`: users who are creator or admin on shared legacies
- `collaborators`: users who are advocate or admirer on shared legacies

### Existing endpoints used as-is

- `GET /api/ai/conversations` — list conversations with optional `persona_id` filter (Personas tab)
- `GET /api/ai/personas` — persona metadata
- `GET /api/activity/feed` — social feed for Activity tab (client-side filtered)

## File Changes

### New Frontend Files

- `apps/web/src/components/connections-hub/ConnectionsStatsBar.tsx`
- `apps/web/src/components/connections-hub/ConnectionsStatsBar.test.tsx`
- `apps/web/src/components/connections-hub/TopConnectionsChips.tsx`
- `apps/web/src/components/connections-hub/TopConnectionsChips.test.tsx`
- `apps/web/src/components/connections-hub/FavoritePersonasChips.tsx`
- `apps/web/src/components/connections-hub/FavoritePersonasChips.test.tsx`
- `apps/web/src/components/connections-hub/PersonasTabContent.tsx`
- `apps/web/src/components/connections-hub/PersonasTabContent.test.tsx`
- `apps/web/src/components/connections-hub/PeopleTabContent.tsx`
- `apps/web/src/components/connections-hub/PeopleTabContent.test.tsx`
- `apps/web/src/components/connections-hub/ConnectionsActivityTabContent.tsx`
- `apps/web/src/components/connections-hub/ConnectionsActivityTabContent.test.tsx`
- `apps/web/src/components/connections-hub/ConversationCard.tsx`
- `apps/web/src/components/connections-hub/ConversationCard.test.tsx`
- `apps/web/src/components/connections-hub/PersonCard.tsx`
- `apps/web/src/components/connections-hub/PersonCard.test.tsx`

### New API/Hook Files

- `apps/web/src/features/connections/api/connections.ts` — API functions: `getConnectionsStats()`, `getTopConnections(limit)`, `getFavoritePersonas(limit)`, `getPeople(filter)`
- `apps/web/src/features/connections/hooks/useConnections.ts` — Query hooks: `useConnectionsStats()`, `useTopConnections(limit)`, `useFavoritePersonas(limit)`, `usePeople(filter)`

### Modified Frontend Files

- `apps/web/src/pages/ConversationsPage.tsx` → renamed to `ConnectionsPage.tsx`, rewritten as hub
- `apps/web/src/lib/navigation.ts` — rename "Conversations" to "Connections", update path and icon
- `apps/web/src/routes/index.tsx` — update route path and lazy import
- `apps/web/src/pages/PlaceholderPages.test.tsx` — update test references
- `apps/web/src/components/header/AppHeader.test.tsx` — update nav label assertion
- `apps/web/src/components/header/NavLinks.test.tsx` — update nav label and path assertions
- `apps/web/src/components/navigation/BottomTabBar.test.tsx` — update nav label assertion

### New Backend Files

- `services/core-api/app/routes/connections.py` — new router with stats, top-connections, favorite-personas, people endpoints
- `services/core-api/app/services/connections.py` — service layer with queries
- `services/core-api/app/schemas/connections.py` — Pydantic models for all response shapes
- `services/core-api/tests/routes/test_connections.py` — endpoint tests

### Modified Backend Files

- `services/core-api/app/main.py` — register connections router

### Reused As-Is

- `QuickFilters` component (from legacies-hub)
- `ActivityFeedItem` component (from activity feature)
- `LegacyPickerDialog` pattern (from stories-hub, may be adapted for two-step flow)
- All existing AI conversation hooks and API functions
- Radix Tabs UI component

## Out of Scope

- Click-through navigation from conversation cards to a conversation view (deferred until conversation tracking is normalized across evolve workspace, legacy AI chat, and future global conversations)
- Search functionality
- Pagination / infinite scroll
- Phase 2+ personas (Colleague, Family Member) — will auto-appear in filters when enabled
- Standalone conversation page (`/connections/conversation/:id`)
