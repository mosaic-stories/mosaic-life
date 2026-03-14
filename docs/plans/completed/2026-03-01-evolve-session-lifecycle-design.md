# Evolve Session Lifecycle Design

**Date:** 2026-03-01
**Status:** Approved

## Problem

The evolve workspace has two editing paths with inconsistent lifecycles:

| Path | Creates Version? | Ends Session? | Revertable? |
|------|:---:|:---:|:---:|
| AI Rewrite → Accept diff | Yes (draft) | No (stuck in review) | Yes |
| Manual edit → Save | No (direct write) | No (stuck in any phase) | No |

Both paths leave orphaned sessions that trigger the "You have a story evolution in progress" banner on the story view page. The only way to dismiss this banner is "Discard session", which **reverts saved changes** — counterintuitive and destructive.

### Root Cause

- `handleSave` in `EvolveWorkspace.tsx` calls `updateStory` (PUT to Story table) directly, bypassing the version system
- No mechanism exists to complete a session after manual edits — `accept_session` requires phase="review" and a draft version
- `discard_active_session` calls `_restore_base_version()`, which overwrites the user's saved changes with the pre-session content

## Design

### Core Principle

All edits in the evolve workspace produce **versioned drafts**. A session always ends explicitly — either **Finish** (keep changes) or **Discard** (revert).

### Workspace Header

```
[ ← Back ]  Story Title       [Discard]  [Save draft]  [Finish ✓]
                                              ↑              ↑
                                     Enabled when       Enabled when
                                     editor is dirty    draft exists
```

#### Save Draft (replaces current "Save")

- Creates a `StoryVersion` with `status="draft"`, `source="manual_edit"`
- If a draft already exists (from AI rewrite or prior manual save), replaces it
- Session advances to `review` phase (or stays there if already in review)
- Editor is no longer dirty after saving
- Label: "Save draft" (not "Save")

#### Finish (new action)

- If editor is dirty, auto-saves draft first (so user doesn't have to think about ordering)
- Calls `accept_session` — promotes draft to active version, marks session `completed`
- Navigates back to story view page
- Shows confirmation dialog: "Publish this version? This will replace the current story."

#### Discard (unchanged)

- Restores base version content
- Marks session `discarded`
- Navigates back to story view page
- Confirmation dialog (already exists)

### AI Rewrite Integration

The AI rewrite flow already creates draft versions during streaming. After accepting a diff:

1. Content goes into editor, draft already exists → **Finish** is immediately available
2. If user makes additional manual edits after accepting → **Save draft** replaces the AI draft with updated content
3. **Finish** works the same either way — promotes the latest draft

Both paths converge: manual edits and AI rewrites both produce drafts, and Finish always promotes the latest draft.

### Story View Page Banner

```
┌──────────────────────────────────────────────────────────────┐
│  You have a story evolution in progress.                     │
│                                      [Discard]  [Continue →] │
└──────────────────────────────────────────────────────────────┘
```

- **Continue** → navigate to evolve workspace
- **Discard** → discard with confirmation dialog (same as workspace discard)
- No "Finish" on the banner — user should review their work in the workspace before finalizing

### Backend Changes

#### New Endpoint: Save Manual Draft

`POST /api/stories/{story_id}/evolution/save-draft`

Request body:
```json
{
  "title": "string",
  "content": "string"
}
```

Behavior:
- Finds active (non-terminal) session for the story
- Calculates next version number
- If session already has a `draft_version_id`, deletes the existing draft
- Creates new `StoryVersion` with `status="draft"`, `source="manual_edit"`
- Sets `session.draft_version_id` to new version
- Advances session phase to `"review"` if not already there
- Returns the created version

#### Modify `accept_session`

- Relax the phase check: allow acceptance from any non-terminal phase (not just `"review"`)
- When called with dirty content (via the Finish action's auto-save), the frontend saves the draft first, then calls accept
- Alternatively, accept could be called directly if a draft already exists regardless of phase

#### No Changes to Discard

`discard_active_session` already works correctly — restores base version and marks session discarded.

### Frontend Changes

#### `WorkspaceHeader.tsx`

- Rename "Save" → "Save draft"
- Add "Finish" button (enabled when session has a draft OR editor is dirty)
- Finish button shows confirmation dialog before proceeding

#### `EvolveWorkspace.tsx`

- `handleSave` → `handleSaveDraft`: calls new save-draft endpoint instead of `updateStory`
- New `handleFinish`: if isDirty, save draft first, then call `accept_session`, clear caches, navigate to story view
- Track whether session has a draft (from active evolution query or after save-draft response)

#### `EvolutionResumeBanner.tsx`

- Add "Discard" button alongside "Continue"
- Discard calls `discardActiveEvolution` with confirmation dialog
- On successful discard, invalidate story query to refresh content

#### `useEvolution.ts`

- Add `useSaveDraft` mutation hook
- Add `useAcceptEvolution` mutation hook (or verify existing one works)
- Update cache invalidation patterns

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Enter workspace, no changes, leave | Session stays active, banner shows. Discard from banner or workspace. |
| Save draft, more edits, click Finish | Auto-saves latest edits as new draft, then accepts. |
| AI rewrite, accept diff, click Finish | Draft already exists from AI. Finish promotes it directly. |
| AI rewrite, accept diff, manual edits, click Finish | Auto-saves manual edits as new draft (replacing AI draft), then accepts. |
| Navigate away with dirty editor | No prompt. Session stays active, user returns via banner. Unsaved content lost (same as today). |
| Multiple save-drafts in one session | Each replaces the previous draft. Only one draft per session at a time. |

### Files to Modify

**Backend:**
- `services/core-api/app/services/story_evolution.py` — add `save_manual_draft`, relax `accept_session` phase check
- `services/core-api/app/routes/story_evolution.py` — add save-draft endpoint

**Frontend:**
- `apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx` — rename Save, add Finish
- `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx` — handleSaveDraft, handleFinish
- `apps/web/src/features/story/components/EvolutionResumeBanner.tsx` — add Discard button
- `apps/web/src/features/story/components/StoryCreation.tsx` — pass discard handler to banner
- `apps/web/src/lib/hooks/useEvolution.ts` — add useSaveDraft mutation
- `apps/web/src/lib/api/evolution.ts` — add saveDraft API call
