# Split Homepage & Authenticated Navigation Design

**Date:** 2026-03-02
**Status:** Approved

## Problem

The current homepage serves both logged-out visitors and logged-in users with conditional rendering in a single 385-line component. As the authenticated experience grows (activity tracking, favorites, conversations), the two audiences need fundamentally different pages. Additionally, authenticated users lack persistent navigation — all discovery happens through the homepage or the user menu dropdown.

## Decision

Split the homepage at the route level into two distinct page components and add an authenticated navigation bar with new top-level pages.

## Architecture

### Route Change

The `/` route renders an `AuthAwareHome` wrapper that checks auth state:

```
/ → AuthAwareHome
    ├── user is null → <PublicHomePage />
    └── user exists → <DashboardPage />
```

No new URL paths for the home route — `/` stays as `/`.

### New Routes

| Route | Page | Protected | Content |
|-------|------|-----------|---------|
| `/legacies` | LegaciesPage | Yes | My Legacies (full list) + Explore All Legacies |
| `/stories` | StoriesPage | Yes | Placeholder |
| `/conversations` | ConversationsPage | Yes | Placeholder |
| `/community` | CommunityPage | No | Already exists |

### File Structure

```
src/
  pages/
    PublicHomePage.tsx       # Extracted from Homepage.tsx (public sections)
    DashboardPage.tsx        # New authenticated dashboard
    LegaciesPage.tsx         # New — My Legacies + Explore
    StoriesPage.tsx          # New — placeholder
    ConversationsPage.tsx    # New — placeholder
  components/
    header/
      AppHeader.tsx          # Modified — auth-aware with inline nav
      NavLinks.tsx           # New — navigation link list
    navigation/
      BottomTabBar.tsx       # New — mobile bottom navigation
    dashboard/
      ContextualGreeting.tsx # New — time-aware greeting + actionable prompt
```

## Public Homepage (PublicHomePage)

Extracted from the current `Homepage.tsx`, containing only the public-facing sections:

1. Hero section (as-is)
2. Explore Public Legacies (no auth-specific filters)
3. "Start Creating Today" CTA
4. Footer

Future: public stories section can be added here.

## Authenticated Dashboard (DashboardPage)

Sections in order:

| # | Section | Component | Notes |
|---|---------|-----------|-------|
| 1 | Contextual Greeting | `ContextualGreeting` (new) | Replaces hero |
| 2 | Recently Viewed Legacies | `RecentlyViewedSection` (existing) | As-is |
| 3 | My Legacies | Extracted from Homepage | Up to 2 cards + create card |
| 4 | Recently Viewed Stories | `RecentlyViewedSection` (existing) | As-is |
| 5 | Recent Activity | `RecentActivitySection` (existing) | As-is |
| 6 | Favorites | `FavoritesSection` (existing) | As-is |
| 7 | Footer | `Footer` (existing) | Same as public |

**Removed from dashboard** (vs current homepage):
- Hero section → replaced by greeting
- "Start Creating Today" CTA → not needed for logged-in users
- Explore Legacies → moved to `/legacies` page

## Contextual Greeting

### Time-Aware Greeting

```
5am - 12pm  → "Good morning, {firstName}"
12pm - 5pm  → "Good afternoon, {firstName}"
5pm - 9pm   → "Good evening, {firstName}"
9pm - 5am   → "Good night, {firstName}"
```

### Contextual Prompt (Priority Order)

1. **Resume editing**: If user has a recently edited story (from activity tracking) → "Continue editing '{storyTitle}'" with navigation arrow
2. **Unread notifications**: "You have {count} new notifications" with link
3. **Fallback**: "What would you like to work on today?"

Data sources: existing activity tracking API (`/api/activity/recent`) and notifications API. No new backend endpoints needed.

### Visual Style

Minimal — heading (text-2xl/3xl) + subtitle line. No background gradient, no illustration. Compact vertical footprint.

## Header & Navigation

### Authenticated Header (Desktop)

```
┌──────────────────────────────────────────────────────────┐
│ [Logo]   Home  Legacies  Stories  Conversations  Community   [Avatar] │
└──────────────────────────────────────────────────────────┘
```

- Navigation links rendered inline between logo and user menu
- Active route indicated by underline + accent color
- Uses React Router `NavLink` for active state
- Existing header slot system preserved — pages can still inject controls

### Unauthenticated Header

Unchanged: Logo + header slot + "Sign In" button.

### Mobile Bottom Tab Bar (< md breakpoint, authenticated only)

```
┌─────────────────────────┐
│ [Logo]           [Avatar]│  ← simplified header (no inline nav)
├─────────────────────────┤
│  [Page content]          │
├─────────────────────────┤
│ Home Leg. Stor. Conv Comm│  ← bottom tabs (icons + labels)
└─────────────────────────┘
```

- Fixed position at bottom of viewport
- 5 items with Lucide icons + short labels
- Active tab gets accent color
- Hidden on desktop (md+ breakpoint)
- Hidden for unauthenticated users
- Page content gets bottom padding to avoid overlap

### Navigation Items

| Label | Route | Icon (Lucide) | Protected |
|-------|-------|---------------|-----------|
| Home | `/` | `Home` | Shown only when authed |
| Legacies | `/legacies` | `Landmark` | Yes |
| Stories | `/stories` | `BookOpen` | Yes |
| Conversations | `/conversations` | `MessageCircle` | Yes |
| Community | `/community` | `Users` | No |

## Legacies Page

The new `/legacies` page absorbs Explore Legacies from the homepage:

| Section | Content |
|---------|---------|
| Page header | "Legacies" title |
| My Legacies | Full list of user's legacies + create button |
| Explore | All public/accessible legacies with visibility filter (All/Public/Private), grid layout |

Reuses existing legacy card components and query hooks.

## Placeholder Pages

**Stories** (`/stories`):
- Centered layout with `BookOpen` icon
- "Stories" heading
- "Browse and manage your stories across all legacies. Coming soon."
- Link back to Home

**Conversations** (`/conversations`):
- Centered layout with `MessageCircle` icon
- "Conversations" heading
- "Your AI conversations and story evolution sessions. Coming soon."
- Link back to Home

Both are protected routes.

## Backend Impact

None. All data is available through existing APIs:
- Activity tracking: `GET /api/activity/recent`
- Notifications: existing notifications endpoint
- Legacies: existing legacies endpoints
- Favorites: existing favorites endpoint

## Dependencies

- Activity tracking system (designed in `2026-03-02-activity-tracking-design.md`) — for contextual greeting "resume editing" prompt and recently viewed sections
- Existing favorites, legacies, and notifications APIs
