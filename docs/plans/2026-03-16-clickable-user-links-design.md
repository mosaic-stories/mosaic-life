# Clickable User Links Design

**Date:** 2026-03-16
**Status:** Approved

## Goal

Make user names clickable throughout the platform. Clicking any user's name navigates to their public profile at `/u/{username}`. This applies everywhere a user is referenced: legacy member lists, story authors, activity feeds, media uploaders, connection requests, notifications, and the connections hub.

## Approach

Create a shared `<UserLink>` component (Approach 1) — a single reusable component that renders a clickable user name (and optionally avatar) linking to `/u/{username}`. Every place that displays a user name adopts this component.

**Why this approach over alternatives:**
- Single source of truth for link behavior and styling
- Consistent look & feel across the platform
- Easy to enhance later (hover cards, tooltips)
- Simple to test — one component, many consumers

## Design

### 1. `UserLink` Component

**Location:** `apps/web/src/components/UserLink.tsx`

**Props:**
```typescript
interface UserLinkProps {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  showAvatar?: boolean;    // default: false
  className?: string;
}
```

**Behavior:**
- Renders a React Router `<Link to={/u/${username}}>` wrapping the display name
- When `showAvatar` is true, renders the existing Radix `<Avatar>` + name side-by-side
- Styled as inline/inline-flex so it flows naturally in text or list contexts
- Hover state: subtle underline or color shift to signal clickability
- Pure presentational — no data fetching, all data passed via props
- No hover card or popover (future enhancement)
- No special "you" indicator (parent component responsibility)

### 2. Backend API Changes

Add `username` to all API responses that reference a user:

| Response Schema | Current Fields | Added Fields |
|---|---|---|
| `StoryAuthorInfo` | id, name, email, avatar_url | `username` |
| `LegacyMember` (response) | user_id, email, name, avatar_url, role | `username` |
| `ActorSummary` (activity) | id, name, avatar_url | `username` |
| `MediaItem` | uploaded_by, uploader_name | `uploader_username`, `uploader_avatar_url` |
| `ConnectionRequestResponse` | from_user_name, from_user_avatar_url, to_user_name, to_user_avatar_url | `from_user_username`, `to_user_username` |
| Notification actor fields | actor name, avatar | `username` |

**Implementation:** Each response already JOINs to the `users` table — just select the `username` column and add it to the response schema.

### 3. Frontend Integration Points

Components that will adopt `<UserLink>`:

| Component | Current Display | Change |
|---|---|---|
| **LegacySidebar** (MemberRow) | Initials avatar + name text | `<UserLink showAvatar>` |
| **StoryCard** (footer) | Small avatar + author name | `<UserLink showAvatar>` |
| **ActivityFeedItem** | Bold actor name in sentence | Inline `<UserLink>` |
| **PersonCard** | Avatar + display_name | `<UserLink showAvatar>` |
| **TopConnectionsChips** | Avatar + first name | `<UserLink showAvatar>` |
| **ConnectionRequestsTab** | Avatar + user name | `<UserLink showAvatar>` |
| **NotificationItem** | Avatar + actor name | Inline `<UserLink>` |
| **MemberDrawer** | Avatar + name/email + role | `<UserLink showAvatar>` for name |
| **SidebarActivity** | Uses ActivityFeedItem | Inherits changes |

**Already working (no changes):**
- MyConnectionsTab — already navigates to `/u/{username}`
- ProfilePage connections — already navigates to `/u/{username}`
- SearchBar — already navigates to `/u/{username}`

### 4. Frontend Type Updates

```typescript
// stories.ts — StorySummary / StoryDetail
+ author_username: string;

// legacies.ts — LegacyMember
+ username: string;

// activity.ts — ActorSummary
+ username: string;

// media.ts — MediaItem
+ uploader_username: string;
+ uploader_avatar_url: string | null;

// userConnections.ts — ConnectionRequestResponse
+ from_user_username: string;
+ to_user_username: string;

// notifications — actor fields
+ username: string;
```

No new API hooks or queries needed — existing response types expand to include `username`.

## Out of Scope

- Hover cards / user preview popovers (future enhancement)
- Profile link in the header user menu (already has settings link)
- Refactoring existing working links (MyConnectionsTab, ProfilePage, SearchBar) to use `<UserLink>` — can be done as a follow-up cleanup
