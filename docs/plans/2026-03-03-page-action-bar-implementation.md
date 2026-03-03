# PageActionBar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace HeaderSlot usage on detail pages with an inline PageActionBar component so page-specific actions (share, edit, delete, evolve, etc.) are visible for authenticated desktop users alongside the persistent NavLinks header.

**Architecture:** Create a reusable `PageActionBar` component that renders below the header within each page's body. Each detail page replaces its `<HeaderSlot>` usage with `<PageActionBar>`. The HeaderSlot mechanism remains in the codebase for unauthenticated pages but is no longer used by detail pages.

**Tech Stack:** React 18, TypeScript (strict), React Router v6, Tailwind CSS, Lucide icons, Vitest + React Testing Library

**Design doc:** `docs/plans/2026-03-03-page-action-bar-design.md`

---

## Task 1: PageActionBar Component

**Files:**
- Create: `src/components/PageActionBar.tsx`
- Test: `src/components/PageActionBar.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/PageActionBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PageActionBar from './PageActionBar';

describe('PageActionBar', () => {
  it('renders a back link with the given label', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Legacies" backTo="/legacies">
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /legacies/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/legacies');
  });

  it('renders children as actions on the right', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Home" backTo="/">
          <button>Share</button>
          <button>Delete</button>
        </PageActionBar>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('renders the back arrow icon', () => {
    render(
      <MemoryRouter>
        <PageActionBar backLabel="Stories" backTo="/stories">
          <button>Action</button>
        </PageActionBar>
      </MemoryRouter>
    );
    // The link should contain the ArrowLeft icon (rendered as svg)
    const link = screen.getByRole('link', { name: /stories/i });
    expect(link.querySelector('svg')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/PageActionBar.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/PageActionBar.tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageActionBarProps {
  backLabel: string;
  backTo: string;
  children?: React.ReactNode;
}

export default function PageActionBar({ backLabel, backTo, children }: PageActionBarProps) {
  return (
    <div className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <Link
          to={backTo}
          className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </Link>
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

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/PageActionBar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/PageActionBar.tsx apps/web/src/components/PageActionBar.test.tsx
git commit -m "feat(ui): add PageActionBar component for inline page actions"
```

---

## Task 2: Legacy Detail Page — Replace HeaderSlot with PageActionBar

**Files:**
- Modify: `src/features/legacy/components/LegacyProfile.tsx`

This task replaces the `<HeaderSlot><LegacyHeaderControls /></HeaderSlot>` block with `<PageActionBar>` containing the same action buttons inline.

**Step 1: Modify LegacyProfile.tsx**

Replace the HeaderSlot block (lines 171-180) with PageActionBar. The LegacyHeaderControls component is no longer needed as a wrapper — inline its buttons directly into PageActionBar children.

Changes:
1. Remove `import { HeaderSlot } from '@/components/header';`
2. Remove `import LegacyHeaderControls from './LegacyHeaderControls';`
3. Add `import PageActionBar from '@/components/PageActionBar';`
4. Add imports for the icons and dropdown components that were in LegacyHeaderControls: `Share2, MoreVertical, Pencil, Plus, Trash2` (Plus and Loader2 already imported; add Share2, MoreVertical, Pencil, Trash2)
5. Add dropdown imports: `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger` from `@/components/ui/dropdown-menu`

Replace lines 171-180:
```tsx
      <HeaderSlot>
        <LegacyHeaderControls
          legacyId={legacyId}
          user={user}
          onAddStory={handleAddStory}
          isCreatingStory={createStory.isPending}
          onDelete={() => setShowDeleteDialog(true)}
          onShare={() => setShowMemberDrawer(true)}
        />
      </HeaderSlot>
```

With:
```tsx
      <PageActionBar backLabel="Legacies" backTo="/legacies">
        <Button variant="ghost" size="sm" onClick={() => setShowMemberDrawer(true)}>
          <Share2 className="size-4" />
        </Button>
        {authUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/legacy/${legacyId}/edit`)}>
                <Pencil className="size-4" />
                Edit Legacy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="size-4" />
                Delete Legacy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button size="sm" onClick={handleAddStory} disabled={createStory.isPending} className="bg-theme-primary hover:bg-theme-primary-dark">
          {createStory.isPending ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Plus className="size-4 mr-2" />
          )}
          <span className="hidden sm:inline">Add Story</span>
        </Button>
      </PageActionBar>
```

**Step 2: Run tests to verify nothing is broken**

Run: `cd apps/web && npx vitest run`
Expected: PASS (no tests directly test LegacyProfile's header controls)

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "refactor(legacy): replace HeaderSlot with PageActionBar on legacy detail"
```

---

## Task 3: Story View Page — Replace StoryToolbar's HeaderSlot with PageActionBar

**Files:**
- Modify: `src/features/story/components/StoryToolbar.tsx`

StoryToolbar currently wraps everything in `<HeaderSlot>`. Replace it with `<PageActionBar>`, keeping the same props and action buttons.

**Step 1: Modify StoryToolbar.tsx**

Replace the entire component. Changes:
1. Remove `import { HeaderSlot } from '@/components/header';`
2. Add `import PageActionBar from '@/components/PageActionBar';`
3. Add a new prop `legacyId: string` so the back link can point to `/legacy/{legacyId}`
4. Replace `<HeaderSlot>` wrapper with `<PageActionBar backLabel={legacyName} backTo={/legacy/${legacyId}}>`
5. Remove the manual back button (PageActionBar handles it)

Updated component:

```tsx
// src/features/story/components/StoryToolbar.tsx
import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import PageActionBar from '@/components/PageActionBar';
import VersionHistoryButton from './VersionHistoryButton';

interface StoryToolbarProps {
  legacyId: string;
  legacyName: string;
  isEditMode: boolean;
  canEdit: boolean;
  showHistory: boolean;
  versionCount: number | null;
  hasActiveEvolution: boolean;
  canDelete: boolean;
  onOpenHistory: () => void;
  onEvolve: () => void;
  onDelete: () => void;
}

export default function StoryToolbar({
  legacyId,
  legacyName,
  isEditMode,
  canEdit,
  showHistory,
  versionCount,
  hasActiveEvolution,
  canDelete,
  onOpenHistory,
  onEvolve,
  onDelete,
}: StoryToolbarProps) {
  return (
    <PageActionBar backLabel={legacyName} backTo={`/legacy/${legacyId}`}>
      {isEditMode && (
        <>
          {showHistory && (
            <VersionHistoryButton
              versionCount={versionCount}
              onClick={onOpenHistory}
            />
          )}
          {canEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={onEvolve}
                >
                  <Sparkles className="size-4" />
                  {hasActiveEvolution ? 'Continue Evolving' : 'Evolve'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Edit and enhance your story with AI assistance
              </TooltipContent>
            </Tooltip>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </>
      )}
    </PageActionBar>
  );
}
```

**Step 2: Update StoryCreation.tsx to pass the new `legacyId` prop**

In `src/features/story/components/StoryCreation.tsx`, update the `<StoryToolbar>` call (lines 202-214).

Remove `onBack={handleBack}` (no longer needed) and add `legacyId={legacyId}`:

```tsx
      <StoryToolbar
        legacyId={legacyId}
        legacyName={legacyName}
        isEditMode={isEditMode}
        canEdit={canEdit}
        showHistory={showHistory}
        versionCount={existingStory?.version_count ?? null}
        hasActiveEvolution={hasActiveEvolution}
        canDelete={canEdit}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onEvolve={handleNavigateToEvolve}
        onDelete={() => setShowDeleteDialog(true)}
      />
```

Also remove the `handleBack` function (lines 107-109) since it's no longer used by StoryToolbar. Note: check if `handleBack` is used elsewhere before removing — it's not used anywhere else in this file.

**Step 3: Run tests**

Run: `cd apps/web && npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/story/components/StoryToolbar.tsx apps/web/src/features/story/components/StoryCreation.tsx
git commit -m "refactor(story): replace HeaderSlot with PageActionBar on story view"
```

---

## Task 4: Story Evolution Workspace — Replace HeaderSlot with PageActionBar

**Files:**
- Modify: `src/features/story-evolution/StoryEvolutionWorkspace.tsx`

This file has TWO `<HeaderSlot>` blocks — one for the "no session" state (line 201-211) and one for the active session state (line 320-373). Both need to be replaced with `<PageActionBar>`.

**Step 1: Modify StoryEvolutionWorkspace.tsx**

Changes:
1. Remove `import { HeaderSlot } from '@/components/header';`
2. Add `import PageActionBar from '@/components/PageActionBar';`

Replace the first HeaderSlot block (no-session state, lines 201-211):
```tsx
        <HeaderSlot>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to story</span>
            </button>
          </div>
        </HeaderSlot>
```

With:
```tsx
        <PageActionBar backLabel="Back to story" backTo={`/legacy/${legacyId}/story/${storyId}`} />
```

Replace the second HeaderSlot block (active session state, lines 320-373):
```tsx
      <HeaderSlot>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Back to story</span>
          </button>
          <Badge
            variant="outline"
            className="bg-purple-50 text-purple-700 border-purple-200"
          >
            Evolution
          </Badge>
          {phase !== 'completed' && phase !== 'discarded' && (
            <AlertDialog>
              ...discard dialog...
            </AlertDialog>
          )}
        </div>
      </HeaderSlot>
```

With:
```tsx
      <PageActionBar backLabel="Back to story" backTo={`/legacy/${legacyId}/story/${storyId}`}>
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 border-purple-200"
        >
          Evolution
        </Badge>
        {phase !== 'completed' && phase !== 'discarded' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-1"
                disabled={discardEvolution.isPending}
              >
                <X className="size-3.5 mr-1" />
                Discard
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard evolution session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will discard all progress in this evolution session
                  including any conversation and draft. Your original story
                  will remain unchanged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep working</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDiscard}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {discardEvolution.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : null}
                  Discard session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </PageActionBar>
```

Also remove the `ArrowLeft` import since it's no longer needed (PageActionBar has its own).

**Step 2: Run tests**

Run: `cd apps/web && npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx
git commit -m "refactor(evolution): replace HeaderSlot with PageActionBar on evolution workspace"
```

---

## Task 5: MyLegacies — Move Search and Create Button Inline

**Files:**
- Modify: `src/components/MyLegacies.tsx`

MyLegacies has a `<HeaderSlot>` containing a SearchBar and Create button. Move these into the page's existing header section (the `<div>` with "My Legacies" heading at lines 169-174).

**Step 1: Modify MyLegacies.tsx**

Changes:
1. Remove `import { HeaderSlot } from '@/components/header';`
2. Remove the HeaderSlot block (lines 155-165):
```tsx
      <HeaderSlot>
        <SearchBar onSelectResult={handleSearchSelect} compact />
        <Button
          onClick={handleCreateLegacy}
          size="sm"
          className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Create Legacy</span>
        </Button>
      </HeaderSlot>
```

3. Update the heading section (lines 169-174) to include the search bar and button:

Replace:
```tsx
          <div>
            <h1 className="text-neutral-900">My Legacies</h1>
            <p className="text-neutral-600 mt-2">
              Legacies you've created and curated
            </p>
          </div>
```

With:
```tsx
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-neutral-900">My Legacies</h1>
              <p className="text-neutral-600 mt-2">
                Legacies you've created and curated
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SearchBar onSelectResult={handleSearchSelect} compact />
              <Button
                onClick={handleCreateLegacy}
                size="sm"
                className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Create Legacy</span>
              </Button>
            </div>
          </div>
```

**Step 2: Run tests**

Run: `cd apps/web && npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/MyLegacies.tsx
git commit -m "refactor(my-legacies): move search and create button inline from header"
```

---

## Task 6: Final Verification

**Step 1: Run full test suite**

```bash
cd apps/web && npx vitest run
```
Expected: All tests PASS

**Step 2: Build check**

```bash
cd apps/web && npm run build
```
Expected: Build succeeds with no TypeScript or import errors

**Step 3: Lint check**

```bash
cd apps/web && npm run lint
```
Expected: No lint errors

**Step 4: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
