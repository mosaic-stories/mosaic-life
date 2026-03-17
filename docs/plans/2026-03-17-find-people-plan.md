# Find People — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated "Find People" search experience on the Connections page People tab and the Dashboard sidebar, supporting search by display name or username, respecting discoverability settings.

**Architecture:** One backend tweak (add username matching to existing `search_users`), one new reusable React component (`PeopleSearch` with `variant` prop), embedded in two existing pages. No new endpoints, schemas, or routes.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2.x / React 18 / TypeScript / TanStack Query v5 / shadcn/ui / Vitest

**Design doc:** [docs/plans/2026-03-17-find-people-design.md](2026-03-17-find-people-design.md)

---

## Implementation Status

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Backend — Add username matching to search | | |
| Task 2: Frontend — PeopleSearch component | | |
| Task 3: Integration — People tab & Dashboard sidebar | | |

---

## Task 1: Backend — Add Username Matching to User Search

**Files:**
- Modify: `services/core-api/app/services/user.py:17-88`
- Test: `services/core-api/tests/test_user_search.py`

**Step 1: Write failing tests for username search**

Add these test methods to the existing `TestUserSearchDiscoverability` class in `services/core-api/tests/test_user_search.py`:

```python
    async def test_search_by_username_finds_discoverable_user(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=True)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(
            db_session, "test-user-2", test_user.id
        )
        assert len(results) == 1
        assert results[0].username == test_user_2.username

    async def test_search_by_partial_username(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=True)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(
            db_session, "user-2-0002", test_user.id
        )
        assert len(results) == 1
        assert results[0].username == test_user_2.username

    async def test_search_strips_at_prefix(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=True)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(
            db_session, "@test-user-2", test_user.id
        )
        assert len(results) == 1
        assert results[0].username == test_user_2.username

    async def test_username_search_respects_discoverability(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=False)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(
            db_session, "test-user-2", test_user.id
        )
        assert len(results) == 0
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api && uv run pytest tests/test_user_search.py -v
```

Expected: The 4 new tests FAIL (username search returns 0 results since only `name` is matched).

**Step 3: Update search_users to match on username**

In `services/core-api/app/services/user.py`, make two changes:

1. After `if len(query) < 3:` block (line 35-36), add `@` prefix stripping:

```python
    # Strip leading @ for username searches
    search_query = query.lstrip("@")
    if len(search_query) < 3:
        return []

    search_pattern = f"%{search_query}%"
```

2. Replace the single `User.name.ilike(search_pattern)` filter (line 59) with an `or_` matching both name and username:

```python
            or_(
                User.name.ilike(search_pattern),
                User.username.ilike(search_pattern),
            ),
```

The full updated `where` clause becomes:

```python
        .where(
            or_(
                User.name.ilike(search_pattern),
                User.username.ilike(search_pattern),
            ),
            User.id != current_user_id,
            or_(
                ProfileSettings.discoverable == True,  # noqa: E712
                User.id.in_(shared_legacy_users),
            ),
        )
```

Also update the docstring to say `"""Search users by name or username, respecting discoverability settings."""`

**Step 4: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/test_user_search.py -v
```

Expected: All 7 tests PASS.

**Step 5: Validate backend**

```bash
cd services/core-api && just validate-backend
```

Expected: ruff + mypy pass.

**Step 6: Commit**

```bash
git add services/core-api/app/services/user.py services/core-api/tests/test_user_search.py
git commit -m "feat(search): add username matching to user search"
```

---

## Task 2: Frontend — PeopleSearch Component

**Files:**
- Create: `apps/web/src/features/user-search/components/PeopleSearch.tsx`
- Modify: `apps/web/src/features/user-search/index.ts`

**Step 1: Create the PeopleSearch component**

Create `apps/web/src/features/user-search/components/PeopleSearch.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useUserSearch } from '../hooks/useUserSearch';
import type { UserSearchResult } from '../api/userSearch';

interface PeopleSearchProps {
  variant: 'full' | 'compact';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ResultItem({
  user,
  onClick,
}: {
  user: UserSearchResult;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg hover:bg-neutral-50 transition-colors"
    >
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback className="text-xs">
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900 truncate">
          {user.name}
        </p>
        {user.username && (
          <p className="text-xs text-neutral-500 truncate">@{user.username}</p>
        )}
      </div>
    </button>
  );
}

export default function PeopleSearch({ variant }: PeopleSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Strip @ for the API call but keep it in the input
  const cleanQuery = query.replace(/^@/, '');
  const debouncedQuery = useDebounce(cleanQuery, 300);
  const { data: results, isLoading } = useUserSearch(debouncedQuery);

  const hasResults = results && results.length > 0;
  const showNoResults =
    debouncedQuery.length >= 3 && !isLoading && !hasResults;

  // Close compact dropdown on outside click
  useEffect(() => {
    if (variant !== 'compact') return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant]);

  // Open dropdown when results arrive (compact only)
  useEffect(() => {
    if (variant === 'compact' && (hasResults || showNoResults)) {
      setDropdownOpen(true);
    }
  }, [variant, hasResults, showNoResults]);

  const handleSelect = (user: UserSearchResult) => {
    if (user.username) {
      navigate(`/u/${user.username}`);
    }
    setQuery('');
    setDropdownOpen(false);
  };

  const resultsList = (
    <>
      {isLoading && debouncedQuery.length >= 3 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-theme-primary" />
        </div>
      )}
      {hasResults &&
        results.map((user) => (
          <ResultItem
            key={user.id}
            user={user}
            onClick={() => handleSelect(user)}
          />
        ))}
      {showNoResults && (
        <div className="py-4 text-center">
          <Users className="size-5 text-neutral-300 mx-auto mb-1" />
          <p className="text-xs text-neutral-500">No users found</p>
        </div>
      )}
    </>
  );

  // --- Full variant: results always visible below input ---
  if (variant === 'full') {
    return (
      <div className="space-y-2">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or @username..."
            className="pl-9"
          />
        </div>
        {(hasResults || showNoResults || (isLoading && debouncedQuery.length >= 3)) && (
          <div className="rounded-lg border bg-white divide-y divide-neutral-100">
            {resultsList}
          </div>
        )}
      </div>
    );
  }

  // --- Compact variant: dropdown overlay ---
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hasResults || showNoResults) setDropdownOpen(true);
          }}
          placeholder="Search by name or @username..."
          className="pl-9 h-9 text-sm"
        />
      </div>
      {dropdownOpen &&
        (hasResults || showNoResults || (isLoading && debouncedQuery.length >= 3)) && (
          <div className="absolute z-10 top-full mt-1 w-full rounded-lg border bg-white shadow-lg max-h-64 overflow-y-auto divide-y divide-neutral-100">
            {resultsList}
          </div>
        )}
    </div>
  );
}
```

**Step 2: Update barrel export**

In `apps/web/src/features/user-search/index.ts`, add:

```typescript
export { default as PeopleSearch } from './components/PeopleSearch';
```

**Step 3: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/src/features/user-search/components/PeopleSearch.tsx apps/web/src/features/user-search/index.ts
git commit -m "feat(frontend): add PeopleSearch component with full and compact variants"
```

---

## Task 3: Integration — People Tab & Dashboard Sidebar

**Files:**
- Modify: `apps/web/src/components/connections-hub/PeopleTabContent.tsx:1-54`
- Modify: `apps/web/src/pages/DashboardPage.tsx:1-98`

**Step 1: Add PeopleSearch to the People tab**

In `apps/web/src/components/connections-hub/PeopleTabContent.tsx`:

1. Add import at top:

```typescript
import PeopleSearch from '@/features/user-search/components/PeopleSearch';
```

2. Inside the returned `<div className="space-y-6">`, add the search as the first child (before the `<QuickFilters>` component):

```typescript
    <div className="space-y-6">
      <PeopleSearch variant="full" />

      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />
```

**Step 2: Add Find People card to Dashboard sidebar**

In `apps/web/src/pages/DashboardPage.tsx`:

1. Add imports at top:

```typescript
import { Users } from 'lucide-react';
import PeopleSearch from '@/features/user-search/components/PeopleSearch';
```

2. In the right sidebar section (`<div className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">`), add a "Find People" card after `<QuickActions />` and before `<SidebarActivity />`:

```typescript
            <QuickActions />

            {/* Find People */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-theme-primary" />
                <h3 className="text-sm font-medium text-neutral-900">Find People</h3>
              </div>
              <PeopleSearch variant="compact" />
            </Card>

            <SidebarActivity />
```

**Step 3: Run lint and type check**

```bash
cd apps/web && npx tsc --noEmit && npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/src/components/connections-hub/PeopleTabContent.tsx apps/web/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): integrate PeopleSearch into People tab and Dashboard sidebar"
```

---

## Validation Checklist

Before marking complete:

- [ ] Backend tests pass: `cd services/core-api && uv run pytest tests/test_user_search.py -v`
- [ ] Backend validation: `just validate-backend`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Frontend lint: `cd apps/web && npm run lint`
- [ ] Full backend suite: `cd services/core-api && uv run pytest -v`
