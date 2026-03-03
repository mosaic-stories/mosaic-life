# Split Homepage & Authenticated Navigation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the single homepage into separate public and authenticated experiences, add persistent navigation for logged-in users, and create new top-level pages (Legacies, Stories, Conversations).

**Architecture:** The `/` route renders an `AuthAwareHome` wrapper that checks `useAuth()` and renders either `PublicHomePage` (marketing) or `DashboardPage` (personal). A new `NavLinks` component renders inline in the header for authenticated desktop users, with a `BottomTabBar` for mobile. New routes `/legacies`, `/stories`, `/conversations` are added.

**Tech Stack:** React 18, TypeScript (strict), React Router v6 (`NavLink`), TanStack Query, Tailwind CSS, Lucide icons, Vitest + React Testing Library

**Design doc:** `docs/plans/2026-03-02-split-homepage-design.md`

---

## Shared Test Utilities

All tests in this plan use the same `renderWithProviders` pattern established in `src/components/header/AppHeader.test.tsx`. Here's the pattern:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderWithProviders(ui: React.ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}
```

Mock auth (used across most test files):
```tsx
let mockUser: { id: string; name: string; email: string; avatar_url?: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: vi.fn(), logout: vi.fn() }),
}));
```

---

## Task 1: Navigation Config — Shared Route Definitions

**Files:**
- Create: `src/lib/navigation.ts`
- Test: `src/lib/navigation.test.ts`

This task creates a single source of truth for nav items, used by both the header and bottom tab bar.

**Step 1: Write the test**

```ts
// src/lib/navigation.test.ts
import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from './navigation';

describe('NAV_ITEMS', () => {
  it('has 5 navigation items', () => {
    expect(NAV_ITEMS).toHaveLength(5);
  });

  it('defines Home as first item pointing to /', () => {
    expect(NAV_ITEMS[0]).toMatchObject({
      label: 'Home',
      path: '/',
    });
  });

  it('includes all expected routes', () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(paths).toEqual(['/', '/legacies', '/stories', '/conversations', '/community']);
  });

  it('each item has label, path, and icon', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.path).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/navigation.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// src/lib/navigation.ts
import { Home, Landmark, BookOpen, MessageCircle, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Legacies', path: '/legacies', icon: Landmark },
  { label: 'Stories', path: '/stories', icon: BookOpen },
  { label: 'Conversations', path: '/conversations', icon: MessageCircle },
  { label: 'Community', path: '/community', icon: Users },
];
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/navigation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/navigation.ts apps/web/src/lib/navigation.test.ts
git commit -m "feat(nav): add shared navigation config"
```

---

## Task 2: ContextualGreeting Component

**Files:**
- Create: `src/components/dashboard/ContextualGreeting.tsx`
- Test: `src/components/dashboard/ContextualGreeting.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/dashboard/ContextualGreeting.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContextualGreeting from './ContextualGreeting';

// Mock auth
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

// Mock activity hooks
vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: null }),
}));

// Mock notification hooks
vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

function renderGreeting() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContextualGreeting />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ContextualGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows morning greeting before noon', () => {
    vi.setSystemTime(new Date('2026-03-02T09:00:00'));
    renderGreeting();
    expect(screen.getByText(/good morning, joe/i)).toBeInTheDocument();
  });

  it('shows afternoon greeting after noon', () => {
    vi.setSystemTime(new Date('2026-03-02T14:00:00'));
    renderGreeting();
    expect(screen.getByText(/good afternoon, joe/i)).toBeInTheDocument();
  });

  it('shows evening greeting after 5pm', () => {
    vi.setSystemTime(new Date('2026-03-02T19:00:00'));
    renderGreeting();
    expect(screen.getByText(/good evening, joe/i)).toBeInTheDocument();
  });

  it('shows night greeting after 9pm', () => {
    vi.setSystemTime(new Date('2026-03-02T23:00:00'));
    renderGreeting();
    expect(screen.getByText(/good night, joe/i)).toBeInTheDocument();
  });

  it('shows fallback prompt when no activity or notifications', () => {
    vi.setSystemTime(new Date('2026-03-02T10:00:00'));
    renderGreeting();
    expect(screen.getByText(/what would you like to work on today/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/dashboard/ContextualGreeting.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/dashboard/ContextualGreeting.tsx
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import { useUnreadCount } from '@/features/notifications/hooks/useNotifications';

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function getFirstName(name?: string): string {
  if (!name) return '';
  return name.split(' ')[0];
}

export default function ContextualGreeting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: recentStories } = useRecentlyViewed('story', 1);
  const { data: unreadData } = useUnreadCount();

  const hour = new Date().getHours();
  const greeting = getGreeting(hour);
  const firstName = getFirstName(user?.name || user?.email);

  // Priority 1: Resume editing a recent story
  const recentStory = recentStories?.items?.[0]?.entity;
  const storyId = recentStories?.items?.[0]?.entity_id;
  const legacyId = recentStory?.legacy_id;

  // Priority 2: Unread notifications
  const unreadCount = unreadData?.count ?? 0;

  return (
    <section className="max-w-7xl mx-auto px-6 pt-8 pb-4">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">
        {greeting}, {firstName}
      </h1>

      <div className="mt-2">
        {recentStory && legacyId ? (
          <button
            onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
            className="text-neutral-600 hover:text-theme-primary transition-colors inline-flex items-center gap-1 group"
          >
            Continue editing &ldquo;{recentStory.title}&rdquo;
            <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : unreadCount > 0 ? (
          <button
            onClick={() => navigate('/notifications')}
            className="text-neutral-600 hover:text-theme-primary transition-colors"
          >
            You have {unreadCount} new {unreadCount === 1 ? 'notification' : 'notifications'}
          </button>
        ) : (
          <p className="text-neutral-500">What would you like to work on today?</p>
        )}
      </div>
    </section>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/dashboard/ContextualGreeting.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/ContextualGreeting.tsx apps/web/src/components/dashboard/ContextualGreeting.test.tsx
git commit -m "feat(dashboard): add contextual greeting component"
```

---

## Task 3: PublicHomePage — Extract Public Sections

**Files:**
- Create: `src/pages/PublicHomePage.tsx`
- Test: `src/pages/PublicHomePage.test.tsx`

Extract the public-facing sections from `Homepage.tsx` (lines 57-384) into a standalone page: Hero, Explore Legacies (no auth filters), CTA, Footer.

**Step 1: Write the test**

```tsx
// src/pages/PublicHomePage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock auth — always unauthenticated for this page
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('@/lib/hooks/useAuthModal', () => ({
  useAuthModal: (selector: (s: { open: () => void }) => unknown) =>
    selector({ open: vi.fn() }),
}));

vi.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ currentTheme: 'warm-amber', setTheme: vi.fn() }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useExploreLegacies: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

import PublicHomePage from './PublicHomePage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicHomePage', () => {
  it('renders the hero section', () => {
    renderPage();
    expect(screen.getByText(/honor the lives and milestones/i)).toBeInTheDocument();
  });

  it('renders the Explore Legacies section', () => {
    renderPage();
    expect(screen.getByText(/explore legacies/i)).toBeInTheDocument();
  });

  it('renders the CTA section', () => {
    renderPage();
    expect(screen.getByText(/start creating today/i)).toBeInTheDocument();
  });

  it('does NOT render authenticated sections (My Legacies, Recently Viewed)', () => {
    renderPage();
    expect(screen.queryByText(/my legacies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recently viewed/i)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/PublicHomePage.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Extract from current `Homepage.tsx`: the hero section (lines 70-105), explore legacies section (lines 226-356 but **without** the auth-gated visibility filter), CTA section (lines 358-378), and Footer. Remove all `{user && ...}` blocks and the `useLegacies` hook call.

```tsx
// src/pages/PublicHomePage.tsx
import { ArrowRight, BookHeart, Sparkles, Loader2, Users, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/Footer';
import { useExploreLegacies } from '@/features/legacy/hooks/useLegacies';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { SEOHead, getOrganizationSchema } from '@/components/seo';
import { HeaderSlot } from '@/components/header';
import ThemeSelector from '@/components/ThemeSelector';
import { useTheme } from '@/lib/hooks/useTheme';
import { useAuthModal } from '@/lib/hooks/useAuthModal';

export default function PublicHomePage() {
  const navigate = useNavigate();
  const { currentTheme, setTheme } = useTheme();
  const openAuthModal = useAuthModal((s) => s.open);
  const { data: exploreLegacies, isLoading: exploreLoading } = useExploreLegacies(20);

  const contextLabels: Record<string, string> = {
    'memorial': 'In Memoriam',
    'living-tribute': 'Living Tribute',
  };

  const contextColors: Record<string, string> = {
    'memorial': 'bg-amber-100 text-amber-800 border-amber-200',
    'living-tribute': 'bg-purple-100 text-purple-800 border-purple-200',
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead
        title="Honoring Lives Through Shared Stories"
        description="Create meaningful digital tributes for memorials, retirements, graduations, and living legacies. Preserve memories, share stories, and celebrate what makes each person special."
        path="/"
        ogType="website"
        structuredData={getOrganizationSchema()}
      />
      <HeaderSlot>
        <ThemeSelector currentTheme={currentTheme} onThemeChange={setTheme} />
      </HeaderSlot>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
            <Sparkles className="size-4 text-theme-primary" />
            <span className="text-sm text-theme-primary-dark">Digital tributes powered by AI</span>
          </div>
          <h1 className="text-neutral-900">Honor the lives and milestones that matter most</h1>
          <p className="text-neutral-600">
            Create meaningful digital tributes for memorials, retirements, graduations, and living legacies.
            Preserve memories, share stories, and celebrate what makes each person special.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Button
              size="lg"
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
              onClick={openAuthModal}
            >
              Create a Legacy
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => document.getElementById('explore-legacies')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See Examples
            </Button>
          </div>
        </div>
      </section>

      {/* Explore Legacies */}
      <section id="explore-legacies" className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-8">
            <h2 className="text-neutral-900">Explore Legacies</h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              See how people are creating meaningful tributes for every occasion
            </p>
          </div>

          {exploreLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-theme-primary" />
            </div>
          )}

          {!exploreLoading && exploreLegacies && exploreLegacies.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {exploreLegacies.map((legacy) => {
                const dates = formatLegacyDates(legacy);
                const context = getLegacyContext(legacy);
                const memberCount = legacy.members?.length || 0;

                return (
                  <Card
                    key={legacy.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => navigate(`/legacy/${legacy.id}`)}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
                      {legacy.profile_image_url ? (
                        <img
                          src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                          alt={legacy.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Users className="size-12 text-neutral-300" />
                      )}
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <h3 className="text-neutral-900">{legacy.name}</h3>
                          {dates && <p className="text-sm text-neutral-500">{dates}</p>}
                        </div>
                        <Badge variant="outline" className={contextColors[context] || 'bg-neutral-100 text-neutral-800'}>
                          {contextLabels[context] || context}
                        </Badge>
                      </div>
                      {legacy.biography && (
                        <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
                      )}
                      <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                        <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                        <span className="flex items-center gap-1">
                          <Globe className="size-3" /> Public
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {!exploreLoading && (!exploreLegacies || exploreLegacies.length === 0) && (
            <div className="text-center py-12">
              <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-600">No legacies to explore yet.</p>
              <p className="text-sm text-neutral-500 mt-1">Be the first to create a legacy!</p>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <Card className="bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to border border-theme-accent p-12 text-center">
            <div className="space-y-6">
              <h2 className="text-neutral-900">Start creating today</h2>
              <p className="text-neutral-600 max-w-xl mx-auto">
                Whether you&apos;re honoring a loved one, celebrating a milestone, or preserving memories for the future, Mosaic Life helps you tell the story that matters.
              </p>
              <Button size="lg" className="gap-2" onClick={openAuthModal}>
                Create Your First Legacy
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/PublicHomePage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/pages/PublicHomePage.tsx apps/web/src/pages/PublicHomePage.test.tsx
git commit -m "feat(homepage): extract PublicHomePage from Homepage"
```

---

## Task 4: DashboardPage — Authenticated Home

**Files:**
- Create: `src/pages/DashboardPage.tsx`
- Test: `src/pages/DashboardPage.test.tsx`

Composes existing section components with the new ContextualGreeting. Reuses My Legacies section from Homepage.tsx (lines 116-212).

**Step 1: Write the test**

```tsx
// src/pages/DashboardPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: null, isLoading: false }),
  useSocialFeed: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useMyFavorites: () => ({ data: null, isLoading: false }),
}));

import DashboardPage from './DashboardPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardPage', () => {
  it('renders the contextual greeting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T10:00:00'));
    renderPage();
    expect(screen.getByText(/good morning, joe/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders My Legacies section', () => {
    renderPage();
    expect(screen.getByText(/my legacies/i)).toBeInTheDocument();
  });

  it('does NOT render hero or CTA sections', () => {
    renderPage();
    expect(screen.queryByText(/honor the lives and milestones/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/start creating today/i)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/pages/DashboardPage.tsx
import { Plus, Loader2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/Footer';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import RecentActivitySection from '@/features/activity/components/RecentActivitySection';
import RecentlyViewedSection from '@/features/activity/components/RecentlyViewedSection';
import FavoritesSection from '@/features/favorites/components/FavoritesSection';
import ContextualGreeting from '@/components/dashboard/ContextualGreeting';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: myLegacies, isLoading: myLegaciesLoading } = useLegacies({ enabled: true });

  const contextLabels: Record<string, string> = {
    'memorial': 'In Memoriam',
    'living-tribute': 'Living Tribute',
  };

  const contextColors: Record<string, string> = {
    'memorial': 'bg-amber-100 text-amber-800 border-amber-200',
    'living-tribute': 'bg-purple-100 text-purple-800 border-purple-200',
  };

  return (
    <div className="min-h-screen flex flex-col">
      <ContextualGreeting />

      <RecentlyViewedSection
        entityType="legacy"
        title="Recently Viewed Legacies"
        description="Legacies you've visited recently"
      />

      {/* My Legacies */}
      <section className="bg-neutral-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <h2 className="text-neutral-900">My Legacies</h2>
              <p className="text-neutral-600">The tributes you've created and manage</p>
            </div>
            <Button
              onClick={() => navigate('/legacy/new')}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <Plus className="size-4" />
              Create New
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myLegaciesLoading && (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-theme-primary" />
              </div>
            )}

            {!myLegaciesLoading && myLegacies?.slice(0, 2).map((legacy) => {
              const dates = formatLegacyDates(legacy);
              const context = getLegacyContext(legacy);
              const memberCount = legacy.members?.length || 0;

              return (
                <Card
                  key={legacy.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => navigate(`/legacy/${legacy.id}`)}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
                    {legacy.profile_image_url ? (
                      <img
                        src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                        alt={legacy.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="size-12 text-neutral-300" />
                    )}
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <h3 className="text-neutral-900">{legacy.name}</h3>
                        {dates && <p className="text-sm text-neutral-500">{dates}</p>}
                      </div>
                      <Badge variant="outline" className={contextColors[context] || 'bg-neutral-100 text-neutral-800'}>
                        {contextLabels[context] || context}
                      </Badge>
                    </div>
                    {legacy.biography && (
                      <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
                    )}
                    <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                      <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Create New Card */}
            <Card
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border-2 border-dashed border-neutral-300 hover:border-theme-primary bg-neutral-50 hover:bg-white"
              onClick={() => navigate('/legacy/new')}
            >
              <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to">
                <div className="text-center space-y-3">
                  <div className="size-16 rounded-full bg-white/80 flex items-center justify-center mx-auto">
                    <Plus className="size-8 text-theme-primary" />
                  </div>
                  <p className="text-neutral-700">Create New Legacy</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <h3 className="text-neutral-900 text-center">Start a New Tribute</h3>
                <p className="text-sm text-neutral-600 text-center">
                  Honor someone special with a digital legacy
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <RecentlyViewedSection
        entityType="story"
        title="Recently Viewed Stories"
        description="Stories you've read recently"
      />

      <RecentActivitySection />

      <FavoritesSection />

      <Footer />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx apps/web/src/pages/DashboardPage.test.tsx
git commit -m "feat(dashboard): add DashboardPage with greeting and personal sections"
```

---

## Task 5: Placeholder Pages — Stories and Conversations

**Files:**
- Create: `src/pages/StoriesPage.tsx`
- Create: `src/pages/ConversationsPage.tsx`
- Test: `src/pages/PlaceholderPages.test.tsx`

**Step 1: Write the test**

```tsx
// src/pages/PlaceholderPages.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoriesPage from './StoriesPage';
import ConversationsPage from './ConversationsPage';

describe('StoriesPage', () => {
  it('renders the placeholder heading and description', () => {
    render(<MemoryRouter><StoriesPage /></MemoryRouter>);
    expect(screen.getByText('Stories')).toBeInTheDocument();
    expect(screen.getByText(/browse and manage your stories/i)).toBeInTheDocument();
  });

  it('renders a link back to home', () => {
    render(<MemoryRouter><StoriesPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
  });
});

describe('ConversationsPage', () => {
  it('renders the placeholder heading and description', () => {
    render(<MemoryRouter><ConversationsPage /></MemoryRouter>);
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText(/ai conversations and story evolution/i)).toBeInTheDocument();
  });

  it('renders a link back to home', () => {
    render(<MemoryRouter><ConversationsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/PlaceholderPages.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementations**

```tsx
// src/pages/StoriesPage.tsx
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '@/components/Footer';

export default function StoriesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <BookOpen className="size-16 mx-auto text-neutral-300" />
          <h1 className="text-2xl font-bold text-neutral-900">Stories</h1>
          <p className="text-neutral-600 max-w-md">
            Browse and manage your stories across all legacies. Coming soon.
          </p>
          <Link
            to="/"
            className="inline-block text-sm text-theme-primary hover:underline"
          >
            Go to Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
```

```tsx
// src/pages/ConversationsPage.tsx
import { MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '@/components/Footer';

export default function ConversationsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <MessageCircle className="size-16 mx-auto text-neutral-300" />
          <h1 className="text-2xl font-bold text-neutral-900">Conversations</h1>
          <p className="text-neutral-600 max-w-md">
            Your AI conversations and story evolution sessions. Coming soon.
          </p>
          <Link
            to="/"
            className="inline-block text-sm text-theme-primary hover:underline"
          >
            Go to Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/PlaceholderPages.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/pages/StoriesPage.tsx apps/web/src/pages/ConversationsPage.tsx apps/web/src/pages/PlaceholderPages.test.tsx
git commit -m "feat(pages): add Stories and Conversations placeholder pages"
```

---

## Task 6: LegaciesPage — My Legacies + Explore

**Files:**
- Create: `src/pages/LegaciesPage.tsx`
- Test: `src/pages/LegaciesPage.test.tsx`

This page absorbs the Explore Legacies section from the homepage and pairs it with the full My Legacies list.

**Step 1: Write the test**

```tsx
// src/pages/LegaciesPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: [], isLoading: false }),
  useExploreLegacies: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

import LegaciesPage from './LegaciesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegaciesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LegaciesPage', () => {
  it('renders My Legacies section', () => {
    renderPage();
    expect(screen.getByText(/my legacies/i)).toBeInTheDocument();
  });

  it('renders Explore Legacies section', () => {
    renderPage();
    expect(screen.getByText(/explore legacies/i)).toBeInTheDocument();
  });

  it('renders visibility filter buttons', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /public/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /private/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/LegaciesPage.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

The LegaciesPage combines the full My Legacies list (no `slice(0, 2)` limit) plus the Explore Legacies section with visibility filter. Extract and reuse patterns from `Homepage.tsx`.

```tsx
// src/pages/LegaciesPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Users, BookHeart, Globe, Lock } from 'lucide-react';
import type { VisibilityFilter } from '@/features/legacy/api/legacies';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/Footer';
import { useLegacies, useExploreLegacies } from '@/features/legacy/hooks/useLegacies';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';

export default function LegaciesPage() {
  const navigate = useNavigate();
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const { data: myLegacies, isLoading: myLegaciesLoading } = useLegacies({ enabled: true });
  const { data: exploreLegacies, isLoading: exploreLoading } = useExploreLegacies(20, visibilityFilter);

  const exploreLegacyIds = exploreLegacies?.map((l) => l.id) ?? [];
  const { data: legacyFavoriteData } = useFavoriteCheck('legacy', exploreLegacyIds);

  const contextLabels: Record<string, string> = {
    'memorial': 'In Memoriam',
    'living-tribute': 'Living Tribute',
  };

  const contextColors: Record<string, string> = {
    'memorial': 'bg-amber-100 text-amber-800 border-amber-200',
    'living-tribute': 'bg-purple-100 text-purple-800 border-purple-200',
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* My Legacies */}
      <section className="bg-neutral-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-neutral-900">My Legacies</h1>
              <p className="text-neutral-600">The tributes you've created and manage</p>
            </div>
            <Button
              onClick={() => navigate('/legacy/new')}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <Plus className="size-4" />
              Create New
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myLegaciesLoading && (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-theme-primary" />
              </div>
            )}

            {!myLegaciesLoading && myLegacies?.map((legacy) => {
              const dates = formatLegacyDates(legacy);
              const context = getLegacyContext(legacy);
              const memberCount = legacy.members?.length || 0;

              return (
                <Card
                  key={legacy.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => navigate(`/legacy/${legacy.id}`)}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
                    {legacy.profile_image_url ? (
                      <img
                        src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                        alt={legacy.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="size-12 text-neutral-300" />
                    )}
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <h3 className="text-neutral-900">{legacy.name}</h3>
                        {dates && <p className="text-sm text-neutral-500">{dates}</p>}
                      </div>
                      <Badge variant="outline" className={contextColors[context] || 'bg-neutral-100 text-neutral-800'}>
                        {contextLabels[context] || context}
                      </Badge>
                    </div>
                    {legacy.biography && (
                      <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
                    )}
                    <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                      <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Create New Card */}
            <Card
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border-2 border-dashed border-neutral-300 hover:border-theme-primary bg-neutral-50 hover:bg-white"
              onClick={() => navigate('/legacy/new')}
            >
              <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to">
                <div className="text-center space-y-3">
                  <div className="size-16 rounded-full bg-white/80 flex items-center justify-center mx-auto">
                    <Plus className="size-8 text-theme-primary" />
                  </div>
                  <p className="text-neutral-700">Create New Legacy</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <h3 className="text-neutral-900 text-center">Start a New Tribute</h3>
                <p className="text-sm text-neutral-600 text-center">Honor someone special with a digital legacy</p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Explore Legacies */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-8">
            <h2 className="text-neutral-900">Explore Legacies</h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              Discover public tributes and see how others are celebrating lives
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            <button
              onClick={() => setVisibilityFilter('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                visibilityFilter === 'all'
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setVisibilityFilter('public')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                visibilityFilter === 'public'
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              <Globe className="size-4" />
              Public
            </button>
            <button
              onClick={() => setVisibilityFilter('private')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                visibilityFilter === 'private'
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              <Lock className="size-4" />
              Private
            </button>
          </div>

          {exploreLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-theme-primary" />
            </div>
          )}

          {!exploreLoading && exploreLegacies && exploreLegacies.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {exploreLegacies.map((legacy) => {
                const dates = formatLegacyDates(legacy);
                const context = getLegacyContext(legacy);
                const memberCount = legacy.members?.length || 0;

                return (
                  <Card
                    key={legacy.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => navigate(`/legacy/${legacy.id}`)}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
                      {legacy.profile_image_url ? (
                        <img
                          src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                          alt={legacy.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Users className="size-12 text-neutral-300" />
                      )}
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <h3 className="text-neutral-900">{legacy.name}</h3>
                          {dates && <p className="text-sm text-neutral-500">{dates}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <FavoriteButton
                            entityType="legacy"
                            entityId={legacy.id}
                            isFavorited={legacyFavoriteData?.favorites[legacy.id] ?? false}
                            favoriteCount={legacy.favorite_count ?? 0}
                          />
                          <Badge variant="outline" className={contextColors[context] || 'bg-neutral-100 text-neutral-800'}>
                            {contextLabels[context] || context}
                          </Badge>
                        </div>
                      </div>
                      {legacy.biography && (
                        <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
                      )}
                      <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
                        <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                        <span className="flex items-center gap-1">
                          {legacy.visibility === 'public' ? (
                            <><Globe className="size-3" /> Public</>
                          ) : (
                            <><Lock className="size-3" /> Private</>
                          )}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {!exploreLoading && (!exploreLegacies || exploreLegacies.length === 0) && (
            <div className="text-center py-12">
              <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-600">No legacies to explore yet.</p>
              <p className="text-sm text-neutral-500 mt-1">Be the first to create a legacy!</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/pages/LegaciesPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/pages/LegaciesPage.tsx apps/web/src/pages/LegaciesPage.test.tsx
git commit -m "feat(legacies): add LegaciesPage with My Legacies and Explore sections"
```

---

## Task 7: NavLinks Component — Desktop Header Navigation

**Files:**
- Create: `src/components/header/NavLinks.tsx`
- Test: `src/components/header/NavLinks.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/header/NavLinks.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavLinks from './NavLinks';

describe('NavLinks', () => {
  it('renders all 5 navigation links', () => {
    render(<MemoryRouter><NavLinks /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conversations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
  });

  it('links point to correct routes', () => {
    render(<MemoryRouter><NavLinks /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /legacies/i })).toHaveAttribute('href', '/legacies');
    expect(screen.getByRole('link', { name: /stories/i })).toHaveAttribute('href', '/stories');
    expect(screen.getByRole('link', { name: /conversations/i })).toHaveAttribute('href', '/conversations');
    expect(screen.getByRole('link', { name: /community/i })).toHaveAttribute('href', '/community');
  });

  it('marks the active route', () => {
    render(
      <MemoryRouter initialEntries={['/legacies']}>
        <NavLinks />
      </MemoryRouter>
    );
    const legaciesLink = screen.getByRole('link', { name: /legacies/i });
    expect(legaciesLink.className).toContain('text-theme-primary');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/header/NavLinks.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/header/NavLinks.tsx
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/navigation';

export default function NavLinks() {
  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'text-theme-primary bg-theme-accent-light'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/header/NavLinks.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/header/NavLinks.tsx apps/web/src/components/header/NavLinks.test.tsx
git commit -m "feat(nav): add NavLinks component for authenticated header"
```

---

## Task 8: BottomTabBar Component — Mobile Navigation

**Files:**
- Create: `src/components/navigation/BottomTabBar.tsx`
- Test: `src/components/navigation/BottomTabBar.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/navigation/BottomTabBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';

describe('BottomTabBar', () => {
  it('renders all 5 tab links', () => {
    render(<MemoryRouter><BottomTabBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conversations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
  });

  it('links point to correct routes', () => {
    render(<MemoryRouter><BottomTabBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /legacies/i })).toHaveAttribute('href', '/legacies');
  });

  it('marks the active tab', () => {
    render(
      <MemoryRouter initialEntries={['/stories']}>
        <BottomTabBar />
      </MemoryRouter>
    );
    const storiesLink = screen.getByRole('link', { name: /stories/i });
    expect(storiesLink.className).toContain('text-theme-primary');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/navigation/BottomTabBar.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/navigation/BottomTabBar.tsx
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/navigation';

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 md:hidden">
      <div className="flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors ${
                  isActive
                    ? 'text-theme-primary'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`
              }
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/navigation/BottomTabBar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/navigation/BottomTabBar.tsx apps/web/src/components/navigation/BottomTabBar.test.tsx
git commit -m "feat(nav): add BottomTabBar component for mobile navigation"
```

---

## Task 9: Update AppHeader — Auth-Aware Navigation

**Files:**
- Modify: `src/components/header/AppHeader.tsx`
- Modify: `src/components/header/AppHeader.test.tsx`

**Step 1: Update the test**

Add tests for the new nav behavior. The existing tests should still pass.

```tsx
// Add to AppHeader.test.tsx — new describe block

describe('AppHeader navigation', () => {
  it('shows navigation links when logged in (desktop)', () => {
    mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' };
    renderWithProviders(<AppHeader />);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conversations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
  });

  it('does NOT show navigation links when logged out', () => {
    mockUser = null;
    renderWithProviders(<AppHeader />);
    expect(screen.queryByRole('link', { name: /legacies/i })).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/header/AppHeader.test.tsx`
Expected: FAIL — navigation links not found (existing header doesn't render them)

**Step 3: Modify AppHeader**

In `src/components/header/AppHeader.tsx`, replace the center section. When the user is logged in AND on desktop, render `NavLinks` instead of the slot content. On mobile, hide NavLinks (the BottomTabBar handles it). The slot content continues to work as before for unauthenticated users.

Updated `AppHeader.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/components/ui/use-mobile';
import { useHeaderContext } from './HeaderContext';
import HeaderLogo from './HeaderLogo';
import HeaderUserMenu from './HeaderUserMenu';
import HeaderOverflowMenu from './HeaderOverflowMenu';
import NavLinks from './NavLinks';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/lib/hooks/useAuthModal';

export default function AppHeader() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { slotContent } = useHeaderContext();
  const { user } = useAuth();
  const openAuthModal = useAuthModal((s) => s.open);

  const userInfo = user ? { name: user.name || user.email, email: user.email, avatarUrl: user.avatar_url } : null;

  return (
    <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: Logo */}
        <HeaderLogo onNavigateHome={() => navigate('/')} />

        {/* Center: Nav links (authenticated desktop) or Slot content (public) */}
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

        {/* Right: Auth */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {userInfo ? (
            <HeaderUserMenu user={userInfo} />
          ) : (
            <Button onClick={openAuthModal} size="sm">
              Sign In
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/header/AppHeader.test.tsx`
Expected: PASS (all existing + new tests)

**Step 5: Commit**

```bash
git add apps/web/src/components/header/AppHeader.tsx apps/web/src/components/header/AppHeader.test.tsx
git commit -m "feat(header): add inline navigation for authenticated users"
```

---

## Task 10: Update Routes and RootLayout — Wire Everything Together

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/RootLayout.tsx`

This is the integration task. We create the `AuthAwareHome` wrapper, add new routes, add the BottomTabBar to the layout, and delete the old `Homepage.tsx`.

**Step 1: Update routes/index.tsx**

Add lazy imports for new pages. Replace the index route with `AuthAwareHome`. Add `/legacies`, `/stories`, `/conversations` routes.

Changes to `src/routes/index.tsx`:

```tsx
// Add new lazy imports (after existing ones around line 20):
const PublicHomePage = lazy(() => import('@/pages/PublicHomePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LegaciesPage = lazy(() => import('@/pages/LegaciesPage'));
const StoriesPage = lazy(() => import('@/pages/StoriesPage'));
const ConversationsPage = lazy(() => import('@/pages/ConversationsPage'));

// Add AuthAwareHome component (after LazyPage, around line 42):
import { useAuth } from '@/contexts/AuthContext';

function AuthAwareHome() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  return user ? <DashboardPage /> : <PublicHomePage />;
}
```

Replace the index route (line 64-67):
```tsx
{
  index: true,
  element: <LazyPage><AuthAwareHome /></LazyPage>,
},
```

Add new routes (after the community route, around line 79):
```tsx
// Authenticated navigation pages
{
  path: 'legacies',
  element: (
    <ProtectedRoute>
      <LazyPage><LegaciesPage /></LazyPage>
    </ProtectedRoute>
  ),
},
{
  path: 'stories',
  element: (
    <ProtectedRoute>
      <LazyPage><StoriesPage /></LazyPage>
    </ProtectedRoute>
  ),
},
{
  path: 'conversations',
  element: (
    <ProtectedRoute>
      <LazyPage><ConversationsPage /></LazyPage>
    </ProtectedRoute>
  ),
},
```

**Step 2: Update RootLayout.tsx**

Add the `BottomTabBar` to the layout, rendered only for authenticated users. Add bottom padding on mobile to prevent content overlap.

Changes to `src/routes/RootLayout.tsx`:

```tsx
// Add import at top:
import BottomTabBar from '@/components/navigation/BottomTabBar';

// In the JSX, after <Outlet /> and before </HeaderProvider>, add:
{user && <BottomTabBar />}

// Add bottom padding to the main content area for mobile when authenticated.
// Wrap the <Outlet /> in a div:
<div className={user ? 'pb-16 md:pb-0' : ''}>
  <Outlet />
</div>
```

**Step 3: Delete old Homepage.tsx**

```bash
git rm apps/web/src/pages/Homepage.tsx
```

The old `Homepage` import in `index.tsx` should also be removed (line 8).

**Step 4: Run all tests**

Run: `cd apps/web && npx vitest run`
Expected: All tests PASS. If the old `App.test.tsx` imports Homepage, update its mocks.

**Step 5: Manual verification**

```bash
cd apps/web && npm run build
```
Expected: Build succeeds with no TypeScript or import errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(routing): wire auth-aware homepage, new pages, and navigation"
```

---

## Task 11: Cleanup — Remove My Legacies from HeaderUserMenu

**Files:**
- Modify: `src/components/header/HeaderUserMenu.tsx`
- Modify: `src/components/header/HeaderUserMenu.test.tsx`

Now that "Legacies" is in the main navigation bar, the "My Legacies" link in the user dropdown menu is redundant. Remove it.

**Step 1: Update the test**

In `HeaderUserMenu.test.tsx`, update or remove any test that expects "My Legacies" in the dropdown. The test should verify it's NOT there.

**Step 2: Modify HeaderUserMenu.tsx**

Remove the "My Legacies" menu item (the one with `BookOpen` icon that navigates to `/my-legacies`).

**Step 3: Run tests**

Run: `cd apps/web && npx vitest run src/components/header/HeaderUserMenu.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/header/HeaderUserMenu.tsx apps/web/src/components/header/HeaderUserMenu.test.tsx
git commit -m "refactor(header): remove redundant My Legacies from user menu"
```

---

## Task 12: Final Verification

**Step 1: Run full test suite**

```bash
cd apps/web && npx vitest run
```
Expected: All tests PASS

**Step 2: Build check**

```bash
cd apps/web && npm run build
```
Expected: Build succeeds with no errors

**Step 3: Lint check**

```bash
cd apps/web && npm run lint
```
Expected: No lint errors

**Step 4: Manual smoke test (if dev server available)**

```bash
cd apps/web && npm run dev
```

Verify:
- Visit `/` logged out → sees PublicHomePage (hero, explore, CTA)
- Visit `/` logged in → sees DashboardPage (greeting, personal sections)
- Header shows nav links when logged in (desktop)
- Bottom tab bar appears on mobile when logged in
- `/legacies` shows My Legacies + Explore
- `/stories` shows placeholder
- `/conversations` shows placeholder
- `/community` still works
- Nav links highlight active route

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
