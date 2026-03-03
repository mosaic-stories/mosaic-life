# Homepage Activity Sections — Design

**Goal:** Add three new sections to the authenticated homepage: a social activity feed (non-ephemeral actions from the user and their legacy co-members), and two "recently viewed" card sections for legacies and stories.

**Depends on:** Activity tracking system (`docs/plans/2026-03-02-activity-tracking-plan.md`)

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data enrichment | Backend-side joins | Single API call per section; no N+1 fetches on frontend |
| Social feed scope | Legacy membership | Show activity from co-members of shared legacies via `legacy_members` table |
| Feed endpoint | New `GET /api/activity/feed` | Social query is fundamentally different from "my activity"; clean separation |
| Recently viewed | Enhanced `GET /api/activity/recent` | Add `action` filter param + entity enrichment |
| Item limits | Feed: 5, Viewed: 4 each | Compact but useful homepage presence |

---

## Backend

### New Endpoint: `GET /api/activity/feed`

Social activity feed showing non-ephemeral actions from the user and their legacy co-members.

**Query logic:**

1. Find all legacy IDs where the current user is a member (`legacy_members`)
2. Query `user_activity` where:
   - `entity_type = 'legacy'` AND `entity_id` in user's legacy IDs, OR
   - `entity_type = 'story'` AND `entity_id` is a story linked to user's legacies (via `story_legacies`), OR
   - `user_id = current_user` AND `entity_type` in (`media`, `conversation`) — own-only for non-legacy entities
3. Exclude `action = 'viewed'`
4. Order by `created_at DESC`, cursor-paginate

**Query params:** `cursor` (ISO timestamp), `limit` (1–20, default 5)

**Response — `SocialFeedResponse`:**

```json
{
  "items": [
    {
      "id": "uuid",
      "action": "created",
      "entity_type": "story",
      "entity_id": "uuid",
      "created_at": "2026-03-02T10:30:00Z",
      "metadata": { "title": "Summer Memories" },
      "actor": {
        "id": "uuid",
        "name": "Sarah",
        "avatar_url": "https://..."
      },
      "entity": {
        "name": "Grandpa's Legacy",
        "profile_image_url": "https://..."
      }
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

The `actor` field is populated by joining `users` on `user_activity.user_id`. The `entity` field is populated by joining the relevant entity table (legacies, stories) based on `entity_type`.

### Enhanced Endpoint: `GET /api/activity/recent`

Add `action` query parameter to filter by action type (e.g., `?action=viewed`). Enrich response with entity details.

**New query param:** `action` (optional string)

**Enhanced `RecentItem` in response:**

```json
{
  "entity_type": "legacy",
  "entity_id": "uuid",
  "last_action": "viewed",
  "last_activity_at": "2026-03-02T10:00:00Z",
  "metadata": { "name": "Grandpa Joe" },
  "entity": {
    "name": "Grandpa Joe",
    "profile_image_url": "https://...",
    "birth_date": "1940-01-01",
    "death_date": "2020-06-15",
    "biography": "A loving grandfather...",
    "visibility": "public"
  }
}
```

Entity shape varies by `entity_type`:
- **Legacy:** name, profile_image_url, birth_date, death_date, biography, visibility
- **Story:** title, content_preview, author_name, visibility, status, legacy associations
- **Media:** filename, content_type, url
- **Conversation:** title, persona_id

### New Schemas

**`SocialFeedItem`** — extends `ActivityItem` with actor and entity info:
- Inherits: id, action, entity_type, entity_id, created_at, metadata
- Adds: `actor` (ActorSummary), `entity` (dict — polymorphic)

**`ActorSummary`** — minimal user info:
- id: UUID, name: str, avatar_url: str | None

**`SocialFeedResponse`** — feed response:
- items: list[SocialFeedItem], has_more: bool, next_cursor: str | None

**`EnrichedRecentItem`** — extends `RecentItem` with entity:
- Inherits: entity_type, entity_id, last_action, last_activity_at, metadata
- Adds: `entity` (dict — polymorphic entity summary)

---

## Frontend

### Homepage section ordering (authenticated)

1. Hero
2. **Recently Viewed Legacies** (new)
3. My Legacies (existing)
4. **Recently Viewed Stories** (new)
5. **Recent Activity** (new)
6. Favorites (existing)
7. Explore Legacies (existing)

Sections 2, 4, 5 are hidden when empty or when tracking is disabled.

### Recently Viewed Legacies / Stories

- 4-column responsive grid (`grid md:grid-cols-2 lg:grid-cols-4`)
- Reuses existing legacy card pattern (from Homepage) and `StoryCard` component
- Data from `GET /api/activity/recent?action=viewed&entity_type=legacy&limit=4`
- Click navigates to the legacy/story detail page
- Hidden if no items or tracking disabled

### Recent Activity Feed

Compact list (not cards) with icon + text per row:

```
[icon]  <Actor> <action> "<title>"
        <EntityType> · <time_delta>
```

**Icons per entity type (Lucide):**
- Legacy: `Landmark`
- Story: `BookOpen`
- Media: `Image`
- Conversation: `MessageCircle`

**Actor display:** "You" for `actor.id === currentUser.id`, otherwise actor name.

**Action text:**
- created → "created"
- updated → "updated"
- deleted → "deleted"
- favorited → "favorited"
- unfavorited → "unfavorited"
- ai_conversation_started → "started a conversation about"
- ai_story_evolved → "evolved"

**Time format:** Relative ("2 hours ago", "Yesterday", "3 days ago")

### Component structure

```
features/activity/
  api/activity.ts              — API client (getSocialFeed, getRecentViewed)
  hooks/useActivity.ts         — TanStack Query hooks
  components/
    RecentActivitySection.tsx  — Social feed list for homepage
    RecentlyViewedSection.tsx  — Card grid for recently viewed (reusable for legacy & story)
    ActivityFeedItem.tsx       — Single feed row (icon + actor + action + timestamp)
```

### API client functions

```typescript
getSocialFeed(limit?: number, cursor?: string): Promise<SocialFeedResponse>
getRecentViewed(entityType: string, limit?: number): Promise<EnrichedRecentItemsResponse>
```

### TanStack Query hooks

```typescript
activityKeys = {
  all: ['activity'],
  socialFeed: () => [...activityKeys.all, 'social-feed'],
  recentViewed: (entityType: string) => [...activityKeys.all, 'recent-viewed', entityType],
}

useSocialFeed(limit = 5)
useRecentlyViewed(entityType: 'legacy' | 'story', limit = 4)
```

---

## Testing

### Backend
- Social feed returns co-member activity
- Social feed excludes "viewed" actions
- Social feed shows own non-legacy entity activity (media, conversation)
- Social feed excludes activity from non-member legacies
- Enhanced recent items filters by action
- Enhanced recent items includes entity details
- Entity enrichment handles deleted entities gracefully (null entity)

### Frontend
- Each section renders when data is available
- Sections hide when empty
- Sections hide when tracking is disabled
- Feed items show correct icon per entity type
- Feed items show "You" for own actions, name for others
- Relative time formatting is correct
- Card clicks navigate to correct routes
