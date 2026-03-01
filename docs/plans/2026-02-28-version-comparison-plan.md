# Version Comparison & Restore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the Compare button in the Versions tool to show an inline diff between the current draft and any historical version, with the option to restore the old version.

**Architecture:** Extend the Zustand store with comparison state (`compareState`, `compareVersionNumber`), reusing the existing `originalContent`/`rewriteContent` fields and `DiffView` component. Comparison and AI rewrite are mutually exclusive. No backend changes needed — `getVersion()` already fetches version content.

**Tech Stack:** React 18, TypeScript, Zustand, TanStack Query, diff-match-patch (existing)

**Design Doc:** [docs/plans/2026-02-28-version-comparison-design.md](2026-02-28-version-comparison-design.md)

---

## Task 1: Zustand Store — Add Comparison State ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts`
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`

**Step 1: Write the failing tests**

Add these tests at the end of the existing `describe` block in `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`, before the closing `});`:

```typescript
  // --- Version comparison ---

  it('defaults to idle compare state', () => {
    expect(useEvolveWorkspaceStore.getState().compareState).toBe('idle');
  });

  it('defaults to null compare version number', () => {
    expect(useEvolveWorkspaceStore.getState().compareVersionNumber).toBeNull();
  });

  it('startCompare sets comparing state with content', () => {
    useEvolveWorkspaceStore.getState().startCompare(2, 'old version text', 'current draft text');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('comparing');
    expect(state.compareVersionNumber).toBe(2);
    expect(state.originalContent).toBe('old version text');
    expect(state.rewriteContent).toBe('current draft text');
    expect(state.viewMode).toBe('diff');
  });

  it('closeCompare resets to idle', () => {
    useEvolveWorkspaceStore.getState().startCompare(2, 'old', 'new');
    useEvolveWorkspaceStore.getState().closeCompare();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.compareVersionNumber).toBeNull();
    expect(state.originalContent).toBeNull();
    expect(state.rewriteContent).toBeNull();
    expect(state.viewMode).toBe('editor');
  });

  it('startCompare is blocked during rewrite', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().startCompare(2, 'old', 'new');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.rewriteState).toBe('streaming');
  });

  it('startRewrite auto-closes active comparison', () => {
    useEvolveWorkspaceStore.getState().startCompare(2, 'old', 'new');
    expect(useEvolveWorkspaceStore.getState().compareState).toBe('comparing');
    useEvolveWorkspaceStore.getState().startRewrite('draft content');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.compareVersionNumber).toBeNull();
    expect(state.rewriteState).toBe('streaming');
  });

  it('reset clears comparison state', () => {
    useEvolveWorkspaceStore.getState().startCompare(3, 'old', 'new');
    useEvolveWorkspaceStore.getState().reset();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.compareVersionNumber).toBeNull();
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: FAIL — `compareState` and `startCompare` are not defined on the store.

**Step 3: Implement the store changes**

In `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts`:

Add the new type after the existing `ViewMode` type on line 6:

```typescript
export type CompareState = 'idle' | 'loading' | 'comparing';
```

Add these fields to the `EvolveWorkspaceState` interface, after the `setViewMode` line (line 24):

```typescript
  // Version comparison
  compareState: CompareState;
  compareVersionNumber: number | null;
  startCompare: (versionNumber: number, versionContent: string, currentDraftContent: string) => void;
  closeCompare: () => void;
```

Add the new defaults to `initialState`, after the `viewMode` line (line 45):

```typescript
  compareState: 'idle' as CompareState,
  compareVersionNumber: null as number | null,
```

Modify `startRewrite` (line 56-61) to auto-close any active comparison:

```typescript
  startRewrite: (currentContent) =>
    set({
      rewriteState: 'streaming',
      originalContent: currentContent,
      rewriteContent: '',
      compareState: 'idle',
      compareVersionNumber: null,
    }),
```

Add the new actions after `setViewMode` (line 84):

```typescript
  startCompare: (versionNumber, versionContent, currentDraftContent) =>
    set((state) => {
      if (state.rewriteState !== 'idle') return state;
      return {
        compareState: 'comparing',
        compareVersionNumber: versionNumber,
        originalContent: versionContent,
        rewriteContent: currentDraftContent,
        viewMode: 'diff',
      };
    }),

  closeCompare: () =>
    set({
      compareState: 'idle',
      compareVersionNumber: null,
      originalContent: null,
      rewriteContent: null,
      viewMode: 'editor',
    }),
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: All tests PASS (both old and new).

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts
git commit -m "feat: add version comparison state to evolve workspace store"
```

---

## Task 2: VersionsTool — Wire Compare Button ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/tools/VersionsTool.tsx`

**Step 1: Implement the wired Compare button**

Replace the entire content of `apps/web/src/features/evolve-workspace/tools/VersionsTool.tsx`:

```typescript
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVersions } from '@/features/story/hooks/useVersions';
import { getVersion } from '@/features/story/api/versions';
import { getSourceLabel } from '@/lib/utils/versionLabels';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { formatDistanceToNow } from 'date-fns';

interface VersionsToolProps {
  storyId: string;
  currentContent: string;
}

export function VersionsTool({ storyId, currentContent }: VersionsToolProps) {
  const { data, isLoading } = useVersions(storyId, true);
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const compareVersionNumber = useEvolveWorkspaceStore((s) => s.compareVersionNumber);
  const startCompare = useEvolveWorkspaceStore((s) => s.startCompare);
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);

  const handleCompare = async (versionNumber: number) => {
    setLoadingVersion(versionNumber);
    try {
      const detail = await getVersion(storyId, versionNumber);
      startCompare(versionNumber, detail.content, currentContent);
    } catch (err) {
      console.error('Failed to load version for comparison:', err);
    } finally {
      setLoadingVersion(null);
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-neutral-400">Loading versions...</div>;
  }

  const versions = data?.versions ?? [];

  if (versions.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No versions yet. Save changes or run an AI rewrite to create versions.
      </div>
    );
  }

  const isCompareDisabled = rewriteState !== 'idle';

  return (
    <div className="p-3 space-y-2">
      {versions.map((version) => {
        const isActive = version.status === 'active';
        const isCurrentlyCompared =
          compareState === 'comparing' && compareVersionNumber === version.version_number;
        const isLoadingThis = loadingVersion === version.version_number;

        return (
          <div
            key={version.version_number}
            className={`flex items-center justify-between p-2 rounded-md border text-sm ${
              isCurrentlyCompared
                ? 'border-theme-primary bg-theme-primary/5'
                : 'bg-neutral-50'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs shrink-0">
                  v{version.version_number}
                </Badge>
                {version.status === 'active' && (
                  <Badge className="text-xs bg-emerald-100 text-emerald-700">Active</Badge>
                )}
                {version.status === 'draft' && (
                  <Badge className="text-xs bg-amber-100 text-amber-700">Draft</Badge>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {getSourceLabel(version.source)} &middot;{' '}
                {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
              </p>
              {version.change_summary && (
                <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                  {version.change_summary}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant={isCurrentlyCompared ? 'default' : 'ghost'}
              onClick={() => handleCompare(version.version_number)}
              disabled={isCompareDisabled || isActive || isLoadingThis}
              className="shrink-0 text-xs"
            >
              {isLoadingThis ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isCurrentlyCompared ? (
                'Comparing'
              ) : (
                'Compare'
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify the build doesn't break**

This will have a type error because `ToolPanel` doesn't pass `currentContent` yet. That's expected — we'll fix it in Task 4. For now, confirm the file saves correctly.

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/VersionsTool.tsx
git commit -m "feat: wire Compare button to fetch version content and enter comparison mode"
```

---

## Task 3: EditorPanel — Add Comparison Mode ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/EditorPanel.tsx`

**Step 1: Add comparison mode rendering**

Replace the entire content of `apps/web/src/features/evolve-workspace/components/EditorPanel.tsx`:

```typescript
import { useCallback } from 'react';
import StoryEditor from '@/features/editor/components/StoryEditor';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, RefreshCw, RotateCcw } from 'lucide-react';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { DiffView } from './DiffView';

interface EditorPanelProps {
  content: string;
  onChange: (markdown: string) => void;
  legacyId: string;
  onAcceptRewrite: (content: string) => void;
  onRegenerate: () => void;
  onRestore: (content: string) => void;
}

export function EditorPanel({
  content,
  onChange,
  legacyId,
  onAcceptRewrite,
  onRegenerate,
  onRestore,
}: EditorPanelProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const rewriteContent = useEvolveWorkspaceStore((s) => s.rewriteContent);
  const originalContent = useEvolveWorkspaceStore((s) => s.originalContent);
  const viewMode = useEvolveWorkspaceStore((s) => s.viewMode);
  const setViewMode = useEvolveWorkspaceStore((s) => s.setViewMode);
  const discardRewrite = useEvolveWorkspaceStore((s) => s.discardRewrite);
  const acceptRewrite = useEvolveWorkspaceStore((s) => s.acceptRewrite);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const compareVersionNumber = useEvolveWorkspaceStore((s) => s.compareVersionNumber);
  const closeCompare = useEvolveWorkspaceStore((s) => s.closeCompare);

  const isRewriting = rewriteState === 'streaming' || rewriteState === 'reviewing';
  const isComparing = compareState === 'comparing';

  const handleAccept = useCallback(() => {
    if (rewriteContent) {
      onAcceptRewrite(rewriteContent);
      acceptRewrite();
    }
  }, [rewriteContent, onAcceptRewrite, acceptRewrite]);

  const handleDiscard = useCallback(() => {
    discardRewrite();
  }, [discardRewrite]);

  const handleRestore = useCallback(() => {
    if (originalContent) {
      onRestore(originalContent);
      closeCompare();
    }
  }, [originalContent, onRestore, closeCompare]);

  const handleCloseCompare = useCallback(() => {
    closeCompare();
  }, [closeCompare]);

  // Version comparison mode (takes priority)
  if (isComparing) {
    return (
      <div className="flex flex-col h-full">
        {/* Comparison header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Comparing with</span>
            <Badge variant="outline" className="text-xs">
              v{compareVersionNumber}
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={handleCloseCompare}>
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-y-auto">
          <DiffView
            original={originalContent ?? ''}
            rewrite={rewriteContent ?? ''}
          />
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-t bg-white shrink-0">
          <Button size="sm" onClick={handleRestore}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Restore this version
          </Button>
          <Button size="sm" variant="outline" onClick={handleCloseCompare}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Normal editing mode
  if (!isRewriting) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <StoryEditor
            content={content}
            onChange={onChange}
            legacyId={legacyId}
            placeholder="Start writing your story..."
          />
        </div>
      </div>
    );
  }

  // Rewrite mode: show toggle + content + action buttons
  return (
    <div className="flex flex-col h-full">
      {/* View mode toggle + status */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500 mr-2">View:</span>
          <Button
            variant={viewMode === 'editor' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('editor')}
          >
            Editor
          </Button>
          <Button
            variant={viewMode === 'diff' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('diff')}
          >
            Diff
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {rewriteState === 'streaming' && (
            <span className="text-xs text-amber-600 animate-pulse">Rewriting...</span>
          )}
          {rewriteState === 'reviewing' && (
            <span className="text-xs text-emerald-600">Rewrite complete</span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'editor' ? (
          rewriteState === 'streaming' ? (
            <div className="px-6 py-4 font-serif">
              <Streamdown isAnimating={true} caret="block">
                {rewriteContent ?? ''}
              </Streamdown>
            </div>
          ) : (
            <StoryEditor
              content={rewriteContent ?? ''}
              onChange={(md) =>
                useEvolveWorkspaceStore.setState({ rewriteContent: md })
              }
              legacyId={legacyId}
            />
          )
        ) : (
          <DiffView
            original={originalContent ?? ''}
            rewrite={rewriteContent ?? ''}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 px-4 py-3 border-t bg-white shrink-0">
        <Button size="sm" onClick={handleAccept} disabled={rewriteState === 'streaming'}>
          <Check className="h-4 w-4 mr-1" />
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={handleDiscard}>
          <X className="h-4 w-4 mr-1" />
          Discard
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRegenerate}
          disabled={rewriteState === 'streaming'}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Verify the file saves correctly**

This will have a type error at call sites because `onRestore` is a new required prop. We'll fix that in Task 4.

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/EditorPanel.tsx
git commit -m "feat: add version comparison mode to EditorPanel with restore action"
```

---

## Task 4: Integration — Wire Everything Together ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx:8-9,14,33`
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx:129-135,206-212,232-238,251`
- Modify: `apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx:11,21`

**Step 1: Update ToolPanel to pass `currentContent`**

In `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx`:

Add `currentContent` to the props interface (line 8-12):

```typescript
interface ToolPanelProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
}
```

Add `currentContent` to the destructured props (line 14):

```typescript
export function ToolPanel({ legacyId, storyId, conversationId, currentContent }: ToolPanelProps) {
```

Pass it to VersionsTool (line 33):

```typescript
        {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
```

**Step 2: Update EvolveWorkspace**

In `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`:

Add a `handleRestore` callback after `handleAcceptRewrite` (after line 135):

```typescript
  const handleRestore = useCallback(
    (restoredContent: string) => {
      setContent(restoredContent);
      setIsDirty(true);
    },
    [],
  );
```

Add `onRestore` prop to both EditorPanel instances.

For the mobile EditorPanel (around line 206-212), replace:

```typescript
              <EditorPanel
                content={content}
                onChange={handleContentChange}
                legacyId={legacyId}
                onAcceptRewrite={handleAcceptRewrite}
                onRegenerate={handleRewrite}
              />
```

with:

```typescript
              <EditorPanel
                content={content}
                onChange={handleContentChange}
                legacyId={legacyId}
                onAcceptRewrite={handleAcceptRewrite}
                onRegenerate={handleRewrite}
                onRestore={handleRestore}
              />
```

For the desktop EditorPanel (around line 232-238), replace:

```typescript
                  <EditorPanel
                    content={content}
                    onChange={handleContentChange}
                    legacyId={legacyId}
                    onAcceptRewrite={handleAcceptRewrite}
                    onRegenerate={handleRewrite}
                  />
```

with:

```typescript
                  <EditorPanel
                    content={content}
                    onChange={handleContentChange}
                    legacyId={legacyId}
                    onAcceptRewrite={handleAcceptRewrite}
                    onRegenerate={handleRewrite}
                    onRestore={handleRestore}
                  />
```

Add `currentContent` to both ToolPanel instances.

For the desktop ToolPanel (around line 243-246), replace:

```typescript
                  <ToolPanel
                    legacyId={legacyId}
                    storyId={storyId}
                    conversationId={conversationId}
                  />
```

with:

```typescript
                  <ToolPanel
                    legacyId={legacyId}
                    storyId={storyId}
                    conversationId={conversationId}
                    currentContent={content}
                  />
```

For the MobileToolSheet, we need to check if it also renders ToolPanel. Let me note: the `MobileToolSheet` component already renders its own ToolPanel instance — it also needs `currentContent`. Check `MobileToolSheet.tsx` and add the prop there too.

**Step 3: Update BottomToolbar to disable during comparison**

In `apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx`:

Add `compareState` selector (after line 11):

```typescript
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
```

Update the disabled condition on the Button (line 21):

```typescript
          disabled={rewriteState === 'streaming' || compareState !== 'idle'}
```

**Step 4: Update MobileToolSheet**

`MobileToolSheet` renders `<VersionsTool>` directly (not through ToolPanel). In `apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx`:

Add `currentContent` to the props interface (line 9-15):

```typescript
interface MobileToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
}
```

Add `currentContent` to the destructured props (line 17-23):

```typescript
export function MobileToolSheet({
  open,
  onOpenChange,
  legacyId,
  storyId,
  conversationId,
  currentContent,
}: MobileToolSheetProps) {
```

Pass it to VersionsTool (line 39):

```typescript
          {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
```

Then in `EvolveWorkspace.tsx`, update the MobileToolSheet usage (around line 218-224) to pass `currentContent`:

```typescript
            <MobileToolSheet
              open={mobileSheetOpen}
              onOpenChange={setMobileSheetOpen}
              legacyId={legacyId}
              storyId={storyId}
              conversationId={conversationId}
              currentContent={content}
            />
```

**Step 5: Run the full build to verify no type errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 6: Run existing tests to verify no regressions**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/`
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/ToolPanel.tsx apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx
git commit -m "feat: wire version comparison through workspace, tool panel, and bottom toolbar"
```

---

## Task 5: Manual Testing & Validation ✅

**Step 1: Start the dev server**

Run: `cd apps/web && npm run dev`

**Step 2: Manual test flow**

1. Navigate to a story with at least 2 versions
2. Open the evolve workspace
3. Click the Versions tab
4. Click Compare on a non-active version
5. Verify: loading spinner appears on the button
6. Verify: DiffView shows with green (additions) and red (deletions)
7. Verify: header shows "Comparing with v{N}"
8. Verify: AI Rewrite button is disabled in the bottom toolbar
9. Click Close — verify editor returns to normal
10. Click Compare again, then click "Restore this version"
11. Verify: editor content is replaced with the old version text
12. Verify: "Unsaved changes" appears in the header
13. Verify: Compare button for the active version is disabled

**Step 3: Run lint**

Run: `cd apps/web && npm run lint`
Expected: No errors.

**Step 4: Commit any fixes**

If any issues were found during testing, fix and commit them.
