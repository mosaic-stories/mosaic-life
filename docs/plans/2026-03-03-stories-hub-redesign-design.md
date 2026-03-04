# Stories Hub Redesign — Design Document

**Date:** 2026-03-03
**Status:** Draft
**Related:** [Legacies Hub Design](2026-03-03-legacies-hub-redesign-design.md)

## Goal

Redesign the `/stories` page from a placeholder into a full Stories Hub — a dedicated, stories-focused experience that mirrors the Legacies Hub pattern but surfaces story-specific data like drafts, evolution history, top legacies by story count, and favorites given.

The Legacies Hub keeps its lightweight Stories tab for cross-cutting glances. The Stories Hub becomes the deep-dive destination for users who want to manage, discover, and track their writing.

## Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Stories                          [+ Write a Story] │
│  Your stories, drafts, and writing activity.        │
├─────────────────────────────────────────────────────┤
│  📝 12 My Stories  ❤️ 8 Favorites  ✨ 3 Evolved     │
│  👥 5 Legacies                                      │
├─────────────────────────────────────────────────────┤
│  Top Legacies:  (Margaret) 7  (James) 4  (Rosa) 3  │
├─────────────────────────────────────────────────────┤
│  [All Stories]  [Drafts]  [Activity]                │
│  ─────────────────────────────────────────          │
│  (tab content)                                      │
└─────────────────────────────────────────────────────┘
```

URL-driven state via `useSearchParams`: `?tab=all-stories&filter=all`

## Components

### StoryStatsBar

Four-stat row (same visual pattern as `StatsBar` in the Legacies Hub):

| Stat | Icon | Label | Source |
|------|------|-------|--------|
| My Stories | `FileText` | My Stories | `GET /api/stories/stats` → `my_stories_count` |
| Favorites Given | `Heart` | Favorites | `GET /api/stories/stats` → `favorites_given_count` |
| Stories Evolved | `Sparkles` | Evolved | `GET /api/stories/stats` → `stories_evolved_count` |
| Legacies Written For | `Landmark` | Legacies | `GET /api/stories/stats` → `legacies_written_for_count` |

### TopLegaciesChips

Horizontal chip row showing the user's top legacies by story count (up to 6). Each chip shows:
- Legacy profile image (or fallback icon)
- First name
- Story count badge

Clicking a chip navigates to `/legacy/:legacyId`.

Data from `GET /api/stories/top-legacies?limit=6`.

Hidden when user has no stories.

### All Stories Tab

Quick filters: **All** | **My Stories** | **Shared** | **Favorites**

- Uses `useScopedStories(scope)` with the updated response shape
- Grid of `StoryCard` components with `FavoriteButton`
- Clicking a card navigates to `/legacy/:legacyId/story/:storyId` (using the first legacy association)
- Count badges on filter pills from `StoryScopedResponse.counts`
- Empty states tailored per filter

### Drafts Tab

Shows the user's draft stories only (`scope=drafts`).

- No quick filters
- Each card shows legacy context and encourages "Continue Writing"
- Empty state: "No drafts in progress. Start writing a new story!"

### Activity Tab

Story-related activity feed.

Quick filters: **All Activity** | **My Activity**

- Uses `useSocialFeed` filtered client-side to `entity_type === 'story'`
- Shows: story created, updated, favorited, evolved events
- Clicking navigates to the story

### LegacyPickerDialog

Modal triggered by the "Write a Story" CTA button.

- Lists the user's legacies (from `useLegacies('all')`)
- User picks a legacy, dialog navigates to `/legacy/:id/story/new`
- Displays legacy avatar, name, and story count for context

## Backend Changes

### New: `GET /api/stories/stats`

New endpoint returning story-specific stats for the authenticated user.

**Response:**
```json
{
  "my_stories_count": 12,
  "favorites_given_count": 8,
  "stories_evolved_count": 3,
  "legacies_written_for_count": 5
}
```

**Queries:**
- `my_stories_count`: `COUNT(stories) WHERE author_id = user_id`
- `favorites_given_count`: `COUNT(user_favorites) WHERE user_id = user_id AND entity_type = 'story'`
- `stories_evolved_count`: `COUNT(DISTINCT story_evolution_sessions.story_id) WHERE created_by = user_id AND phase = 'completed'`
- `legacies_written_for_count`: `COUNT(DISTINCT story_legacies.legacy_id) JOIN stories WHERE stories.author_id = user_id`

### New: `GET /api/stories/top-legacies?limit=6`

Returns legacies the user has written the most stories about.

**Response:**
```json
[
  {
    "legacy_id": "uuid",
    "legacy_name": "Margaret Chen",
    "profile_image_url": "/api/media/.../content",
    "story_count": 7
  }
]
```

**Query:** `SELECT legacy_id, COUNT(*) FROM story_legacies JOIN stories ON ... WHERE stories.author_id = user_id GROUP BY legacy_id ORDER BY COUNT(*) DESC LIMIT :limit`, joined with legacy name and profile image.

### Updated: `GET /api/stories/?scope=...`

**New scopes:**
- `all` — all stories the user can see (authored + shared). Combines the mine + shared queries.
- `drafts` — user's stories with `status = 'draft'`

**New response shape** (consistent with legacies endpoint):

When `scope` is provided, returns:
```json
{
  "items": [StorySummary, ...],
  "counts": {
    "all": 15,
    "mine": 12,
    "shared": 3
  }
}
```

When `scope` is NOT provided (backward compat for legacy_id/orphaned filters), returns `list[StorySummary]` as before.

### Schema additions

```python
class StoryScopeCounts(BaseModel):
    all: int
    mine: int
    shared: int

class StoryScopedResponse(BaseModel):
    items: list[StorySummary]
    counts: StoryScopeCounts

class StoryStatsResponse(BaseModel):
    my_stories_count: int
    favorites_given_count: int
    stories_evolved_count: int
    legacies_written_for_count: int

class TopLegacyResponse(BaseModel):
    legacy_id: UUID
    legacy_name: str
    profile_image_url: str | None
    story_count: int
```

## Frontend Changes

### New files (`apps/web/src/components/stories-hub/`)

| File | Description |
|------|-------------|
| `StoryStatsBar.tsx` | Story-specific stats bar |
| `StoryStatsBar.test.tsx` | Tests |
| `TopLegaciesChips.tsx` | Top legacies by story count chip row |
| `TopLegaciesChips.test.tsx` | Tests |
| `AllStoriesTabContent.tsx` | All Stories tab with quick filters |
| `DraftsTabContent.tsx` | Drafts tab |
| `StoryActivityTabContent.tsx` | Activity tab filtered to story events |
| `LegacyPickerDialog.tsx` | Legacy selection dialog for new story CTA |
| `LegacyPickerDialog.test.tsx` | Tests |

### New hooks & API (`apps/web/src/features/story/`)

| Addition | Description |
|----------|-------------|
| `api/stories.ts` — `getStoryStats()` | `GET /api/stories/stats` |
| `api/stories.ts` — `getTopLegacies(limit)` | `GET /api/stories/top-legacies` |
| `api/stories.ts` — `StoryScopedResponse` type | New response wrapper |
| `api/stories.ts` — `StoryScope` update | Add `'all'` and `'drafts'` |
| `hooks/useStories.ts` — `useStoryStats()` | Query hook for stats |
| `hooks/useStories.ts` — `useTopLegacies(limit)` | Query hook for top legacies |
| `hooks/useStories.ts` — `useScopedStories` update | Handle `StoryScopedResponse` |

### Modified files

| File | Change |
|------|--------|
| `StoriesPage.tsx` | Full rewrite as hub page |
| `StoriesPage.test.tsx` | New tests for hub |
| `StoriesTabContent.tsx` (legacies hub) | Update for `StoryScopedResponse` wrapper |
| `StoryCard.tsx` | Add optional `onClick` prop for navigation |

## Navigation

- `StoryCard` click → `/legacy/:legacyId/story/:storyId` (uses first legacy association)
- "Write a Story" button → `LegacyPickerDialog` → pick legacy → `/legacy/:legacyId/story/new`
- Top Legacies chip click → `/legacy/:legacyId`
- Activity item click → `/legacy/:legacyId/story/:storyId`

## Testing Strategy

- Unit tests for all new components (mocked hooks)
- Unit tests for new hooks (mocked API)
- Backend tests for new endpoints (`test_story_stats.py`, `test_story_top_legacies.py`)
- Backend tests for new scopes (`test_story_scope.py` — extend existing)
- Update existing tests affected by response shape change
- Full suite validation: `just validate-backend` + `npm run test -- --run` + `npm run lint`
