# Unified Header Design

**Date:** 2025-12-14
**Status:** Approved
**Author:** Brainstorming session

## Overview

This design addresses inconsistent header implementations across the Mosaic Life application. Currently, each page implements its own header, leading to missing navigation elements (logo, user menu) on some pages. This design introduces a unified header component with a slot-based system for page-contextual controls.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Page-contextual controls | Slot-based composition | Pages have full control without header needing to know about every page |
| Notifications | Integrated into user menu with avatar badge | Cleaner, more minimal header |
| Mobile experience | Compact icons with overflow menu | Same structure as desktop, just compressed |
| Theme selector | In header, homepage only (via slot) | Uses slot system, keeps other pages uncluttered |
| Minimal view handling | Same header for both full and minimal views | Consistent navigation regardless of content density |

## Component Structure

The unified header consists of three zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]          [  Slot Area (contextual)  ]    [User/Login]   │
│   Left                    Center                     Right      │
└─────────────────────────────────────────────────────────────────┘
```

### Left Zone (fixed)

- Mosaic Life logo + wordmark
- Always links to homepage
- On mobile: logo only (no wordmark)

### Center Zone (slot-based)

- Empty by default
- Pages inject their own controls using a `<HeaderSlot>` component
- Examples: search bar on explore, filters on my-legacies, breadcrumbs on legacy pages

### Right Zone (fixed)

- **Logged out:** "Sign In" button
- **Logged in:** User avatar with notification badge indicator (red dot when unread)
- Clicking avatar opens dropdown with: notifications section at top, then profile links, then sign out

## Slot System Implementation

Pages inject content into the header using React Context and a portal pattern.

### How it works

1. `RootLayout` renders `<HeaderProvider>` which wraps the app and provides context
2. `<AppHeader>` renders a target `<div id="header-slot">` in the center zone
3. Pages render `<HeaderSlot>` anywhere in their component tree - content gets portaled to the header

### Example usage

```tsx
// ExplorePage.tsx
function ExplorePage() {
  return (
    <div>
      <HeaderSlot>
        <SearchBar compact />
        <FilterButton />
      </HeaderSlot>

      {/* ... rest of page content ... */}
    </div>
  );
}
```

```tsx
// Homepage.tsx
function Homepage() {
  return (
    <div>
      <HeaderSlot>
        <ThemeSelector />
      </HeaderSlot>

      {/* ... rest of page content ... */}
    </div>
  );
}
```

### Key behaviors

- Slot content is cleared automatically on route change
- Multiple `<HeaderSlot>` components in one page merge their content
- On mobile, slot content moves into the overflow menu automatically
- Pages without `<HeaderSlot>` simply have an empty center zone

## User Menu with Integrated Notifications

The user avatar dropdown combines profile actions and notifications.

### Visual indicator

- Small red dot on the avatar when there are unread notifications
- Dot appears at top-right corner of the avatar circle

### Dropdown structure (logged in)

```
┌────────────────────────────────┐
│  Notifications (3 unread)  [Mark all read]  │
├────────────────────────────────┤
│  🔔 John commented on...       │
│  🔔 New story added to...      │
│  🔔 You were invited to...     │
│  → View all notifications      │
├────────────────────────────────┤
│  👤 My Profile                 │
│  📚 My Legacies                │
│  ⚙️  Settings                  │
│  ❓ Help & Support             │
├────────────────────────────────┤
│  🚪 Sign Out                   │
└────────────────────────────────┘
```

### Key behaviors

- Notifications section shows up to 3 most recent unread
- Clicking a notification marks it read and navigates to the relevant page
- "View all notifications" links to `/notifications` page
- If no unread notifications, section shows "No new notifications" with link to history
- Dropdown uses existing shadcn/ui components (DropdownMenu, Avatar)

### Logged out state

- Simple "Sign In" button (no dropdown)
- Opens auth modal on click

## Mobile Behavior

On screens below 768px (md breakpoint), the header adapts.

### Layout

```
┌─────────────────────────────────────────┐
│  [Logo]      [⋯]           [Avatar]     │
└─────────────────────────────────────────┘
```

### Overflow menu (⋯)

- Only appears if the page has slot content
- Tapping opens a dropdown containing the slot items stacked vertically
- Search inputs expand to full width within the dropdown
- If page has no slot content, the overflow icon is hidden entirely

### Example - Explore page on mobile

```
Tap ⋯ reveals:
┌────────────────────────────────┐
│  🔍 [Search legacies...]       │
│  ⚙️  Filters                   │
└────────────────────────────────┘
```

### Example - Homepage on mobile

```
Tap ⋯ reveals:
┌────────────────────────────────┐
│  🎨 Theme: Warm Amber    ▼     │
└────────────────────────────────┘
```

### Responsive transitions

- Logo wordmark hidden on mobile (icon only)
- Slot content hidden from center zone, moved to overflow
- User avatar size stays consistent
- Header height remains fixed (~56px)

## File Structure

### New components to create

```
apps/web/src/components/header/
├── AppHeader.tsx           # Main unified header component
├── HeaderProvider.tsx      # Context provider for slot system
├── HeaderSlot.tsx          # Portal component pages use to inject content
├── HeaderOverflowMenu.tsx  # Mobile overflow menu (⋯)
├── HeaderLogo.tsx          # Logo with responsive wordmark
├── HeaderUserMenu.tsx      # Avatar dropdown with notifications
└── index.ts                # Barrel exports
```

### Components to modify

- `RootLayout.tsx` - Wrap with `<HeaderProvider>`, render `<AppHeader>`
- `UserProfileDropdown.tsx` - Merge into new `HeaderUserMenu.tsx` with notifications
- Individual page components - Remove inline headers, add `<HeaderSlot>` where needed

### Components to deprecate

- Inline `<nav>` sections in Homepage, About, MyLegacies, etc.
- Current `NotificationBell.tsx` - functionality absorbed into `HeaderUserMenu`

### Hooks to create

```
apps/web/src/components/header/
└── useHeaderSlot.ts        # Hook for programmatic slot control (optional)
```

### No changes needed

- `ThemeSelector.tsx` - Reused as-is within `<HeaderSlot>`
- `SearchBar.tsx` - Reused as-is within `<HeaderSlot>`
- Auth context and hooks - No changes

## Migration Strategy

### Phase 1: Build the foundation

- Create `HeaderProvider`, `AppHeader`, `HeaderSlot`, and related components
- Integrate into `RootLayout.tsx` so all pages get the header automatically
- Pages will temporarily show both old inline headers and new unified header

### Phase 2: Migrate pages one by one

- Remove inline `<nav>` from each page
- Add `<HeaderSlot>` with appropriate contextual controls
- Test both full and minimal variants

### Migration order

| Priority | Page | Slot Content |
|----------|------|--------------|
| 1 | Homepage | ThemeSelector |
| 2 | MyLegacies | SearchBar, CreateButton |
| 3 | Explore | SearchBar, Filters |
| 4 | LegacyProfile | Breadcrumb, ShareButton |
| 5 | About, HowItWorks, Community | None (empty slot) |
| 6 | Story pages | Breadcrumb, EditButton |
| 7 | AI Chat pages | Breadcrumb |

### Minimal view pages

- Same migration - they inherit the unified header automatically
- No separate work needed since header is consistent across both views

### Cleanup

- Delete `NotificationBell.tsx` after `HeaderUserMenu` is complete
- Remove old `UserProfileDropdown.tsx` after migration

## Technical Notes

### Existing patterns to leverage

- `useIsMobile()` hook at `apps/web/src/components/ui/use-mobile.ts` for responsive behavior
- `SharedPageProps` from `RootLayout` for auth state and navigation
- shadcn/ui components: `DropdownMenu`, `Avatar`, `Button`, `Popover`
- Existing notification hooks: `useNotifications`, `useUnreadCount`

### Z-index hierarchy

- `z-50` - Sticky header (existing convention)
- `z-[100]` - DogearToggle (floats above header)

### CSS conventions

- `sticky top-0` for header positioning
- `bg-white/90 backdrop-blur-sm` for semi-transparent effect
- `border-b shadow-sm` for subtle elevation
- `max-w-7xl mx-auto` for content width constraint
