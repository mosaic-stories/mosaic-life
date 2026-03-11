# Legacy Detail Page Redesign — Design Document

**Date:** 2026-03-11
**Status:** Approved
**Reference mockup:** `mosaic-legacy-detail-redesign.jsx` (root)

## Summary

Redesign the legacy detail page (`/legacy/:id`) from a single-column layout with a flat profile header into a two-column layout with a full-width hero banner, sticky tab bar with stats, and a persistent sidebar with About, Timeline, Members, and AI Story Prompt sections.

All visual changes use the existing dynamic theme system (`--theme-*` CSS variables) so the redesign adapts to whichever of the 16 themes the user has selected. A new "Warm Earth" theme is added to capture the mockup's brown palette.

## Scope

### In scope
- Full-width hero banner replacing `ProfileHeader`
- Sticky tab bar with icons + right-side stats replacing `SectionNav`
- Two-column grid layout in `LegacyProfile`
- New `LegacySidebar` component (About, Timeline stub, Members, Story Prompt)
- Story card visual enhancements + sort dropdown
- AI chat visual polish (card wrapper, persona pill restyle)
- New "Warm Earth" theme
- Responsive collapse to single column on mobile

### Out of scope
- New API endpoints (timeline events, story tags)
- Backend changes
- Media Gallery tab redesign
- Linked Legacies tab redesign

## Architecture

### Approach: In-place refactor + new sidebar components

Modify existing components directly. Create new components only for genuinely new UI (sidebar).

### Files to modify
| File | Change |
|---|---|
| `LegacyProfile.tsx` | Remove `PageActionBar`, add two-column grid, render `LegacySidebar` |
| `ProfileHeader.tsx` | Full rewrite → hero banner with gradient, cover image, breadcrumb, action buttons |
| `SectionNav.tsx` | Add icons to all tabs, story count badge, right-side stats, adjust sticky `top` |
| `StoriesSection.tsx` | Add sort dropdown header, update max-width |
| `StoryCard.tsx` | Add tag pills (conditional), richer footer with visibility icons |
| `AISection.tsx` | Wrap chat in card, restyle persona pills to use theme colors |
| `lib/themes.ts` | Add "Warm Earth" theme definition |
| `lib/themeUtils.ts` | Add "warm-earth" color map |

### New files
| File | Purpose |
|---|---|
| `LegacySidebar.tsx` | Sidebar container with About, Timeline, Members, Story Prompt |
| `SidebarSection.tsx` | Reusable collapsible section with chevron toggle |

### Files removed
None — `PageActionBar` is still used by other pages.

## Component Design

### 1. Hero Banner (ProfileHeader rewrite)

Replaces the current white profile section with a full-width dark hero.

```
┌─────────────────────────────────────────────────────┐
│ Home > Legacies > Karen Marie Hewitt    (breadcrumb) │
│                                                      │
│                                                      │
│ [Photo]  Karen Marie Hewitt  [Public]                │
│  110px   1957 – 2025                    [+Add Story] │
│  r-2xl   "An amazing human being!"      [Share] [⋮]  │
└─────────────────────────────────────────────────────┘
```

**Structure:**
- Outer div: `relative h-[280px] overflow-hidden` with gradient `bg-gradient-to-br from-theme-primary-dark via-theme-primary to-theme-primary/70`
- Cover image (if legacy has media): `absolute inset-0 object-cover opacity-15 blur-sm`
- Dark overlay: `absolute inset-0 bg-gradient-to-b from-theme-primary-dark/30 to-theme-primary-dark/85`
- Breadcrumb: top-left, white text with reduced opacity
- Bottom content: profile photo (110px, rounded-2xl, white border, shadow), name (font-serif, text-3xl, white), visibility badge (glassmorphism), dates, tagline
- Action buttons: bottom-right — "Add Story" (white bg), Share + More (glassmorphism `bg-white/15 backdrop-blur border-white/20`)

**Props change:** Add `onAddStory`, `isCreatingStory`, `onShare`, `onEdit`, `onDelete`, `isAuthenticated` — actions move from PageActionBar into the hero.

### 2. Sticky Tab Bar (SectionNav update)

```
┌──────────────────────────────────────────────────────┐
│ [📖 Stories (3)] [🖼 Media] [🔗 Links] [✨ AI Chat]  │  3 stories · 2 members · Created by Joe
└──────────────────────────────────────────────────────┘
```

**Changes:**
- Add icons to all tabs: `BookOpen` (Stories), `Image` (Media), `Link2` (Links — already has it), `Sparkles` (AI — already has it)
- Stories tab gets count badge: `bg-theme-primary text-white` when active, `bg-stone-200 text-stone-600` when inactive
- Right side: quick stats (story count, member count, creator name)
- Sticky `top-0` (since PageActionBar is removed from above)
- New props: `storyCount`, `memberCount`, `creatorName`, `onMembersClick`

### 3. Two-Column Layout (LegacyProfile update)

```jsx
<div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-9">
  <main>{/* tab content */}</main>
  <aside><LegacySidebar /></aside>
</div>
```

The sidebar is always visible regardless of active tab.

### 4. Sidebar Component

**LegacySidebar props:**
```ts
interface LegacySidebarProps {
  legacy: Legacy;
  members: LegacyMember[];
  onMembersClick: () => void;
  onInvite: () => void;
  legacyId: string;
  onSectionChange: (section: SectionId) => void;
}
```

**Sections:**

**About** (collapsible, default open):
- Biography text from `legacy.biography`
- "Edit biography" link → navigates to `/legacy/:id/edit`
- If no biography: placeholder "Add a biography to tell their story"

**Life Timeline** (collapsible, default collapsed):
- Stubbed with placeholder: "Add life events to build a timeline"
- Visual: vertical dot + line timeline structure ready for future data
- No API needed now

**Members** (collapsible, default open):
- List from `legacy.members` — avatar (initials), name, role badge
- "+ Invite someone" button → opens MemberDrawer

**AI Story Prompt** (not collapsible, always visible):
- Dark gradient card: `bg-gradient-to-br from-theme-primary-dark to-theme-primary`
- Uses `useCurrentPrompt()` hook from `features/story-prompts/`
- Displays prompt text in italic serif
- "Discuss" button (outline, white text) → calls `useActOnPrompt()` with `discuss` action
- "Write a Story" button (white bg) → calls `useActOnPrompt()` with `write_story` action
- Shuffle button to rotate prompts

### 5. Story Card Enhancements

**Changes to StoryCard:**
- Remove the legacy name header row (redundant — we're already on the legacy page)
- Tags row: render `story.tags` as pills if the array exists and is non-empty (graceful no-op if tags aren't in the data model yet)
- Footer: keep existing layout, ensure visibility shows correct icon (`Globe`/`Lock`) + label
- Hover: keep existing `hover:-translate-y-0.5 hover:shadow-lg`

**Changes to StoriesSection:**
- Add header row: "Stories" (font-serif) on left, sort dropdown on right
- Sort options: Most Recent, Oldest First (client-side sort on `created_at`)
- "Share a Memory" CTA: update copy + add `PenLine` icon per mockup

### 6. AI Chat Visual Polish

**Changes to AISection:**
- Persona pills: use `bg-theme-primary text-white` for selected, `bg-white border` for unselected (replacing hardcoded amber)
- Chat container: already has `rounded-xl border` — just ensure bg is white with consistent theme border color
- No functional changes

### 7. New "Warm Earth" Theme

Added to the `muted` category in both `themes.ts` and `themeUtils.ts`:

```ts
// themes.ts
{
  id: 'warm-earth',
  name: 'Warm Earth',
  description: 'Rich and timeless',
  category: 'muted',
  colors: {
    primary: 'bg-stone-700',
    primaryLight: 'bg-stone-50',
    primaryDark: 'bg-stone-800',
    accent: 'border-stone-300',
    accentLight: 'bg-stone-100',
    surface: 'bg-stone-50',
    surfaceHover: 'hover:border-stone-400'
  }
}

// themeUtils.ts
'warm-earth': {
  primary: '92 75 58',       // #5C4B3A
  primaryLight: '212 197 176', // #D4C5B0
  primaryDark: '61 50 37',    // #3D3225
  accent: '139 125 107',      // #8B7D6B
  accentLight: '245 241 235', // #F5F1EB
  gradientFrom: '92 75 58',   // #5C4B3A
  gradientTo: '122 107 90',   // #7A6B5A
  background: '250 248 245',  // #FAF8F5
  surface: '255 255 255',     // white
}
```

## Responsive Behavior

| Breakpoint | Layout |
|---|---|
| `lg` (1024px+) | Two-column grid: `1fr 320px` |
| Below `lg` | Single column, sidebar stacks below main content |
| Below `sm` | Hero height reduces, action button text hidden (icons only), font sizes scale down |

## Data Requirements

All data already available — no new API calls needed:

| Data | Source |
|---|---|
| Legacy info | `useLegacyWithFallback()` → `legacy` object |
| Members | `legacy.members` array |
| Stories | `useStoriesWithFallback()` |
| Story prompt | `useCurrentPrompt()` from `features/story-prompts/` |
| Profile image | `legacy.profile_image_url` |
| Cover image | Fall back to profile image or gradient-only |

**Future data (stubbed):**
- Timeline events — no endpoint yet, show placeholder
- Story tags — may not be in `StorySummary` type yet, render conditionally

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Breaking existing functionality | No data flow changes — only visual restructuring |
| Theme compatibility | All colors use `theme-*` tokens, tested against multiple themes |
| Mobile regression | Grid collapses naturally with `grid-cols-1 lg:grid-cols-[1fr_320px]` |
| PageActionBar removal side effects | Only removed from LegacyProfile; other pages unaffected |
| Story prompt API availability | Already deployed and used on dashboard |
