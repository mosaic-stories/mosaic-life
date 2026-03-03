# PageActionBar — Inline Page Actions Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the implementation plan derived from this design.

**Date:** 2026-03-03
**Status:** Approved
**Related:** `docs/plans/2026-03-02-split-homepage-implementation.md` (caused the regression)

---

## Problem

The split-homepage implementation (Task 9) changed `AppHeader.tsx` so that authenticated desktop users always see `NavLinks` in the header center, replacing the `slotContent` from `HeaderSlot`. This broke page-specific context menus on:

- **Legacy Detail** — lost Share, Edit Legacy, Delete Legacy, Add Story
- **Story View** — lost Back navigation, History, Evolve/Continue Evolving, Delete
- **Story Evolution** — lost Back to Story, Discard
- **My Legacies** — lost Search bar and Create Legacy button

## Decision

Move page-specific actions out of the header and into an **inline action bar** rendered within each page's body, just below the header. The global `NavLinks` remain permanently visible in the header.

## Design

### PageActionBar Component

A reusable component placed at the top of detail page content areas.

**File:** `src/components/PageActionBar.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ ← Back to [context]              [Action] [Action] [⋮]│
└─────────────────────────────────────────────────────┘
```

**Props:**
```ts
interface PageActionBarProps {
  backLabel: string;       // e.g., "Margaret Smith" or "Home"
  backTo: string;          // route path, e.g., "/legacy/123"
  children: React.ReactNode; // action buttons rendered on the right
}
```

**Behavior:**
- Left side: back navigation link with arrow icon
- Right side: action buttons passed as `children`
- Container: `max-w-7xl mx-auto px-6` (matches page content width)
- Border: bottom border to visually separate from content
- Background: white, not sticky (scrolls with page)
- On mobile: back label truncates, buttons collapse into overflow menu when 3+ buttons

**Mobile overflow (3+ children):**
```
┌────────────────────────────────┐
│ ← Margaret Smi...        [⋮]  │
└────────────────────────────────┘
```

When fewer than 3 actions, all render inline on mobile too.

### Page-Specific Usage

#### Legacy Detail (`LegacyProfile.tsx`)

Remove `<HeaderSlot>` + `<LegacyHeaderControls>`. Replace with `<PageActionBar>` rendered at the top of the page, before `<ProfileHeader>`.

```tsx
<PageActionBar backLabel="Legacies" backTo="/legacies">
  <Button variant="ghost" size="sm" onClick={onShare}>
    <Share2 className="size-4" />
  </Button>
  <Button size="sm" onClick={handleAddStory}>
    <Plus className="size-4 mr-2" /> Add Story
  </Button>
  {user && (
    <DropdownMenu>
      {/* Edit Legacy, Delete Legacy */}
    </DropdownMenu>
  )}
</PageActionBar>
```

#### Story View (`StoryCreation.tsx`)

Remove `<StoryToolbar>` (which wraps `<HeaderSlot>`). Replace with `<PageActionBar>` rendered at the top of the story page content.

```tsx
<PageActionBar backLabel={legacyName} backTo={`/legacy/${legacyId}`}>
  {showHistory && (
    <VersionHistoryButton versionCount={versionCount} onClick={onOpenHistory} />
  )}
  {canEdit && (
    <Button size="sm" onClick={onEvolve}>
      <Sparkles className="size-4 mr-2" />
      {hasActiveEvolution ? 'Continue Evolving' : 'Evolve'}
    </Button>
  )}
  {canDelete && (
    <Button variant="ghost" size="sm" className="text-red-600" onClick={onDelete}>
      <Trash2 className="size-4 mr-2" /> Delete
    </Button>
  )}
</PageActionBar>
```

#### Story Evolution (`StoryEvolutionWorkspace.tsx`)

Remove `<HeaderSlot>` block. Replace with `<PageActionBar>`.

```tsx
<PageActionBar backLabel="Back to Story" backTo={`/legacy/${legacyId}/story/${storyId}`}>
  {hasActiveEvolution && (
    <Button variant="ghost" size="sm" className="text-red-600" onClick={handleDiscard}>
      Discard
    </Button>
  )}
</PageActionBar>
```

#### My Legacies (`MyLegacies.tsx`)

This page already has a section header layout. Move the search bar and Create button inline into the existing section header rather than using PageActionBar. Remove `<HeaderSlot>` usage.

### AppHeader Cleanup

Remove the `slotContent` fallback logic from the authenticated desktop branch in AppHeader. The center section becomes:

```tsx
{user && !isMobile ? (
  <div className="flex-1 flex items-center justify-center">
    <NavLinks />
  </div>
) : isMobile ? (
  slotContent && <HeaderOverflowMenu>{slotContent}</HeaderOverflowMenu>
) : (
  <div className="flex-1 flex items-center justify-center gap-4 max-w-2xl">
    {slotContent}
  </div>
)}
```

This is actually the current state — no AppHeader changes needed. The fix is entirely in the consuming pages.

### What Stays

- `HeaderSlot` mechanism — kept in codebase for unauthenticated pages (e.g., PublicHomePage's ThemeSelector)
- `HeaderOverflowMenu` — kept for mobile unauthenticated slot content
- `AppHeader` — no changes needed
- `BottomTabBar` — unchanged

## Testing

Each modified page gets updated tests verifying:
- Action buttons render in the page body (not in header)
- Back navigation link points to correct route
- Mobile overflow behavior works (if applicable)
- Existing functionality (dialogs, drawers) still triggered correctly
