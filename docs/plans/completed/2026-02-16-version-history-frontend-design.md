# Version History Frontend Design

**Date:** 2026-02-16
**Status:** Approved
**Feature:** Frontend UI for browsing and restoring story versions
**Depends on:** Backend versioning API (fully implemented)

## Overview

Authors can browse the full history of changes to their stories, preview any previous version's content, and restore old versions — all from within the existing story view. The UI is a right-side drawer with a version timeline, integrated into the `StoryCreation` component via the existing header slot system.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Entry point | Clock icon button in header slot | Consistent with existing header action pattern (Edit, Back, Save) |
| History display | Right-side drawer (Sheet) | Author keeps context of current story; natural for timeline browsing |
| Version preview | Replace main content area | Full width for reading; simple state swap |
| Diff view | Not included (v1) | YAGNI — adds library dependency and complexity; defer to future enhancement |
| Restore confirmation | AlertDialog | Already in UI library; appropriate for a meaningful but reversible action |
| Delete UI | Not included (v1) | Rarely needed; can be added later without architectural changes |
| State management | Local useState + TanStack Query | No Zustand needed; drawer state and selection are ephemeral |

## UX Flow

1. Author views their story in the existing read-only view mode
2. A **"History" button** (clock icon) appears in the header slot — visible only to the story author, only when `version_count > 1`
3. Clicking opens a **right-side drawer** showing a timeline of versions, newest first
4. Each entry shows: version number, source badge, change summary, timestamp, active/draft status
5. Clicking a version **replaces the main content area** with that version's content, plus a preview banner
6. The preview banner shows "Viewing version N" with a **"Restore this version"** button (hidden for the active version)
7. Clicking "Restore" shows an **AlertDialog** confirmation
8. On confirm: `POST /versions/{n}/activate` is called, content refreshes, drawer updates with the new version at top
9. If a draft exists, it appears in a highlighted section at the top of the drawer with Approve/Discard buttons

## Drawer Layout

### Header Zone

- Title: "Version History"
- Close button (X)
- Soft cap warning banner (conditional): "This story has N versions. Consider removing old versions you no longer need."

### Draft Zone (conditional)

Only shown when `has_draft` is true. A highlighted card with amber/warning styling:

- Source label: "Draft — AI Enhancement" (or relevant source)
- Change summary text
- Stale warning if applicable: "Created based on an older version"
- Two buttons: "Approve" (primary) and "Discard" (destructive ghost)
- Clicking the card previews draft content in the main area

### Version List Zone

Scrollable list, paginated via "Load more" button at the bottom:

- **Version badge**: Circle with "v3" style numbering
- **Source badge**: Small badge (Manual edit / AI enhancement / Restoration)
- **Change summary**: 1 line, truncated
- **Timestamp**: Relative ("2 hours ago")
- **Active indicator**: Green dot or "Active" badge for the current active version
- **Selection highlight**: Border or background change for the selected version
- Clicking any entry previews it in the main content area

## Main Content Preview Mode

When a non-active version is selected:

- **Preview banner** appears above the title with:
  - Left: "Viewing version N" + source badge + relative date
  - Right: "Restore this version" button (primary themed)
  - Subtle background color (theme-primary-light) to indicate preview state
- **Content display**: Same read-only rendering as current view mode, using version data instead of story data
- **Exit preview**: Click active version in drawer, close drawer, or after successful restore

## Components

### New Components

| Component | Location | Purpose |
|---|---|---|
| `VersionHistoryButton` | `components/VersionHistoryButton.tsx` | Header slot button with clock icon. Renders when `version_count > 1` and user is author |
| `VersionHistoryDrawer` | `components/VersionHistoryDrawer.tsx` | Sheet (side=right) with draft zone, version timeline, pagination |
| `VersionPreviewBanner` | `components/VersionPreviewBanner.tsx` | Banner above content with version info and Restore button + AlertDialog |

### Modified Components

| Component | Changes |
|---|---|
| `StoryCreation` | Add `isHistoryOpen` and `previewVersionNumber` state. Render VersionHistoryButton in header slot. Render VersionHistoryDrawer as sibling. Render VersionPreviewBanner when previewing. Swap content data source when previewing. |

### No New Routes

Everything lives within the existing `StoryCreation` component and its route (`/legacy/:legacyId/story/:storyId`).

## API Client

New file: `apps/web/src/lib/api/versions.ts`

```typescript
getVersions(storyId: string, page?: number, pageSize?: number): Promise<VersionListResponse>
getVersion(storyId: string, versionNumber: number): Promise<VersionDetail>
restoreVersion(storyId: string, versionNumber: number): Promise<VersionDetail>
approveDraft(storyId: string): Promise<VersionDetail>
discardDraft(storyId: string): Promise<void>
```

## Query Hooks

New file: `apps/web/src/lib/hooks/useVersions.ts`

```typescript
useVersions(storyId, enabled)          // Fetches version list when drawer is open
useVersionDetail(storyId, versionNum)  // Fetches full content for selected version
useRestoreVersion()                    // Mutation: restore old version
useApproveDraft()                      // Mutation: approve draft
useDiscardDraft()                      // Mutation: discard draft
```

**Query keys:**
- `['stories', storyId, 'versions']` — version list
- `['stories', storyId, 'versions', versionNumber]` — version detail

**Cache invalidation** — After restore/approve/discard, invalidate both the story detail query (`['stories', storyId]`) and versions list query. Ensures UI consistency without manual state syncing.

## Types

```typescript
interface VersionSummary {
  version_number: number
  status: 'active' | 'inactive' | 'draft'
  source: string
  source_version: number | null
  change_summary: string | null
  stale: boolean
  created_by: string
  created_at: string
}

interface VersionDetail extends VersionSummary {
  title: string
  content: string
}

interface VersionListResponse {
  versions: VersionSummary[]
  total: number
  page: number
  page_size: number
  warning: string | null
}
```

## Edge Cases

- **Single version story**: History button hidden (`version_count <= 1`), no drawer needed
- **Draft exists but no other versions**: Draft zone shown, version list has just v1
- **Stale draft**: Warning text displayed in draft card
- **Restore while drawer open**: Drawer list refreshes via query invalidation, new version appears at top, selection clears to active
- **Approve draft while previewing it**: Content becomes active, banner disappears, drawer updates
- **Network error on restore/approve**: TanStack Query error state surfaces in the AlertDialog or as a toast notification
- **Long version list**: "Load more" button at bottom, fetches next page (API is paginated)

## Future Enhancements (not in scope)

- Side-by-side diff view between any two versions
- Bulk version deletion UI
- Version filtering/search
- Version comparison selection (pick two versions to compare)
