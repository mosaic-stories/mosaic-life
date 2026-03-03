# PageActionBar — Post-Review Cleanup Plan

> **Status: ✅ COMPLETED** — 2026-03-03. All 5 tasks implemented and verified. `pnpm test` (204/204 pass), `npx tsc --noEmit` (0 errors), `just validate-frontend` (ESLint + TypeScript pass).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve all issues identified in the post-implementation code review of the PageActionBar changeset (`f898744..2ed266c`) before pushing to the remote. Issues range from a high-priority orphaned file through UX inconsistencies, a broken URL edge case, an auth guard gap, and missing accessibility attributes.

**Prerequisite:** The PageActionBar component and its initial rollout are already committed. This plan is purely corrective; no new APIs or schemas are required.

**Tech Stack:** React 18, TypeScript (strict), React Router v6, Tailwind CSS, Lucide icons, Vitest + React Testing Library

**Acceptance Criteria (must all pass before pushing):**
- `cd apps/web && pnpm test` — all Vitest unit tests pass
- `cd apps/web && npx tsc --noEmit` — zero TypeScript errors
- `just validate-frontend` — ESLint + TypeScript both pass
- No remaining `HeaderSlot` usage on detail/edit/creation pages
- No remaining import of `LegacyHeaderControls` anywhere in the codebase
- `LegacyHeaderControls.tsx` is deleted and untracked

---

## Task 1: Delete orphaned `LegacyHeaderControls.tsx` 🔴 HIGH

**Why:** After its logic was inlined into `LegacyProfile.tsx`, the file was never deleted. It has no importers, will confuse future developers, and pollutes IDE symbol search.

**Files:**
- Delete: `apps/web/src/features/legacy/components/LegacyHeaderControls.tsx`

**Steps:**
1. Confirm no remaining imports anywhere: `grep -r "LegacyHeaderControls" apps/web/src/` should yield zero results after deletion.
2. Delete the file: `rm apps/web/src/features/legacy/components/LegacyHeaderControls.tsx`
3. Stage the deletion: `git rm apps/web/src/features/legacy/components/LegacyHeaderControls.tsx`

**Verification:**
- `grep -r "LegacyHeaderControls" apps/web/src/` returns no matches
- `npx tsc --noEmit` still passes

---

## Task 2: Guard optional `storyId` in `StoryEvolutionWorkspace` back link 🟠 MEDIUM

**Why:** `storyId` is typed `storyId?: string`. When `undefined`, the current template literal renders `backTo="/legacy/xyz/story/undefined"` — a broken URL baked into the DOM even before user interaction.

**Files:**
- Modify: `apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx`

**Change:** Both `PageActionBar` usages (error state render at ~line 205 and main render at ~line 310) must guard `storyId`:

```tsx
// Before
<PageActionBar backLabel="Back to story" backTo={`/legacy/${legacyId}/story/${storyId}`} />

// After — if storyId is undefined, fall back to the legacy page
<PageActionBar backLabel="Back to story" backTo={storyId ? `/legacy/${legacyId}/story/${storyId}` : `/legacy/${legacyId}`} />
```

Apply the same fix to **both** `PageActionBar` placements in the file (one in the loading/error early-return render path, one in the main render).

**Verification:**
- `npx tsc --noEmit` passes
- Manually trace: when `storyId` is `undefined`, `backTo` resolves to `/legacy/${legacyId}` not `/legacy/${legacyId}/story/undefined`

---

## Task 3: Extend `PageActionBar` to support `onBack` callback + add no-children test 🟢 INFO → ENABLER

**Why:** `LegacyCreation.tsx` currently calls `navigate(-1)` — a browser-history back that has no fixed URL target. Since `PageActionBar` uses `<Link to={backTo}>`, a static URL must be chosen. Rather than hardcoding `/legacies`, extend the component to optionally accept an `onBack` callback; when provided, it renders a `<button>` instead of `<Link>`. This is required for Task 4 (LegacyCreation migration).

**Files:**
- Modify: `apps/web/src/components/PageActionBar.tsx`
- Modify: `apps/web/src/components/PageActionBar.test.tsx`

**Step 1: Update the component interface and implementation**

```tsx
// apps/web/src/components/PageActionBar.tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageActionBarProps {
  backLabel: string;
  /** Provide backTo for a link, or onBack for a button (e.g. navigate(-1)). */
  backTo?: string;
  onBack?: () => void;
  children?: React.ReactNode;
}

export default function PageActionBar({ backLabel, backTo, onBack, children }: PageActionBarProps) {
  const backContent = (
    <>
      <ArrowLeft className="size-4 shrink-0" />
      <span className="truncate">{backLabel}</span>
    </>
  );

  const backElement = backTo ? (
    <Link
      to={backTo}
      className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
    >
      {backContent}
    </Link>
  ) : (
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
    >
      {backContent}
    </button>
  );

  return (
    <div className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        {backElement}
        {children && (
          <div className="flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Extend the test file**

Add three new test cases to `PageActionBar.test.tsx`:

```tsx
it('renders a button when onBack is provided instead of backTo', () => {
  const handleBack = vi.fn();
  render(
    <MemoryRouter>
      <PageActionBar backLabel="Back" onBack={handleBack}>
        <button>Action</button>
      </PageActionBar>
    </MemoryRouter>
  );
  // Should be a button, not a link
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  const btn = screen.getByRole('button', { name: /back/i });
  expect(btn).toBeInTheDocument();
});

it('calls onBack when the back button is clicked', async () => {
  const handleBack = vi.fn();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <PageActionBar backLabel="Back" onBack={handleBack} />
    </MemoryRouter>
  );
  await user.click(screen.getByRole('button', { name: /back/i }));
  expect(handleBack).toHaveBeenCalledOnce();
});

it('renders without children (no right-side container)', () => {
  render(
    <MemoryRouter>
      <PageActionBar backLabel="Home" backTo="/" />
    </MemoryRouter>
  );
  // Only the back link, no extra wrapper div
  expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

Add the `userEvent` import at the top of the test file:
```tsx
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
```

**Verification:**
- `pnpm test` passes all `PageActionBar` tests (now 6 total)
- `npx tsc --noEmit` passes

---

## Task 4: Migrate `LegacyCreation`, `LegacyEdit`, `MediaGallery` to `PageActionBar` 🟠 MEDIUM

**Why:** These three components still use `HeaderSlot`, creating an inconsistent back-navigation pattern compared to the already-migrated pages.

### 4a — `LegacyCreation.tsx`

**Files:** `apps/web/src/features/legacy/components/LegacyCreation.tsx`

- Remove `ArrowLeft` from the `lucide-react` import (it will now come from `PageActionBar` internally).
- Remove `import { HeaderSlot } from '@/components/header';`
- Add `import PageActionBar from '@/components/PageActionBar';`
- Replace the `<HeaderSlot>` block with:

```tsx
<PageActionBar backLabel="Legacies" onBack={() => navigate(-1)} />
```

No children needed — `LegacyCreation` has no page-level action buttons in the bar.

### 4b — `LegacyEdit.tsx`

**Files:** `apps/web/src/features/legacy/components/LegacyEdit.tsx`

- Remove `ArrowLeft` from the `lucide-react` import.
- Remove `import { HeaderSlot } from '@/components/header';`
- Add `import PageActionBar from '@/components/PageActionBar';`
- Replace the `<HeaderSlot>` block with:

```tsx
<PageActionBar backLabel={legacy.name} backTo={`/legacy/${legacyId}`} />
```

`legacy` is guaranteed non-null at this render point (it falls into the error branch before if falsy).

### 4c — `MediaGallery.tsx`

**Files:** `apps/web/src/features/media/components/MediaGallery.tsx`

- Remove `ArrowLeft` from the `lucide-react` import.
- Remove the `useNavigate` hook and its import if no longer used elsewhere in the file (check first).
- Remove `import { HeaderSlot } from '@/components/header';`
- Add `import PageActionBar from '@/components/PageActionBar';`
- Replace the `<HeaderSlot>` block with:

```tsx
<PageActionBar backLabel={legacy.name} backTo={`/legacy/${legacyId}`}>
  <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
    <button
      onClick={() => setViewMode('grid')}
      className={`p-2 rounded transition-colors ${
        viewMode === 'grid'
          ? 'bg-white text-neutral-900 shadow-sm'
          : 'text-neutral-500 hover:text-neutral-900'
      }`}
      aria-label="Grid view"
    >
      <Grid3x3 className="size-4" />
    </button>
    <button
      onClick={() => setViewMode('list')}
      className={`p-2 rounded transition-colors ${
        viewMode === 'list'
          ? 'bg-white text-neutral-900 shadow-sm'
          : 'text-neutral-500 hover:text-neutral-900'
      }`}
      aria-label="List view"
    >
      <List className="size-4" />
    </button>
  </div>
  <Button size="sm" className="gap-2">
    <Plus className="size-4" />
    Upload
  </Button>
</PageActionBar>
```

Note: `aria-label` attributes are added to the view-mode toggle buttons here (free accessibility fix, same pattern as Task 5).

**Verification:**
- `grep -r "HeaderSlot" apps/web/src/features/` returns only `LegacyCreation.tsx`... wait, all should be migrated now. After this task, the only remaining `HeaderSlot` usages should be in:
  - `apps/web/src/components/header/HeaderContext.tsx` (definition)
  - `apps/web/src/components/header/HeaderContext.test.tsx` (tests of the mechanism itself)
  - `apps/web/src/components/header/index.ts` (export)
  - `apps/web/src/pages/PublicHomePage.test.tsx` (mock)
- `npx tsc --noEmit` passes

---

## Task 5: Gate "Add Story" button and add `aria-label` on icon-only buttons in `LegacyProfile` 🟡 LOW

**Why:**
- The `Add Story` button fires a `createStory` mutation (causes a 401) even for unauthenticated users.
- The Share button and `MoreVertical` trigger render icon-only with no accessible name (WCAG 2.1 SC 4.1.2 violation).

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`

**Changes:**

1. Wrap the `Add Story` button in `{authUser && ( ... )}` — same guard as the DropdownMenu above it.
2. Add `aria-label="Share"` to the Share button.
3. Add `aria-label="Legacy options"` to the `DropdownMenuTrigger` button.

```tsx
{/* Share button — was missing aria-label */}
<Button variant="ghost" size="sm" onClick={() => setShowMemberDrawer(true)} aria-label="Share">
  <Share2 className="size-4" />
</Button>

{authUser && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      {/* MoreVertical trigger — was missing aria-label */}
      <Button variant="ghost" size="sm" aria-label="Legacy options">
        <MoreVertical className="size-4" />
      </Button>
    </DropdownMenuTrigger>
    ...
  </DropdownMenu>
)}

{/* Add Story — now gated behind authUser */}
{authUser && (
  <Button size="sm" onClick={handleAddStory} disabled={createStory.isPending} className="bg-theme-primary hover:bg-theme-primary-dark">
    {createStory.isPending ? (
      <Loader2 className="size-4 mr-2 animate-spin" />
    ) : (
      <Plus className="size-4 mr-2" />
    )}
    <span className="hidden sm:inline">Add Story</span>
  </Button>
)}
```

**Verification:**
- `npx tsc --noEmit` passes
- Manually verify: sign out, visit a legacy page — "Add Story" button is no longer rendered

---

## Final Verification Checklist

Run all of the following before committing:

```bash
# From repo root
cd apps/web

# 1. TypeScript — zero errors
npx tsc --noEmit

# 2. Unit tests — all pass
pnpm test

# 3. Lint + typecheck via just
cd ../..
just validate-frontend

# 4. Confirm no dead code / import leaks
grep -r "LegacyHeaderControls" apps/web/src/   # should be empty
grep -r "HeaderSlot" apps/web/src/features/     # should be empty
grep -r "HeaderSlot" apps/web/src/components/MyLegacies.tsx  # should be empty
git status --short apps/web/src/features/legacy/components/LegacyHeaderControls.tsx  # should not exist
```

All six checks must pass before the cleanup commit is created.

---

## Suggested Commit Message

```
fix(ui): PageActionBar post-review cleanup

- Delete orphaned LegacyHeaderControls.tsx
- Guard optional storyId in StoryEvolutionWorkspace backTo URL
- Extend PageActionBar to support onBack callback (for history.back usage)
- Migrate LegacyCreation, LegacyEdit, MediaGallery from HeaderSlot to PageActionBar
- Gate Add Story button behind authUser in LegacyProfile
- Add aria-label to icon-only Share and options buttons
- Extend PageActionBar tests: onBack variant, no-children, callback invocation

Fixes: orphaned file, broken URL edge case, auth guard gap, a11y SC 4.1.2
Completes: full HeaderSlot → PageActionBar migration on detail/edit pages
```
