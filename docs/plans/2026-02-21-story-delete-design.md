# Story Delete Feature Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

Add the ability to delete a story from the story view page. The delete button appears in the StoryToolbar when the user is the author. A confirmation dialog shows the story title and version count before proceeding.

## Context

- Backend `DELETE /api/stories/{story_id}` already exists with proper authorization (author or legacy creator)
- Hard-deletes the story, all versions, and legacy associations (cascade)
- Frontend `useDeleteStory()` hook and `deleteStory()` API function exist but are unused
- Existing `DeleteLegacyDialog` provides the pattern to follow

## Design

### 1. DeleteStoryDialog Component

New file: `apps/web/src/features/story/components/DeleteStoryDialog.tsx`

- Follows `DeleteLegacyDialog` pattern exactly
- Props: `open`, `onOpenChange`, `storyTitle`, `versionCount`, `isPending`, `onConfirm`
- Dialog text mentions how many versions will be deleted
- Cancel + destructive Delete button with loading state

### 2. StoryToolbar Changes

File: `apps/web/src/features/story/components/StoryToolbar.tsx`

- Add `Trash2` icon button in view mode, visible when user can edit (is author)
- Placed after the Evolve button
- Uses `variant="ghost"` with destructive styling
- New props: `canDelete: boolean`, `onDelete: () => void`

### 3. StoryCreation Wiring

File: `apps/web/src/features/story/components/StoryCreation.tsx`

- Import and use `useDeleteStory()` hook
- Add `showDeleteDialog` state
- On successful delete, navigate to `/legacy/${legacyId}`
- Render `DeleteStoryDialog` with story title and version count

## Files Changed

| File | Change |
|------|--------|
| `DeleteStoryDialog.tsx` (new) | Confirmation dialog component |
| `StoryToolbar.tsx` | Add delete button + new props |
| `StoryCreation.tsx` | Wire up delete hook, dialog state, navigation |
