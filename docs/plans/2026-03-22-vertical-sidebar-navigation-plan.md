# Vertical Sidebar Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure app navigation from horizontal top tabs to a two-level system with segmented control pill toggle + collapsible left sidebar.

**Architecture:** Replace the flat 5-tab navigation with 3 top-level sections (My Mosaic, Explore, Community) using a segmented control in the header. My Mosaic and Explore each get a collapsible left sidebar with sub-navigation. Routes restructured under `/my/...` and `/explore/...` with redirects for old URLs.

**Tech Stack:** React 18, TypeScript, React Router (nested layouts), Tailwind CSS, Lucide icons, Radix Sheet component, localStorage for sidebar state.

**Design Doc:** `docs/plans/2026-03-22-vertical-sidebar-navigation-design.md`

## Implementation Status

| Task | Status | Commit |
|------|--------|--------|
| 1. Restructure navigation config | Done | `295e6a4` |
| 2. Create SectionSwitcher | Done | `2bbfe91` |
| 3. Create SidebarNav | Done | `2bbfe91` |
| 4. Create SidebarLayout | Done | `2bbfe91` |
| 5. Create MobileNavSheet | Done | `2bbfe91` |
| 6. Update BottomTabBar | Done | `7b97e19` |
| 7. Update AppHeader | Done | `7b97e19` |
| 8. Create section layout routes | Done | `1eac29a` |
| 9. Create placeholder pages | Done | `1eac29a` |
| 10. Restructure router | Done | `26f4c1c` |
| 11. Remove Find People widget | Done | `47b2c80` |
| 12. Update internal links | Done | `47b2c80` |
| 13. Smoke test | Done | Manual verification pending |
| 14. Build validation | Done | `1eae5ca` (build, lint, 371 tests pass) |

---

### Task 1: Restructure Navigation Config

**Files:**
- Modify: `apps/web/src/lib/navigation.ts`

**Step 1: Write the new navigation config**

Replace the flat `NAV_ITEMS` array with a section-based structure:

```typescript
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Image,
  MessageCircle,
  User,
  Users,
  Sparkles,
  Compass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface Section {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  items?: NavItem[];
}

export const SECTIONS: Section[] = [
  {
    key: 'my',
    label: 'My Mosaic',
    icon: Sparkles,
    path: '/my',
    items: [
      { label: 'Overview', path: '/my/overview', icon: LayoutDashboard },
      { label: 'Legacies', path: '/my/legacies', icon: BookOpen },
      { label: 'Stories', path: '/my/stories', icon: FileText },
      { label: 'Media', path: '/my/media', icon: Image },
      { label: 'Conversations', path: '/my/conversations', icon: MessageCircle },
      { label: 'Personal', path: '/my/personal', icon: User },
    ],
  },
  {
    key: 'explore',
    label: 'Explore',
    icon: Compass,
    path: '/explore',
    items: [
      { label: 'Legacies', path: '/explore/legacies', icon: BookOpen },
      { label: 'Stories', path: '/explore/stories', icon: FileText },
      { label: 'Media', path: '/explore/media', icon: Image },
      { label: 'People', path: '/explore/people', icon: Users },
    ],
  },
  {
    key: 'community',
    label: 'Community',
    icon: Users,
    path: '/community',
  },
];

/** Helper: find which section the current path belongs to */
export function getActiveSection(pathname: string): Section | undefined {
  return SECTIONS.find(
    (s) => pathname === s.path || pathname.startsWith(s.path + '/'),
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/navigation.ts
git commit -m "refactor(web): restructure navigation config into sections"
```

---

### Task 2: Create SectionSwitcher Component

**Files:**
- Create: `apps/web/src/components/navigation/SectionSwitcher.tsx`

**Step 1: Build the segmented control pill toggle**

```typescript
import { useNavigate, useLocation } from 'react-router-dom';
import { SECTIONS, getActiveSection } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export default function SectionSwitcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = getActiveSection(pathname);

  return (
    <div className="flex items-center bg-neutral-100 rounded-lg p-1 gap-0.5">
      {SECTIONS.map((section) => {
        const isActive = activeSection?.key === section.key;
        return (
          <button
            key={section.key}
            onClick={() => navigate(section.path)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-white text-theme-primary shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/navigation/SectionSwitcher.tsx
git commit -m "feat(web): add SectionSwitcher segmented control component"
```

---

### Task 3: Create SidebarNav Component

**Files:**
- Create: `apps/web/src/components/navigation/SidebarNav.tsx`

**Step 1: Build the collapsible sidebar**

```typescript
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarNavProps {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SidebarNav({ items, collapsed, onToggleCollapse }: SidebarNavProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col border-r bg-neutral-50/80 transition-[width] duration-200 ease-in-out shrink-0',
          collapsed ? 'w-[60px]' : 'w-[200px]',
        )}
      >
        <nav className="flex-1 flex flex-col gap-1 p-2 pt-4">
          {items.map((item) => {
            const Icon = item.icon;
            const link = (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-theme-accent-light text-theme-primary'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                    collapsed && 'justify-center px-0',
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}
        </nav>
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center p-3 text-neutral-400 hover:text-neutral-600 transition-colors border-t"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="size-5" /> : <PanelLeftClose className="size-5" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/navigation/SidebarNav.tsx
git commit -m "feat(web): add SidebarNav collapsible sidebar component"
```

---

### Task 4: Create SidebarLayout Component

**Files:**
- Create: `apps/web/src/components/navigation/SidebarLayout.tsx`

**Step 1: Build the layout wrapper**

```typescript
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useIsMobile } from '@/components/ui/use-mobile';
import SidebarNav from './SidebarNav';
import type { NavItem } from '@/lib/navigation';

const SIDEBAR_COLLAPSED_KEY = 'mosaic-sidebar-collapsed';

interface SidebarLayoutProps {
  items: NavItem[];
}

export default function SidebarLayout({ items }: SidebarLayoutProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // No sidebar on mobile — the bottom sheet handles navigation
  if (isMobile) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <SidebarNav
        items={items}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/navigation/SidebarLayout.tsx
git commit -m "feat(web): add SidebarLayout wrapper component"
```

---

### Task 5: Create MobileNavSheet Component

**Files:**
- Create: `apps/web/src/components/navigation/MobileNavSheet.tsx`

**Step 1: Build the mobile bottom sheet**

Uses the existing Radix Sheet component from `@/components/ui/sheet`.

```typescript
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/navigation';

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: NavItem[];
}

export default function MobileNavSheet({ open, onOpenChange, title, items }: MobileNavSheetProps) {
  const { pathname } = useLocation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader>
          <SheetTitle className="text-left">{title}</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors',
                  isActive
                    ? 'bg-theme-accent-light text-theme-primary'
                    : 'text-neutral-600 hover:bg-neutral-100',
                )}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/navigation/MobileNavSheet.tsx
git commit -m "feat(web): add MobileNavSheet bottom sheet component"
```

---

### Task 6: Update BottomTabBar for 3-Tab + Sheet Behavior

**Files:**
- Modify: `apps/web/src/components/navigation/BottomTabBar.tsx`

**Step 1: Rewrite BottomTabBar**

Replace the current 5-tab NavLink bar with 3 tabs that trigger sheets or navigate directly.

```typescript
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SECTIONS, getActiveSection } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import MobileNavSheet from './MobileNavSheet';

export default function BottomTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = getActiveSection(pathname);
  const [sheetSection, setSheetSection] = useState<string | null>(null);

  const openSection = SECTIONS.find((s) => s.key === sheetSection);

  const handleTabPress = (section: typeof SECTIONS[number]) => {
    if (section.items) {
      // Toggle sheet: if already showing this section's sheet, close it
      if (sheetSection === section.key) {
        setSheetSection(null);
      } else {
        setSheetSection(section.key);
      }
    } else {
      // No sub-items — navigate directly (e.g., Community)
      setSheetSection(null);
      navigate(section.path);
    }
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection?.key === section.key;
            return (
              <button
                key={section.key}
                onClick={() => handleTabPress(section)}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors',
                  isActive
                    ? 'text-theme-primary'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                <Icon className="size-5" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {openSection?.items && (
        <MobileNavSheet
          open={!!sheetSection}
          onOpenChange={(open) => !open && setSheetSection(null)}
          title={openSection.label}
          items={openSection.items}
        />
      )}
    </>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/navigation/BottomTabBar.tsx
git commit -m "refactor(web): update BottomTabBar to 3 sections with sheet navigation"
```

---

### Task 7: Update AppHeader with SectionSwitcher

**Files:**
- Modify: `apps/web/src/components/header/AppHeader.tsx`

**Step 1: Replace NavLinks with SectionSwitcher**

In `AppHeader.tsx`, replace the `NavLinks` import and usage with `SectionSwitcher`. The center section for authenticated desktop users becomes:

```typescript
// Replace import:
// OLD: import NavLinks from './NavLinks';
// NEW:
import SectionSwitcher from '@/components/navigation/SectionSwitcher';

// In the JSX, replace the center section (lines 28-38):
{user && !isMobile ? (
  <div className="flex-1 flex items-center justify-center">
    <SectionSwitcher />
  </div>
) : isMobile ? (
  slotContent && <HeaderOverflowMenu>{slotContent}</HeaderOverflowMenu>
) : (
  <div className="flex-1 flex items-center justify-center gap-4 max-w-2xl">
    {slotContent}
  </div>
)}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/header/AppHeader.tsx
git commit -m "refactor(web): replace NavLinks with SectionSwitcher in header"
```

---

### Task 8: Create Section Layout Routes

**Files:**
- Create: `apps/web/src/routes/MyMosaicLayout.tsx`
- Create: `apps/web/src/routes/ExploreLayout.tsx`

**Step 1: Create MyMosaicLayout**

```typescript
import SidebarLayout from '@/components/navigation/SidebarLayout';
import { SECTIONS } from '@/lib/navigation';

const myMosaicSection = SECTIONS.find((s) => s.key === 'my')!;

export default function MyMosaicLayout() {
  return <SidebarLayout items={myMosaicSection.items!} />;
}
```

**Step 2: Create ExploreLayout**

```typescript
import SidebarLayout from '@/components/navigation/SidebarLayout';
import { SECTIONS } from '@/lib/navigation';

const exploreSection = SECTIONS.find((s) => s.key === 'explore')!;

export default function ExploreLayout() {
  return <SidebarLayout items={exploreSection.items!} />;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/routes/MyMosaicLayout.tsx apps/web/src/routes/ExploreLayout.tsx
git commit -m "feat(web): add MyMosaicLayout and ExploreLayout route wrappers"
```

---

### Task 9: Create Placeholder Pages

**Files:**
- Create: `apps/web/src/pages/MyMediaPage.tsx`
- Create: `apps/web/src/pages/PersonalPage.tsx`
- Create: `apps/web/src/pages/ExploreLegaciesPage.tsx`
- Create: `apps/web/src/pages/ExploreStoriesPage.tsx`
- Create: `apps/web/src/pages/ExploreMediaPage.tsx`
- Create: `apps/web/src/pages/ExplorePeoplePage.tsx`

**Step 1: Create placeholder pages**

Each page should follow the same minimal pattern so the navigation can be tested end-to-end. Full implementations come later.

Example for `MyMediaPage.tsx`:

```typescript
import { Image } from 'lucide-react';

export default function MyMediaPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Image className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">My Media</h1>
      </div>
      <p className="text-neutral-500">
        Your media across all legacies will appear here.
      </p>
    </div>
  );
}
```

Create similar placeholders for `PersonalPage`, `ExploreLegaciesPage`, `ExploreStoriesPage`, `ExploreMediaPage`, `ExplorePeoplePage` — each with an appropriate icon, title, and description.

**Step 2: Commit**

```bash
git add apps/web/src/pages/MyMediaPage.tsx apps/web/src/pages/PersonalPage.tsx \
  apps/web/src/pages/ExploreLegaciesPage.tsx apps/web/src/pages/ExploreStoriesPage.tsx \
  apps/web/src/pages/ExploreMediaPage.tsx apps/web/src/pages/ExplorePeoplePage.tsx
git commit -m "feat(web): add placeholder pages for new navigation sections"
```

---

### Task 10: Restructure Router

**Files:**
- Modify: `apps/web/src/routes/index.tsx`

**Step 1: Update the router with new route structure**

This is the critical wiring task. Key changes:
- Add lazy imports for new layouts and pages
- Add `/my` route with `MyMosaicLayout` and child routes
- Add `/explore` route with `ExploreLayout` and child routes
- Add redirect routes for old URLs (`/legacies` → `/my/legacies`, etc.)
- Update `AuthAwareHome` to redirect to `/my/overview` for authenticated users
- Keep all existing detail routes (`/legacy/:legacyId/...`), settings, and public routes unchanged

```typescript
// New lazy imports to add:
const MyMosaicLayout = lazy(() => import('./MyMosaicLayout'));
const ExploreLayout = lazy(() => import('./ExploreLayout'));
const MyMediaPage = lazy(() => import('@/pages/MyMediaPage'));
const PersonalPage = lazy(() => import('@/pages/PersonalPage'));
const ExploreLegaciesPage = lazy(() => import('@/pages/ExploreLegaciesPage'));
const ExploreStoriesPage = lazy(() => import('@/pages/ExploreStoriesPage'));
const ExploreMediaPage = lazy(() => import('@/pages/ExploreMediaPage'));
const ExplorePeoplePage = lazy(() => import('@/pages/ExplorePeoplePage'));

// Update AuthAwareHome:
function AuthAwareHome() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  return user ? <Navigate to="/my/overview" replace /> : <PublicHomePage />;
}

// New child routes to add inside the RootLayout children array:

// My Mosaic section
{
  path: 'my',
  element: (
    <ProtectedRoute>
      <LazyPage><MyMosaicLayout /></LazyPage>
    </ProtectedRoute>
  ),
  children: [
    { index: true, element: <Navigate to="overview" replace /> },
    { path: 'overview', element: <LazyPage><DashboardPage /></LazyPage> },
    { path: 'legacies', element: <LazyPage><LegaciesPage /></LazyPage> },
    { path: 'stories', element: <LazyPage><StoriesPage /></LazyPage> },
    { path: 'media', element: <LazyPage><MyMediaPage /></LazyPage> },
    { path: 'conversations', element: <LazyPage><ConnectionsPage /></LazyPage> },
    { path: 'personal', element: <LazyPage><PersonalPage /></LazyPage> },
  ],
},

// Explore section
{
  path: 'explore',
  element: (
    <ProtectedRoute>
      <LazyPage><ExploreLayout /></LazyPage>
    </ProtectedRoute>
  ),
  children: [
    { index: true, element: <Navigate to="legacies" replace /> },
    { path: 'legacies', element: <LazyPage><ExploreLegaciesPage /></LazyPage> },
    { path: 'stories', element: <LazyPage><ExploreStoriesPage /></LazyPage> },
    { path: 'media', element: <LazyPage><ExploreMediaPage /></LazyPage> },
    { path: 'people', element: <LazyPage><ExplorePeoplePage /></LazyPage> },
  ],
},

// Old URL redirects (add near the top of children, before catch-all):
{ path: 'legacies', element: <Navigate to="/my/legacies" replace /> },
{ path: 'stories', element: <Navigate to="/my/stories" replace /> },
{ path: 'connections', element: <Navigate to="/my/conversations" replace /> },

// Also update the existing my-legacies redirect:
{ path: 'my-legacies', element: <Navigate to="/my/legacies" replace /> },
```

Remove the old standalone `/legacies`, `/stories`, and `/connections` ProtectedRoute entries (lines 112-135 of current file) since they're now under `/my`.

**Step 2: Verify the app builds**

Run: `cd apps/web && npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "refactor(web): restructure router for section-based navigation"
```

---

### Task 11: Remove Find People Widget from Dashboard

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Step 1: Remove the Find People card**

Remove lines 90-97 (the Find People Card section) and the unused `Users` and `PeopleSearch` imports.

```typescript
// Remove from imports:
// - Users from lucide-react (if unused elsewhere in file)
// - PeopleSearch import

// Remove this JSX block:
{/* Find People */}
<Card className="p-4 space-y-3">
  <div className="flex items-center gap-2">
    <Users className="size-4 text-theme-primary" />
    <h3 className="text-sm font-medium text-neutral-900">Find People</h3>
  </div>
  <PeopleSearch variant="compact" />
</Card>
```

**Step 2: Update internal links from `/legacies` to `/my/legacies`**

In `DashboardPage.tsx`, update the "View all" link and the "View all N legacies" link:
- `to="/legacies"` → `to="/my/legacies"` (lines 38 and 74)

**Step 3: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "refactor(web): remove Find People widget, update dashboard links"
```

---

### Task 12: Update Internal Links Across Codebase

**Files:**
- Multiple files that link to `/legacies`, `/stories`, `/connections`

**Step 1: Search for old route references**

Run: `grep -r '"/legacies"' apps/web/src/ --include='*.tsx' --include='*.ts' -l`
Run: `grep -r '"/stories"' apps/web/src/ --include='*.tsx' --include='*.ts' -l`
Run: `grep -r '"/connections"' apps/web/src/ --include='*.tsx' --include='*.ts' -l`

**Step 2: Update each file**

Replace `"/legacies"` with `"/my/legacies"`, `"/stories"` with `"/my/stories"`, `"/connections"` with `"/my/conversations"` in all internal `<Link>` and `navigate()` calls.

**Important:** Do NOT change:
- Route definitions in `index.tsx` (the redirects handle those)
- API paths (only frontend route paths)
- The `to="/legacies"` redirect route itself

**Step 3: Commit**

```bash
git add -u apps/web/src/
git commit -m "refactor(web): update internal links to new /my/ route paths"
```

---

### Task 13: Smoke Test and Fix

**Step 1: Start the dev server**

Run: `cd apps/web && npm run dev`

**Step 2: Manual verification checklist**

Test each route and interaction:
- [ ] `/` redirects to `/my/overview` when logged in
- [ ] `/my/overview` shows dashboard without Find People widget
- [ ] Segmented control shows in header with correct active state
- [ ] Clicking each segment navigates to correct section
- [ ] Sidebar shows correct items for My Mosaic and Explore
- [ ] Sidebar collapse/expand works, state persists on refresh
- [ ] Sidebar tooltips show in collapsed mode
- [ ] Active sidebar item highlights correctly
- [ ] `/community` shows full-width, no sidebar
- [ ] Old URLs redirect: `/legacies` → `/my/legacies`, `/stories` → `/my/stories`, `/connections` → `/my/conversations`
- [ ] Detail routes still work: `/legacy/:id`, `/legacy/:id/story/:id`
- [ ] Settings routes unaffected
- [ ] Mobile: bottom bar shows 3 tabs
- [ ] Mobile: tapping My Mosaic/Explore opens sheet with sub-tabs
- [ ] Mobile: tapping Community navigates directly
- [ ] Mobile: no sidebar visible

**Step 3: Fix any issues found**

**Step 4: Commit any fixes**

```bash
git add -u apps/web/src/
git commit -m "fix(web): address navigation smoke test issues"
```

---

### Task 14: Build Validation

**Step 1: Run the build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

**Step 2: Run lint**

Run: `cd apps/web && npm run lint`
Expected: No new lint errors.

**Step 3: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: Existing tests pass (some may need route updates).

**Step 4: Fix any test failures**

Tests that reference old routes (`/legacies`, `/stories`, `/connections`) may need updating to the new paths.

**Step 5: Commit any fixes**

```bash
git add -u apps/web/
git commit -m "fix(web): update tests for new navigation routes"
```
