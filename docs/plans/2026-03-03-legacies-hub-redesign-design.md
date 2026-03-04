# Legacies Hub Redesign — Design Document

**Date:** 2026-03-03
**Status:** Approved

## Overview

Redesign the Legacies page from a simple two-section layout (My Legacies + Explore) into a comprehensive hub with stats, recently viewed, and tabbed browsing across legacies, stories, and activity.

## Page Layout

```
┌─────────────────────────────────────────────┐
│  Page Header (title + subtitle + New Legacy) │
├─────────────────────────────────────────────┤
│  StatsBar                                    │
│  [Legacies: 3] [Stories: 5] [Links: 72] [♥: 2] │
├─────────────────────────────────────────────┤
│  RecentlyViewedChips (horizontal scroll)     │
│  ○ Margaret  ○ Captain Richard  ○ Coach Earl │
├─────────────────────────────────────────────┤
│  Tabs: [Legacies] [Stories] [Activity]       │
│  ─────────────────────────────────────────── │
│  QuickFilters (per tab)                      │
│  ─────────────────────────────────────────── │
│  Content Grid (cards)                        │
└─────────────────────────────────────────────┘
```

## Component Hierarchy

```
LegaciesPage (rewritten)
├── PageHeader (inline — title, subtitle, + New Legacy button)
├── StatsBar (new)
├── RecentlyViewedChips (new — compact avatar chips)
└── Tabs (Radix Tabs)
    ├── LegaciesTabContent (new)
    │   ├── QuickFilters (new, reusable)
    │   └── LegacyCard[] (existing)
    ├── StoriesTabContent (new)
    │   ├── QuickFilters (reused)
    │   └── StoryCard[] (existing)
    └── ActivityTabContent (new)
        ├── QuickFilters (reused — My Activity / All Activity)
        └── ActivityFeedItem[] (existing)
```

## Tab Definitions

### Legacies Tab

Quick filters: All, My Legacies, Connected, Favorites

- **All** = all legacies where the user has any membership role (creator, admin, advocate, admirer)
- **My Legacies** = legacies the user created
- **Connected** = legacies where the user is a member but not the creator
- **Favorites** = legacies the user has favorited

Filter counts returned as response metadata from the API.

### Stories Tab

Quick filters: My Stories, Shared, Favorites

- **My Stories** = stories authored by the user
- **Shared** = stories by others on legacies the user is a member of
- **Favorites** = stories the user has favorited

### Activity Tab

Quick filters: My Activity, All Activity

- **My Activity** = the user's own actions (existing `GET /api/activity`)
- **All Activity** = social feed including co-member actions (existing `GET /api/activity/feed`)

## Component Details

### StatsBar

- Horizontal row of 4 stat cards: Legacies, Stories, Connections, Favorites
- Icons: Landmark, BookOpen, Link, Heart (from lucide-react)
- Single `useStats()` call (extended response)
- Skeleton loading state

### RecentlyViewedChips

- Horizontal scrollable row of compact avatar circle + name chips
- Click navigates to `/legacy/:id`
- Uses existing `useRecentlyViewed('legacy', 6)` hook
- Hides entirely if no items or tracking disabled

### QuickFilters (shared)

- Props: `options: { key, label, count? }[]`, `activeKey`, `onChange`
- Pill-shaped toggle buttons
- Counts shown in parentheses when provided

### Tab Content Behavior

- Lazy load data only when tab is selected
- TanStack Query caching for instant tab switching
- Responsive grid: 1 col mobile, 2 col tablet, 3 col desktop
- "Create New Legacy" dashed card at end of Legacies tab grid
- Empty states per filter with contextual messaging

### URL State

- Active tab and filter stored in URL search params: `?tab=legacies&filter=connected`
- Default: `tab=legacies&filter=all`
- Makes tabs linkable/bookmarkable, preserves state on browser back

## API Changes

### Extended Stats Endpoint

`GET /api/users/me/stats` — add two new fields:

- `legacy_links_count: int` — count of active legacy-to-legacy links
- `favorites_count: int` — count of user's favorited items (all types)

### Legacies Scope Parameter

`GET /api/legacies/?scope=all|created|connected|favorites`

- `all` (default): all legacies where user has any membership role
- `created`: legacies user created (current behavior)
- `connected`: legacies where user is member but not creator
- `favorites`: favorited legacies with enrichment

Response shape adds filter counts:

```json
{
  "items": [...],
  "counts": { "all": 8, "created": 3, "connected": 5 }
}
```

Favorites count comes from the stats endpoint.

### Stories Scope Parameter

`GET /api/stories/?scope=mine|shared|favorites`

- `mine`: stories authored by the user
- `shared`: stories by others on legacies the user is a member of
- `favorites`: favorited stories

## File Changes

### New Frontend Files

- `apps/web/src/components/legacies-hub/StatsBar.tsx`
- `apps/web/src/components/legacies-hub/RecentlyViewedChips.tsx`
- `apps/web/src/components/legacies-hub/QuickFilters.tsx`
- `apps/web/src/components/legacies-hub/LegaciesTabContent.tsx`
- `apps/web/src/components/legacies-hub/StoriesTabContent.tsx`
- `apps/web/src/components/legacies-hub/ActivityTabContent.tsx`

### Modified Frontend Files

- `apps/web/src/pages/LegaciesPage.tsx` — rewritten to compose new components
- `apps/web/src/features/legacy/api/legacies.ts` — add `scope` param to `getLegacies()`
- `apps/web/src/features/legacy/hooks/useLegacies.ts` — update `useLegacies()` to accept scope
- `apps/web/src/features/story/api/stories.ts` — add `scope` param to `getStories()`
- `apps/web/src/features/story/hooks/useStories.ts` — update `useStories()` to accept scope

### Modified Backend Files

- `services/core-api/app/routes/settings.py` — extend stats query
- `services/core-api/app/services/settings.py` — add legacy_links_count, favorites_count queries
- `services/core-api/app/schemas/settings.py` — add fields to UserStatsResponse
- `services/core-api/app/routes/legacy.py` — add `scope` query param with filter logic
- `services/core-api/app/schemas/legacy.py` — add response model with counts metadata
- `services/core-api/app/routes/story.py` — add `scope` query param with filter logic

### Reused As-Is

- `LegacyCard`, `StoryCard`, `ActivityFeedItem`, `FavoriteButton`
- All activity hooks and API functions
- Radix Tabs UI component

## Out of Scope

- Search functionality (deferred to later)
- Pagination / infinite scroll (can be added later; initial load is sufficient for MVP)
