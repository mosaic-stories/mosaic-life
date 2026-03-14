# Dashboard Redesign Design

**Date:** 2026-03-09
**Status:** Approved
**Reference:** `example-dashboard-redesign.jsx` (root of repo)

## Overview

Redesign the authenticated dashboard from a full-width single-column stack into a warm editorial two-column layout with a right sidebar. The goal is to solve the sparse layout, excessive whitespace, and disconnected sections by combining related content and letting it breathe without drowning in empty space.

## Key Decisions

1. **Sidebar stacks below on mobile** (single column below `lg` breakpoint)
2. **Compact list view for recent stories** is a new variant; existing grid view preserved for other pages
3. **Continue Writing CTA** is a visual upgrade only — no new backend logic
4. **Quick Actions** use smart default (Option B): single legacy goes direct, multiple shows inline picker
5. **Invite dialog** reuses existing `InviteMemberModal` component as-is
6. **Theme colors** stay the same — use existing theme CSS variables, not the hardcoded colors from the example JSX

## Layout Structure

```
[Hero Area — full width, gradient background]
  ├─ Greeting (left) — serif italic name, subtitle
  └─ Continue Writing CTA card (right-aligned)

[Main Container — max-w-7xl, grid: 1fr 340px, gap-8]
  ├─ LEFT COLUMN
  │   ├─ StoryPromptCard (with legacy avatar)
  │   ├─ My Legacies (2-col grid, max 2 cards + create card)
  │   └─ Recent Stories (compact vertical list)
  └─ RIGHT SIDEBAR (340px, sticky)
      ├─ Quick Actions widget
      ├─ Recent Activity (compact feed)
      └─ My Favorites (compact, tabbed)

[Footer]
```

**Responsive:** Below `lg` breakpoint, grid collapses to single column. Sidebar content stacks below main content.

## Component Changes

### 1. DashboardPage.tsx (Modify)

- Replace single-column stack with two-zone layout (hero + grid)
- Remove `RecentlyViewedSection` for legacies (redundant with "My Legacies")
- Remove `RecentlyViewedSection` for stories (replaced by compact list)
- Remove per-section `py-20` heavy spacing — tighter spacing within grid
- Add CSS grid container: `grid lg:grid-cols-[1fr_340px] gap-8`

### 2. ContextualGreeting.tsx (Modify — Hero Area)

- Add gradient background using theme CSS variables
- Flex layout: greeting left, CTA card right
- Upgrade CTA from text link to card-style element (icon + story title + arrow)
- Keep existing data logic (recent story → notifications → generic prompt)
- Responsive: card stacks below greeting on mobile

### 3. StoryPromptCard.tsx (Modify)

- Add small circular legacy avatar (32px) next to "Story Prompt" label
- Needs `legacy_profile_image_url` from the prompt API response (see backend changes)
- Add subtle gradient background matching editorial feel
- Remove outer `py-12` section wrapper — spacing handled by parent grid gap

### 4. LegacyCard.tsx (Modify)

- **Member count overlay:** Move from text area to image overlay (bottom-right, semi-transparent)
- **"In Memoriam" badge overlay:** Move context badge to image overlay (bottom-left) for memorial legacies
- **Action buttons row:** Add two buttons at card bottom:
  - "N Stories" → navigates to `/legacy/{id}?tab=stories`
  - "Talk to AI" → navigates to `/legacy/{id}?tab=ai`
- Simplify/remove context badge from text area
- Dashboard grid changes to 2-column for legacy cards

### 5. RecentStoriesList.tsx (New Component)

- Compact vertical list of recently viewed stories
- Each item: left accent bar (4px) + title + legacy name + truncated excerpt + author/date + optional heart icon
- First item gets a colored accent bar, rest get neutral
- Uses existing `useRecentlyViewed('story')` hook
- No backend changes needed

### 6. QuickActions.tsx (New Component)

- Sidebar card with "Quick Actions" header
- Three stacked buttons with icons:
  - **"Create a Legacy"** → navigates to `/legacy/new`
  - **"Write a Story"** → Option B: 1 legacy goes direct (POST to conversations API), multiple shows legacy picker dropdown
  - **"Invite Family"** → Option B: 1 legacy opens `InviteMemberModal` directly, multiple shows legacy picker first
- Legacy picker: lightweight inline dropdown using `useLegacies` data (already fetched)
- `InviteMemberModal` rendered on dashboard, triggered by quick action

### 7. SidebarActivity.tsx (New Component)

- Compact sidebar variant of activity feed
- "Recent Activity" header only (no description subtitle)
- 4 items max, tight spacing
- Small icon badges (28px) + text + timestamp
- Uses existing `useSocialFeed` hook

### 8. SidebarFavorites.tsx (New Component)

- Compact sidebar variant of favorites
- "My Favorites" header + "See all" link
- Tabbed filter row (All / Stories / Legacies / Media) — smaller rendering
- 2-3 items as simple list rows (heart icon + title + type label)
- Uses existing `useMyFavorites` hook

## Backend Changes

### 1. Add `legacy_profile_image_url` to Story Prompt Response

- **Scope:** Small — add field to the prompt serializer/response model
- **Location:** Story prompt endpoint that returns the current prompt
- **Data source:** Join or lookup from the legacy's `profile_image_url` field
- **Used by:** `StoryPromptCard` to render legacy avatar

### 2. Add `story_count` to Legacy Response

- **Scope:** Small — add count query to the legacy serializer/response model
- **Data source:** `COUNT(*)` of stories for each legacy
- **Used by:** `LegacyCard` to show "N Stories" button label

## What's NOT Changing

- Existing hooks (`useLegacies`, `useSocialFeed`, `useMyFavorites`, `useRecentlyViewed`, `useCurrentPrompt`)
- `InviteMemberModal` — already reusable, no refactoring needed
- Theme system — using existing theme CSS variables throughout
- Navigation/header (`AppHeader`, `NavLinks`)
- Mobile bottom tab bar (`BottomTabBar`)
- Footer
- Full-width variants of activity/favorites sections (preserved for potential use elsewhere)

## Files Affected

### Modified
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/components/dashboard/ContextualGreeting.tsx`
- `apps/web/src/features/story-prompts/components/StoryPromptCard.tsx`
- `apps/web/src/components/legacy/LegacyCard.tsx`
- `services/core-api/` — prompt serializer (add `legacy_profile_image_url`)
- `services/core-api/` — legacy serializer (add `story_count`)

### New
- `apps/web/src/components/dashboard/RecentStoriesList.tsx`
- `apps/web/src/components/dashboard/QuickActions.tsx`
- `apps/web/src/components/dashboard/SidebarActivity.tsx`
- `apps/web/src/components/dashboard/SidebarFavorites.tsx`
