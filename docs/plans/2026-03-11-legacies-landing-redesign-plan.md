# Legacies Landing Page Redesign — Implementation Plan

> **Status: COMPLETED** — All 9 tasks implemented, verified, and committed on 2026-03-11.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the `/legacies` page to match the `mosaic-legacy-landing-v2.jsx` mockup — warm gradient header, custom tabs, toolbar with sort/search/grid-list toggle, redesigned cards, and new list-view variants.

**Architecture:** Evolve existing components in-place. No backend, hook, or API changes. Pure frontend restyling plus two new list-view components. Fonts stay as Inter + Merriweather.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, TanStack Query (existing hooks unchanged)

**Design doc:** `docs/plans/2026-03-11-legacies-landing-redesign-design.md`

**Reference mockup:** `mosaic-legacy-landing-v2.jsx` (root of repo — design reference only, do NOT copy inline styles)

---

## Task 1: Restructure LegaciesPage Header & Custom Tabs ✅

**Files:**
- Modify: `apps/web/src/pages/LegaciesPage.tsx`
- Modify: `apps/web/src/components/legacies-hub/StatsBar.tsx`

**Context:** The current page has a flat white header with shadcn `<Tabs>`. We're replacing this with a warm gradient header zone containing breadcrumb, title, stats, and custom tab buttons. The `RecentlyViewedChips` import is removed from this page (it moves into tab content components in Task 5).

**Step 1: Update LegaciesPage header and tabs**

Replace the entire `LegaciesPage` component. Key changes:
- Add gradient header wrapper (`bg-gradient-to-b from-stone-100 to-stone-50 border-b border-stone-200`)
- Add breadcrumb: `Home > Legacies` using `ChevronRight`
- Change title to "Your Legacies", subtitle to "The stories and memories that keep them close."
- Move `StatsBar` inside the header zone
- Replace shadcn `<Tabs>` with custom tab buttons that have bottom-border accent and inline count badges
- Tab counts come from the existing `useStats` hook data
- Remove `RecentlyViewedChips` import and usage
- Add `view` and `sort` URL search params alongside existing `tab` and `filter`
- Pass `viewMode`, `sortBy`, `searchQuery` and their setters down to tab content components (or let each tab content manage its own state — simpler)

The tab buttons should be rendered as `<button>` elements with:
- Active: `border-b-2 border-theme-primary font-semibold text-neutral-900`
- Inactive: `border-b-2 border-transparent text-neutral-400 hover:text-neutral-600`
- Count badge: small `rounded-full` pill next to label

```tsx
// Tab button example
<button
  onClick={() => handleTabChange(tab.id)}
  className={cn(
    'px-5 pb-3 text-sm transition-colors flex items-center gap-2',
    activeTab === tab.id
      ? 'border-b-2 border-theme-primary font-semibold text-neutral-900'
      : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-600',
  )}
>
  {tab.label}
  {tab.count != null && (
    <span className={cn(
      'text-xs font-semibold px-2 py-0.5 rounded-full',
      activeTab === tab.id
        ? 'bg-theme-primary text-white'
        : 'bg-stone-200 text-neutral-500',
    )}>
      {tab.count}
    </span>
  )}
</button>
```

New imports needed: `ChevronRight` from lucide-react, `cn` from `@/components/ui/utils`.

Remove imports: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`, and `RecentlyViewedChips`.

The tab content components are now rendered conditionally (`{activeTab === 'legacies' && <LegaciesTabContent ... />}`) instead of inside `<TabsContent>`.

**Step 2: Restyle StatsBar**

Update `apps/web/src/components/legacies-hub/StatsBar.tsx` to use the new design:
- Horizontal row with emoji icon + serif number + small label
- Remove the divider styling, use gap spacing instead
- Number: `font-serif text-xl font-semibold text-neutral-900`
- Label: `text-xs text-neutral-400 font-medium tracking-wide`
- Emoji icons: 🏛 Legacies, 📖 Stories, 🔗 Connections, ❤️ Favorites

```tsx
const STAT_ITEMS = [
  { emoji: '🏛', key: 'legacies_count', label: 'Legacies' },
  { emoji: '📖', key: 'stories_count', label: 'Stories' },
  { emoji: '🔗', key: 'legacy_links_count', label: 'Connections' },
  { emoji: '❤️', key: 'favorites_count', label: 'Favorites' },
] as const;
```

Each stat item renders:
```tsx
<div className="flex items-center gap-2.5">
  <span className="text-xl">{emoji}</span>
  <div>
    <div className="font-serif text-xl font-semibold text-neutral-900 leading-none">{count}</div>
    <div className="text-xs text-neutral-400 font-medium tracking-wide">{label}</div>
  </div>
</div>
```

Also export a `statsCounts` shape from StatsBar so the parent can read counts for tab badges. Alternatively, call `useStats()` directly in `LegaciesPage` to get the counts for tab badges — this is simpler. The hook caches so there's no double fetch.

**Step 3: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`
Expected: No type errors

Run: `cd /apps/mosaic-life/apps/web && npm run lint`
Expected: No lint errors

```bash
git add apps/web/src/pages/LegaciesPage.tsx apps/web/src/components/legacies-hub/StatsBar.tsx
git commit -m "feat(legacies): redesign page header with gradient, breadcrumb, custom tabs"
```

---

## Task 2: Create Toolbar Component ✅

**Files:**
- Create: `apps/web/src/components/legacies-hub/Toolbar.tsx`

**Context:** Both the Legacies and Stories tabs share the same toolbar structure: filter pills (left) + sort dropdown + search input + grid/list toggle (right). Create a reusable toolbar component.

**Step 1: Create Toolbar component**

```tsx
import { Search, ArrowUpDown, Grid3X3, List } from 'lucide-react';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';
import { cn } from '@/components/ui/utils';

export interface SortOption {
  value: string;
  label: string;
}

interface ToolbarProps {
  filterOptions: FilterOption[];
  activeFilter: string;
  onFilterChange: (key: string) => void;
  sortOptions: SortOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}
```

Layout: `flex justify-between items-center` with filter pills on the left and controls on the right.

Sort dropdown: native `<select>` styled with Tailwind:
```tsx
<div className="flex items-center gap-1.5">
  <ArrowUpDown className="size-3.5 text-neutral-400" />
  <select
    value={sortValue}
    onChange={(e) => onSortChange(e.target.value)}
    className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-theme-primary/20"
  >
    {sortOptions.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
</div>
```

Search input:
```tsx
<div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5 w-52">
  <Search className="size-4 text-neutral-400" />
  <input
    placeholder={searchPlaceholder ?? 'Search...'}
    value={searchValue}
    onChange={(e) => onSearchChange(e.target.value)}
    className="border-none outline-none flex-1 text-sm text-neutral-900 bg-transparent placeholder:text-neutral-400"
  />
</div>
```

Grid/List toggle:
```tsx
<div className="flex bg-white border border-stone-200 rounded-lg overflow-hidden">
  <button
    onClick={() => onViewModeChange('grid')}
    className={cn('p-2 flex', viewMode === 'grid' ? 'bg-stone-100' : 'hover:bg-stone-50')}
    aria-label="Grid view"
  >
    <Grid3X3 className={cn('size-4', viewMode === 'grid' ? 'text-neutral-700' : 'text-neutral-400')} />
  </button>
  <button
    onClick={() => onViewModeChange('list')}
    className={cn('p-2 flex', viewMode === 'list' ? 'bg-stone-100' : 'hover:bg-stone-50')}
    aria-label="List view"
  >
    <List className={cn('size-4', viewMode === 'list' ? 'text-neutral-700' : 'text-neutral-400')} />
  </button>
</div>
```

**Step 2: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/components/legacies-hub/Toolbar.tsx
git commit -m "feat(legacies): add reusable Toolbar with sort, search, grid/list toggle"
```

---

## Task 3: Refactor RecentlyViewedChips into RecentChipRow ✅

**Files:**
- Modify: `apps/web/src/components/legacies-hub/RecentlyViewedChips.tsx`

**Context:** The current component is tightly coupled to legacy recently-viewed data. Refactor it into a generic `RecentChipRow` that accepts title, icon, and pre-fetched items. The data fetching moves to the parent (tab content components). Keep the file name as `RecentlyViewedChips.tsx` to avoid breaking imports elsewhere, but export the new generic component.

**Step 1: Refactor the component**

Add a new generic export `RecentChipRow`:

```tsx
import type { LucideIcon } from 'lucide-react';

export interface ChipItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  timeAgo: string;
}

interface RecentChipRowProps {
  title: string;
  icon: LucideIcon;
  items: ChipItem[];
  onItemClick: (id: string) => void;
}

export function RecentChipRow({ title, icon: Icon, items, onItemClick }: RecentChipRowProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-neutral-400 mb-2.5 flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <div className="flex gap-2.5 flex-wrap">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item.id)}
            className="flex items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl border border-stone-200 hover:border-stone-300 transition-colors cursor-pointer"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="size-7 rounded-full object-cover border-[1.5px] border-stone-200"
              />
            ) : (
              <div className="size-7 rounded-full bg-stone-100 flex items-center justify-center">
                <Users className="size-3.5 text-neutral-300" />
              </div>
            )}
            <div className="text-left">
              <div className="text-sm font-medium text-neutral-900 leading-tight max-w-[180px] truncate">
                {item.name}
              </div>
              <div className="text-xs text-neutral-400">{item.timeAgo}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

Keep the existing `RecentlyViewedChips` default export as a convenience wrapper that calls `useRecentlyViewed` internally and maps data to `ChipItem[]` + renders `RecentChipRow`. This way any existing imports still work.

Import `Users` from lucide-react for the fallback avatar, and `formatDistanceToNow` from `date-fns` for time formatting.

Map `EnrichedRecentItem` → `ChipItem`:
```tsx
const chipItems: ChipItem[] = data.items
  .filter((item) => item.entity)
  .map((item) => ({
    id: item.entity_id,
    name: item.entity?.name || item.entity?.title || 'Unknown',
    imageUrl: item.entity?.profile_image_url ? rewriteBackendUrlForDev(item.entity.profile_image_url) : null,
    timeAgo: formatDistanceToNow(new Date(item.last_activity_at), { addSuffix: true }),
  }));
```

**Step 2: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/components/legacies-hub/RecentlyViewedChips.tsx
git commit -m "refactor(legacies): extract generic RecentChipRow from RecentlyViewedChips"
```

---

## Task 4: Redesign LegacyCard (Grid) + Create LegacyCardList ✅

**Files:**
- Modify: `apps/web/src/components/legacy/LegacyCard.tsx`
- Create: `apps/web/src/components/legacy/LegacyCardList.tsx`

**Context:** The current LegacyCard uses the profile photo as a 4:3 hero. The new design has a cover photo zone with an overlapping circular profile photo, stats row, and hover-reveal action buttons. The list variant is a completely different layout.

**Step 1: Redesign LegacyCard grid view**

Keep the same props interface (`LegacyCardProps`). Rewrite the JSX:

Structure:
```
<div> (card container — rounded-2xl, overflow-hidden, hover:-translate-y-1, group)
  <div> (cover zone — h-36, relative)
    <img> or gradient placeholder (cover — blurred profile_image_url or gradient)
    <gradient overlay>
    <"In Memoriam" badge — top-left>
    <profile photo — absolute, bottom, overlapping into content area>
  </div>
  <div> (content — pt-10 to account for overlapping photo)
    <name — font-serif text-lg>
    <dates — text-sm text-neutral-400>
    <tagline — italic text-neutral-500, truncate>
    <divider — border-t>
    <stats row — story_count, members, favorite_count>
    <hover buttons — opacity-0 group-hover:opacity-100>
  </div>
</div>
```

Key implementation details:
- Cover photo: If `profile_image_url` exists, render it as cover with `object-cover brightness-[0.85] saturate-[0.9]` and a subtle `group-hover:scale-105 transition-transform duration-500`. If no image, render `bg-gradient-to-br from-stone-200 to-stone-300`.
- Profile photo: `absolute -bottom-7 left-5 size-16 rounded-full border-[3px] border-white shadow-md object-cover`. Fallback: `Users` icon in a circle.
- "In Memoriam" badge: `absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-semibold text-neutral-700`. Only shown when `context === 'memorial'`.
- Stats row: reuse `BookOpen`, `Users`, `Heart` icons with counts. `text-sm text-neutral-500`.
- Hover buttons: "View Stories" (primary filled `bg-theme-primary text-white`) and "AI Chat" (outline `border border-stone-300 text-neutral-700`). Container has `opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all`.
- Card shadow: `shadow-sm hover:shadow-xl transition-all duration-300`.
- Remove the `Card` shadcn wrapper — use a plain `<div>` with manual styling for more control over the border radius and shadow transitions.
- Keep `trailingAction` (FavoriteButton) — position it in the stats row area or keep it flexible.

**Step 2: Create LegacyCardList component**

New file `apps/web/src/components/legacy/LegacyCardList.tsx`:

```tsx
import { ChevronRight, BookOpen, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { formatDistanceToNow } from 'date-fns';

export interface LegacyCardListProps {
  legacy: Legacy;
  trailingAction?: React.ReactNode;
}
```

Layout:
```
<div> (row — flex items-center gap-5, px-5 py-4, border-b, hover:bg-stone-50, cursor-pointer)
  <div> (avatar container — relative, shrink-0)
    <img> or fallback (size-14 rounded-full border-2)
    <badge> (absolute bottom-right — tiny "In Memoriam" pill)
  </div>
  <div> (text content — flex-1 min-w-0)
    <div> (name row — flex items-baseline gap-2)
      <h3> (font-serif text-lg)
      <span> (dates — text-sm text-neutral-400)
    </div>
    <p> (tagline — text-sm text-neutral-500 truncate)
  </div>
  <div> (stats + meta — flex items-center gap-5 shrink-0)
    <stat> (📖 N stories)
    <stat> (👥 N members)
    <span> (time ago — text-xs text-neutral-400)
    <ChevronRight>
  </div>
</div>
```

Time ago: `formatDistanceToNow(new Date(legacy.updated_at), { addSuffix: true })`

**Step 3: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/components/legacy/LegacyCard.tsx apps/web/src/components/legacy/LegacyCardList.tsx
git commit -m "feat(legacies): redesign LegacyCard grid view, add LegacyCardList"
```

---

## Task 5: Update LegaciesTabContent with Toolbar + Grid/List + RecentChipRow ✅

**Files:**
- Modify: `apps/web/src/components/legacies-hub/LegaciesTabContent.tsx`

**Context:** Add the toolbar, remove the "Create New Legacy" placeholder card, integrate the new `RecentChipRow`, and support grid/list toggle with sort and search.

**Step 1: Update LegaciesTabContent**

New state:
```tsx
const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
const [sortBy, setSortBy] = useState('recent');
const [searchQuery, setSearchQuery] = useState('');
```

Filter options stay the same (All, My Legacies, Connected, Favorites).

Sort options:
```tsx
const sortOptions: SortOption[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'stories', label: 'Most Stories' },
  { value: 'members', label: 'Most Members' },
  { value: 'alpha', label: 'Alphabetical' },
];
```

Add client-side sort + search logic:
```tsx
const filteredAndSorted = useMemo(() => {
  if (!data?.items) return [];
  let items = [...data.items];

  // Search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    items = items.filter((l) =>
      l.name.toLowerCase().includes(q) ||
      l.biography?.toLowerCase().includes(q)
    );
  }

  // Sort
  switch (sortBy) {
    case 'stories': items.sort((a, b) => (b.story_count ?? 0) - (a.story_count ?? 0)); break;
    case 'members': items.sort((a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0)); break;
    case 'alpha': items.sort((a, b) => a.name.localeCompare(b.name)); break;
    default: items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  return items;
}, [data?.items, searchQuery, sortBy]);
```

Replace `QuickFilters` with `Toolbar` component. Remove the "Create New Legacy" `<Card>` entirely.

Add `RecentChipRow` for recently viewed legacies (import from `RecentlyViewedChips.tsx`). Use `useRecentlyViewed('legacy', 6)` and map to `ChipItem[]`. Place it between the toolbar and the cards.

Render grid or list based on `viewMode`:
```tsx
{viewMode === 'grid' ? (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
    {filteredAndSorted.map((legacy) => (
      <LegacyCard key={legacy.id} legacy={legacy} trailingAction={...} />
    ))}
  </div>
) : (
  <div className="bg-white rounded-2xl overflow-hidden border border-stone-200">
    {filteredAndSorted.map((legacy) => (
      <LegacyCardList key={legacy.id} legacy={legacy} trailingAction={...} />
    ))}
  </div>
)}
```

Import `useMemo` from react, `LegacyCardList` from the new file, `Toolbar` and `SortOption` from `./Toolbar`, `RecentChipRow` and `ChipItem` from `./RecentlyViewedChips`, `useRecentlyViewed` from activity hooks, `formatDistanceToNow` from `date-fns`, `rewriteBackendUrlForDev` from `@/lib/url`, `Clock` from lucide-react.

**Step 2: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/components/legacies-hub/LegaciesTabContent.tsx
git commit -m "feat(legacies): add toolbar, grid/list toggle, remove create card placeholder"
```

---

## Task 6: Redesign StoryCard (Grid) + Create StoryCardList ✅

**Files:**
- Modify: `apps/web/src/features/legacy/components/StoryCard.tsx`
- Create: `apps/web/src/features/legacy/components/StoryCardList.tsx`

**Context:** The current StoryCard is a flat card. The new grid design has a legacy context pill at top, structured footer, and hover effects. The list variant is a horizontal row with accent bar.

**Step 1: Redesign StoryCard grid view**

Keep same props interface. Rewrite JSX:

Structure:
```
<div> (card — rounded-xl border hover:-translate-y-0.5 hover:shadow-lg group)
  <div> (content — p-5)
    <div> (legacy pill — flex items-center gap-2, mb-3)
      <circle placeholder> (size-5.5 rounded-full bg-stone-200)
      <span> (text-xs font-medium text-neutral-500 — legacy name)
    </div>
    <div> (title row — flex justify-between)
      <h3> (font-serif text-base font-semibold)
      <FavoriteButton>
    </div>
    <p> (preview — line-clamp-3, text-sm text-neutral-500)
    <badges> (Draft, Shared — keep existing logic)
  </div>
  <div> (footer — border-t bg-stone-50 px-5 py-3)
    <left: author avatar + name>
    <right: visibility icon + label, date>
  </div>
</div>
```

Legacy name: `story.legacies[0]?.legacy_name ?? 'Unknown Legacy'`

Footer left:
```tsx
<div className="flex items-center gap-2">
  <div className="size-6 rounded-full bg-theme-primary flex items-center justify-center text-[9px] font-semibold text-white">
    {authorInitials}
  </div>
  <span className="text-xs text-neutral-500">{story.author_name}</span>
</div>
```

Footer right:
```tsx
<div className="flex items-center gap-2.5">
  <span className="text-xs text-neutral-400 flex items-center gap-1">
    {story.visibility === 'public' ? <Globe className="size-2.5" /> : <Lock className="size-2.5" />}
    {story.visibility === 'private' ? 'Members only' : story.visibility === 'personal' ? 'Personal' : 'Public'}
  </span>
  <span className="text-xs text-neutral-400">{formattedDate}</span>
</div>
```

Add `Globe` to lucide imports.

**Step 2: Create StoryCardList component**

New file `apps/web/src/features/legacy/components/StoryCardList.tsx`:

```tsx
import { ChevronRight, Globe, Lock } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import type { StorySummary } from '@/features/story/api/stories';

export interface StoryCardListProps {
  story: StorySummary;
  onClick?: () => void;
  isFavorited?: boolean;
}
```

Layout:
```
<div> (row — flex items-start gap-4, px-5 py-4, border-b, hover:bg-stone-50)
  <div> (accent bar — w-[3px] min-h-[48px] rounded-full, bg-red-400 if fav else bg-stone-300)
  <div> (legacy avatar — size-10 rounded-full bg-stone-100 shrink-0)
  <div> (text — flex-1 min-w-0)
    <h3> (font-serif text-base truncate)
    <div> (meta — text-xs text-neutral-400: legacy · author · date)
    <p> (snippet — text-sm text-neutral-500 truncate)
  </div>
  <div> (right controls — flex items-center gap-3 shrink-0)
    <visibility icon>
    <FavoriteButton>
    <ChevronRight>
  </div>
</div>
```

**Step 3: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/features/legacy/components/StoryCard.tsx apps/web/src/features/legacy/components/StoryCardList.tsx
git commit -m "feat(legacies): redesign StoryCard grid view, add StoryCardList"
```

---

## Task 7: Update StoriesTabContent with Toolbar + Grid/List + RecentChipRow + New Filters ✅

**Files:**
- Modify: `apps/web/src/components/legacies-hub/StoriesTabContent.tsx`

**Context:** Add toolbar, new filter set (All | My Stories | Favorites | Public | Private), grid/list toggle, sort, search, and RecentChipRow for recently viewed/edited stories.

**Step 1: Update StoriesTabContent**

New imports: `Toolbar`, `SortOption`, `RecentChipRow`, `ChipItem`, `StoryCardList`, `useRecentlyViewed`, `Clock`, `PenLine`, `formatDistanceToNow`, `useMemo`, `useState`.

New state:
```tsx
const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
const [sortBy, setSortBy] = useState('recent');
const [searchQuery, setSearchQuery] = useState('');
```

New filter options (the `onFilterChange` callback already updates URL params):
```tsx
const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My Stories' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'public', label: 'Public' },
  { key: 'private', label: 'Private' },
];
```

**Important:** Update `VALID_FILTERS` in `LegaciesPage.tsx` to include the new story filter keys:
```tsx
stories: ['all', 'mine', 'favorites', 'public', 'private'],
```
And change the default story filter from `'mine'` to `'all'`:
```tsx
stories: 'all',
```

For `public` and `private` filters, fetch with `scope: 'all'` and filter client-side:
```tsx
// Determine API scope from filter
const apiScope: StoryScope = (() => {
  if (activeFilter === 'public' || activeFilter === 'private') return 'all';
  return activeFilter as StoryScope;
})();

const { data: stories, isLoading } = useScopedStories(apiScope);
```

Sort options:
```tsx
const sortOptions: SortOption[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'edited', label: 'Recently Edited' },
  { value: 'loved', label: 'Most Loved' },
  { value: 'longest', label: 'Longest' },
  { value: 'alpha', label: 'Alphabetical' },
];
```

Client-side filter + sort + search:
```tsx
const filteredAndSorted = useMemo(() => {
  if (!stories?.items) return [];
  let items = [...stories.items];

  // Visibility filter
  if (activeFilter === 'public') items = items.filter((s) => s.visibility === 'public');
  if (activeFilter === 'private') items = items.filter((s) => s.visibility !== 'public');

  // Search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    items = items.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.content_preview?.toLowerCase().includes(q) ||
      s.author_name?.toLowerCase().includes(q)
    );
  }

  // Sort
  switch (sortBy) {
    case 'edited': items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()); break;
    case 'loved': items.sort((a, b) => (b.favorite_count ?? 0) - (a.favorite_count ?? 0)); break;
    case 'longest': items.sort((a, b) => (b.content_preview?.length ?? 0) - (a.content_preview?.length ?? 0)); break;
    case 'alpha': items.sort((a, b) => a.title.localeCompare(b.title)); break;
    default: items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return items;
}, [stories?.items, activeFilter, searchQuery, sortBy]);
```

Add RecentChipRow for recently viewed stories:
```tsx
const { data: recentlyViewedData } = useRecentlyViewed('story', 6);

// Map to ChipItem[]
const recentlyViewedChips: ChipItem[] = (recentlyViewedData?.items ?? [])
  .filter((item) => item.entity)
  .map((item) => ({
    id: item.entity_id,
    name: item.entity?.title || 'Untitled',
    imageUrl: null, // Stories don't have images
    timeAgo: formatDistanceToNow(new Date(item.last_activity_at), { addSuffix: true }),
  }));
```

Render grid or list based on `viewMode`, same pattern as LegaciesTabContent but with `StoryCard` / `StoryCardList`.

**Step 2: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/components/legacies-hub/StoriesTabContent.tsx apps/web/src/pages/LegaciesPage.tsx
git commit -m "feat(legacies): add toolbar, grid/list, new filters to Stories tab"
```

---

## Task 8: Restyle ActivityTabContent + Final Polish ✅

**Files:**
- Modify: `apps/web/src/components/legacies-hub/ActivityTabContent.tsx`

**Context:** Minor restyle to match the new warm stone palette. The activity tab stays functional as-is.

**Step 1: Update ActivityTabContent empty state**

Update the empty state to use the warmer styling from the mockup:
- Heading: `font-serif text-lg font-semibold text-neutral-600` "Activity Feed"
- Subtext: `text-sm text-neutral-400` "A timeline of all updates across your legacies — coming soon."
- Icon: `Clock` (already used in the mockup) instead of `Activity`, with `text-neutral-300 opacity-50`
- Padding: `py-20`

Keep the existing activity feed rendering for when items exist — it already works well.

**Step 2: Verify and commit**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`
Run: `cd /apps/mosaic-life/apps/web && npm run lint`

```bash
git add apps/web/src/components/legacies-hub/ActivityTabContent.tsx
git commit -m "feat(legacies): restyle activity tab empty state"
```

---

## Task 9: Visual QA & Final Verification ✅

**Files:** All modified files from Tasks 1-8

**Step 1: Run full type check**

Run: `cd /apps/mosaic-life/apps/web && npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint**

Run: `cd /apps/mosaic-life/apps/web && npm run lint`
Expected: No errors

**Step 3: Run tests**

Run: `cd /apps/mosaic-life/apps/web && npm run test -- --run`
Expected: All existing tests pass (some may need minor updates if they assert on removed elements like the "Create New Legacy" card)

**Step 4: Fix any test failures**

If tests fail due to:
- Missing "Create New Legacy" card — remove assertions that look for it
- Changed heading text ("Legacies" → "Your Legacies") — update assertions
- Changed tab rendering (shadcn Tabs → custom buttons) — update test selectors

**Step 5: Build check**

Run: `cd /apps/mosaic-life/apps/web && npm run build`
Expected: Successful build with no errors

**Step 6: Commit any test fixes**

```bash
git add -A
git commit -m "test(legacies): update tests for landing page redesign"
```
