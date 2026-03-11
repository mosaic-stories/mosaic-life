# Legacies Landing Page Redesign

**Date:** 2026-03-11
**Status:** Approved
**Approach:** Evolve in-place (modify existing components)
**Fonts:** Keep Inter + Merriweather (no new font dependencies)

## Overview

Redesign the `/legacies` page to match the `mosaic-legacy-landing-v2.jsx` mockup. Pure frontend restyling plus two new list-view components. No backend, hook, or API changes.

## Design Decisions

### Page Header

- Warm gradient background (`bg-gradient-to-b from-stone-100 to-stone-50`) with `border-b`
- Breadcrumb: `Home > Legacies` with `ChevronRight` separator
- Title: `font-serif text-3xl` "Your Legacies"
- Subtitle: "The stories and memories that keep them close."
- Stats row: emoji icons + serif number + label, horizontal layout (reuse `useStats`)
- Custom tab buttons (not shadcn Tabs) with bottom-border accent, inline count badges
- Tabs: Legacies | Stories | Activity

### Toolbar (per tab)

Shared toolbar row in each tab content component:

- **Left:** Filter pills (reuse `QuickFilters`)
  - Legacies: All | My Legacies | Connected | Favorites (unchanged)
  - Stories: All | My Stories | Favorites | Public | Private (changed from Mine | Shared | Favorites)
- **Right:** Sort dropdown, search input, grid/list toggle
- Sort is client-side on already-fetched data
- Search is client-side text match
- New component state: `viewMode`, `searchQuery`, `sortBy`
- Add `view` and `sort` to URL params for persistence

### Legacy Card — Grid View (redesign)

- Cover photo zone (h-36): reuse `profile_image_url` with blur/darken, or warm gradient placeholder
- Profile photo: 64px circle overlapping cover/content boundary
- "In Memoriam" badge: top-left of cover, white/translucent pill
- Relationship badge: top-right — render only if field exists, skip otherwise (no backend changes)
- Name: `font-serif text-lg`
- Dates: `text-sm text-neutral-400`
- Tagline: `legacy.biography` in italic, single-line truncated
- Stats row: story_count, members.length, favorite_count with icons, top border divider
- Hover buttons: "View Stories" (filled) + "AI Chat" (outline), fade in on hover
- Hover lift: `-translate-y-1` + `shadow-xl`
- Card radius: `rounded-2xl`

### Legacy Card — List View (NEW component: `LegacyCardList.tsx`)

- Horizontal row: avatar (56px) | name + dates + tagline | stats | last activity | chevron
- "In Memoriam" mini badge at bottom-right of avatar
- Hover: `bg-stone-50` background
- Rows stack inside a single `rounded-2xl bg-white border` container

### Story Card — Grid View (redesign)

- Legacy pill: top of card, first associated legacy name (no avatar — no URL on StorySummary)
- Title: `font-serif` + favorite heart button right-aligned
- Preview: `line-clamp-3`
- Tags: skipped (StorySummary has no tags field)
- Footer: separated by `border-t bg-stone-50` — author initials + name left, visibility + date right
- Draft/Shared badges: preserved from current card
- Hover: lift + shadow

### Story Card — List View (NEW component: `StoryCardList.tsx`)

- Accent bar: 3px vertical, red if favorited, neutral otherwise
- Legacy placeholder circle + title + meta line + single-line snippet
- Right side: visibility icon, heart toggle, chevron
- Hover: `bg-stone-50`
- Rows stack in `rounded-2xl bg-white border` container

### Recently Viewed / Edited Chips

- Refactor `RecentlyViewedChips` into generic `RecentChipRow` component
- Props: `title`, `icon`, `items`
- Chips: rectangular, white bg, `rounded-xl border`, avatar + name + time ago
- Section label: uppercase, `text-xs font-semibold tracking-wider`, icon prefix
- Move from `LegaciesPage` into each tab content component
- Legacies tab: "Recently Viewed" legacies
- Stories tab: "Recently Viewed" stories + "Recently Edited" stories (if API supports `action=edited`)

### Removals

1. "Create New Legacy" placeholder card from `LegaciesTabContent`
2. `RecentlyViewedChips` import from `LegaciesPage` (moved into tab content)

### Activity Tab

- Stays as placeholder "coming soon"
- Minor restyle to match stone palette and serif heading

## Color Mapping

| Mockup Token | Tailwind Class |
|---|---|
| #2C2416 (primary dark) | `text-neutral-900` / `text-stone-900` |
| #5C4B3A (primary brown) | `bg-theme-primary` (existing) |
| #8B7D6B (muted text) | `text-neutral-500` / `text-stone-500` |
| #A89B8C (light muted) | `text-neutral-400` / `text-stone-400` |
| #F0EDE8 (borders) | `border-stone-200` |
| #FAF8F5 (background) | `bg-stone-50` |
| #F5F1EB (accent bg) | `bg-stone-100` |

## Files Changed

| File | Action |
|---|---|
| `LegaciesPage.tsx` | Restructure header, custom tabs, remove RecentlyViewedChips |
| `StatsBar.tsx` | Restyle: emoji icons, serif numbers, horizontal layout |
| `RecentlyViewedChips.tsx` | Refactor into `RecentChipRow`, generic props |
| `LegaciesTabContent.tsx` | Add toolbar, remove create card, integrate RecentChipRow |
| `StoriesTabContent.tsx` | Add toolbar, new filters, integrate RecentChipRow, grid/list |
| `LegacyCard.tsx` | Redesign: cover photo, overlapping avatar, stats, hover |
| **NEW** `LegacyCardList.tsx` | Horizontal row variant |
| `StoryCard.tsx` | Redesign: legacy pill, footer, hover effects |
| **NEW** `StoryCardList.tsx` | Horizontal row variant |
| `ActivityTabContent.tsx` | Minor restyle |

## Not Changing

- Hooks (`useLegacies`, `useScopedStories`, `useFavorites`, `useStats`, `useRecentlyViewed`)
- API endpoints or backend
- Data types (`Legacy`, `StorySummary`)
- Routing logic
- Footer component
