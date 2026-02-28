# Version Comparison & Restore — Design Document

**Date:** 2026-02-28
**Status:** Approved
**Scope:** Evolve Workspace — Versions tab

---

## Problem

The Versions tool in the evolve workspace shows a list of story versions with a Compare button on each, but clicking Compare does nothing. The `DiffView` component exists and works, but it's only wired to the AI rewrite flow. Users have no way to compare their current draft against previous versions or restore an older version.

## Goals

1. Compare the current draft against any historical version, showing an inline diff
2. Restore any historical version by replacing the current draft content
3. Keep the interaction simple and intuitive for a broad, non-technical audience

## Non-Goals (Deferred)

- AI-generated explanation of differences between versions
- Side-by-side diff view (inline only for v1)
- Auto-saving the current draft before restore

---

## Approach

Extend the existing Zustand store and reuse the `DiffView` component. Comparison and AI rewrite are mutually exclusive modes — they share the same `originalContent`/`rewriteContent` fields since only one can be active at a time.

No backend changes are needed. The existing `useVersionDetail` hook fetches version content, and restore is a client-side content replacement.

---

## State Management

New fields added to `useEvolveWorkspaceStore`:

```
compareState: 'idle' | 'loading' | 'comparing'
compareVersionNumber: number | null
```

New actions:

```
startCompare(versionNumber, versionContent, currentDraftContent)
  → compareState = 'comparing'
  → compareVersionNumber = versionNumber
  → originalContent = versionContent (the old version is the baseline)
  → rewriteContent = currentDraftContent (the current draft shows changes)
  → viewMode = 'diff'

closeCompare()
  → compareState = 'idle'
  → compareVersionNumber = null
  → originalContent = null
  → rewriteContent = null
  → viewMode = 'editor'
```

Mutual exclusivity guards:
- `startCompare` is blocked when `rewriteState !== 'idle'`
- `startRewrite` auto-closes any active comparison
- Compare buttons are disabled during active rewrite

---

## Diff Direction

- **Baseline (original):** The selected historical version
- **Comparison (rewrite):** The current draft content
- **Green highlights:** Text in the current draft that the old version didn't have (additions)
- **Red strikethrough:** Text in the old version that the current draft removed (deletions)

This answers the question: "What changed since that version?"

---

## UI Flow

### Entering Comparison

1. User clicks **Versions** tab in the tool strip
2. Version list loads (existing behavior)
3. User clicks **Compare** on a version (e.g., v2)
4. Button shows loading spinner while version content is fetched
5. EditorPanel switches to comparison mode:

```
┌─────────────────────────────────────────────┐
│ Comparing with v2 · Manual edit     [Close] │  ← comparison header
├─────────────────────────────────────────────┤
│                                             │
│ The summer of 1992 was [unlike any other]   │  ← DiffView
│ [-extraordinary-]. We spent our days at     │     green = in your draft
│ the [lake house] [-old cabin-]...           │     red = was in v2
│                                             │
├─────────────────────────────────────────────┤
│ [Restore this version]              [Close] │  ← action bar
└─────────────────────────────────────────────┘
```

### Restoring a Version

1. User clicks **Restore this version**
2. Editor content is replaced with the old version's text
3. Comparison mode exits, editor returns to normal editing
4. Content is marked as dirty (unsaved changes)
5. User can Save to persist or continue editing

### Exiting Without Restoring

1. User clicks **Close** (header or action bar)
2. Comparison mode exits, editor returns to current draft as-is

---

## Component Changes

### Modified Files (5 files, 0 new files, 0 backend changes)

1. **`useEvolveWorkspaceStore.ts`**
   - Add `compareState`, `compareVersionNumber`
   - Add `startCompare()`, `closeCompare()` actions
   - Guard: `startRewrite` auto-closes comparison
   - Guard: `startCompare` blocked during rewrite

2. **`VersionsTool.tsx`**
   - Wire Compare button to fetch version content via `useVersionDetail`
   - Call `startCompare()` with fetched content and current draft
   - Disable Compare during rewrite (`rewriteState !== 'idle'`)
   - Disable Compare for the currently-active version
   - Show loading spinner on button while fetching

3. **`EditorPanel.tsx`**
   - Add third rendering branch: `compareState === 'comparing'`
   - Show comparison header bar with version info and Close button
   - Render DiffView with `originalContent` and `rewriteContent`
   - Show action bar with Restore and Close buttons
   - Comparison branch takes priority over both normal editor and rewrite mode

4. **`EvolveWorkspace.tsx`**
   - Add `handleRestore` callback: sets editor content to restored version text, calls `closeCompare()`
   - Pass `handleRestore` to EditorPanel

5. **`BottomToolbar.tsx`**
   - Disable AI Rewrite button when `compareState !== 'idle'`

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Unsaved changes + compare | Draft stays in memory. Close returns to unsaved draft. No data loss. |
| Unsaved changes + restore | Draft is replaced. Old draft exists as a version if it was previously saved. |
| Rewrite in progress | Compare buttons disabled. Available again after rewrite completes. |
| Network error fetching version | Inline error on Compare button, user can retry. |
| Compare active version | Compare button disabled for the currently active version. |

---

## Mobile Behavior

- VersionsTool lives in the bottom drawer (Vaul sheet)
- When Compare is tapped, drawer closes and editor area switches to comparison DiffView
- Same header/action bar as desktop
- Restore and Close work identically

---

## Future Enhancements

- AI-generated summary of differences (send both versions to AI chat)
- Side-by-side diff view option
- Keyboard shortcuts for restore/close
