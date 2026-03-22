# Vertical Sidebar Navigation Design

**Date:** 2026-03-22
**Status:** Approved

## Summary

Restructure the app navigation from 5 horizontal top tabs to a two-level system: a segmented control pill toggle in the header for 3 top-level sections (My Mosaic, Explore, Community), with a collapsible left sidebar for sub-navigation within My Mosaic and Explore.

## URL Structure

```
/                           → Redirect to /my/overview (authenticated) or landing (guest)
/my                         → Redirect to /my/overview
/my/overview                → Dashboard (current Home minus Find People widget)
/my/legacies                → Current Legacies page
/my/stories                 → Current Stories page
/my/media                   → New — cross-legacy media gallery
/my/conversations           → Current Connections page content
/my/personal                → New — user stats, future journaling

/explore                    → Redirect to /explore/legacies
/explore/legacies           → Public legacy discovery + search
/explore/stories            → Public story discovery + search
/explore/media              → Public media discovery + search
/explore/people             → People discovery + search

/community                  → Current Community page (no sidebar, full-width)

/legacy/:legacyId/...       → Unchanged
/settings/...               → Unchanged
/u/:username                → Unchanged
```

**Redirects for old URLs:**
- `/legacies` → `/my/legacies`
- `/stories` → `/my/stories`
- `/connections` → `/my/conversations`

## Desktop Layout

### Header Bar
- Left: Logo
- Center: Segmented control pill toggle — **My Mosaic** | **Explore** | **Community**
- Right: User menu (notifications, avatar dropdown) — unchanged

### Sidebar (My Mosaic & Explore sections only)
- Collapsible: expanded ~200px, collapsed ~60px (icon-only)
- Collapse/expand toggle button at bottom of sidebar
- State persisted in localStorage
- Subtle background distinction (e.g., `bg-muted`) with soft right border
- Active tab: filled background pill with theme primary color
- Icons from Lucide icon set
- Smooth width transition (~200ms ease)

### My Mosaic Sidebar Items

| Icon | Label | Route |
|------|-------|-------|
| LayoutDashboard | Overview | /my/overview |
| BookOpen | Legacies | /my/legacies |
| FileText | Stories | /my/stories |
| Image | Media | /my/media |
| MessageCircle | Conversations | /my/conversations |
| User | Personal | /my/personal |

### Explore Sidebar Items

| Icon | Label | Route |
|------|-------|-------|
| BookOpen | Legacies | /explore/legacies |
| FileText | Stories | /explore/stories |
| Image | Media | /explore/media |
| Users | People | /explore/people |

### Community
No sidebar — full-width content, same as current.

## Mobile Layout

### Bottom Tab Bar (3 tabs)

| Icon | Label | Action |
|------|-------|--------|
| Sparkles | My Mosaic | Opens slide-up bottom sheet with sub-tabs |
| Compass | Explore | Opens slide-up bottom sheet with sub-tabs |
| Users | Community | Navigates directly |

### Bottom Sheet Behavior
- Half-screen height, shows sub-tab items with icon + label
- Active sub-tab highlighted
- Tapping a sub-tab navigates and dismisses the sheet
- Re-tapping the same section in bottom bar re-opens the sheet
- Swipe down or tap outside to dismiss

### Mobile Header
- No segmented control (bottom bar handles section switching)
- Logo left, user menu right — same as today

### No sidebar on mobile — the bottom sheet replaces it entirely.

## New Pages

### Media Page (`/my/media`)
- Stats bar: total media count, photos, videos, audio
- Filter by legacy (horizontal chip row)
- Filter by media type (All / Photos / Videos / Audio)
- Grid layout with thumbnail cards, legacy name badge overlay
- Click navigates to the parent story or opens lightbox
- No upload action — media is uploaded through stories

### Personal Page (`/my/personal`)
- User avatar and display name header
- Stats cards: legacies created, stories written, media uploaded, connections, days since joined
- Activity timeline of recent user actions
- Placeholder for future journaling (omit or "Coming Soon" card)

### Explore Pages (`/explore/*`)
- Prominent search bar at top
- "From Your Network" section — content from connected users
- "Discover" section — public content, sorted by recent/trending
- Card grid layout consistent with existing components
- People page: user profile cards with connect button

## Component Architecture

### New Components

```
components/navigation/
  SectionSwitcher.tsx        — Segmented control pill toggle
  SidebarLayout.tsx          — Wrapper: collapsible sidebar + content area
  SidebarNav.tsx             — Sidebar with icon+label items, collapse toggle
  MobileNavSheet.tsx         — Bottom sheet for mobile sub-tab selection

routes/
  MyMosaicLayout.tsx         — SidebarLayout with My Mosaic nav items + Outlet
  ExploreLayout.tsx          — SidebarLayout with Explore nav items + Outlet
```

### Modified Components
- `AppHeader.tsx` — Replace NavLinks with SectionSwitcher (desktop only)
- `BottomTabBar.tsx` — 3 tabs with sheet trigger behavior
- `RootLayout.tsx` — Minor adjustments for nested layout
- `navigation.ts` — Restructure NAV_ITEMS into section-based config

### Unchanged
- All existing page components (DashboardPage, LegaciesPage, StoriesPage, ConnectionsPage, Community)
- HeaderUserMenu, notifications, settings routes
- Detail routes (legacy, story views)

### Key Pattern
`SidebarLayout` is a shared component taking a nav items config array. `MyMosaicLayout` and `ExploreLayout` are thin wrappers that pass their specific items and render `<Outlet />`.
