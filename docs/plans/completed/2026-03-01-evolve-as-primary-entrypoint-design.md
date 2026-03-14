# Evolve Workspace as Primary Entrypoint

**Date:** 2026-03-01
**Status:** Approved
**Approach:** Big Bang Replacement (single feature branch)

## Summary

Make the Evolve Workspace the primary entrypoint for both creating new stories and editing existing stories. Replace the separate story creation form and inline edit mode with the workspace, which offers a richer experience including AI-assisted writing, context extraction, version management, and a Settings tool for metadata.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Story record creation | Create immediately on entry | All existing APIs work as-is; no local-only buffering needed |
| Legacy association | Auto-associate from context | User clicks "Add Story" from a legacy page; that legacy becomes the primary association |
| Visibility setting | Finish dialog + Settings tool | Finish dialog prompts when publishing; Settings tool allows changes anytime |
| Story view page | Keep as read-only, replace Edit with Evolve | Clean separation between reading and editing/evolving |
| Implementation strategy | Big Bang Replacement | Solo developer, move fast, no transition state needed |

## Section 1: New Story Entry Flow

1. User clicks "Add Story" from legacy profile (header button or stories section card)
2. Frontend calls `POST /api/stories/` with minimal payload:
   - `title: "Untitled Story - <localized date>"` (e.g., "Untitled Story - Mar 1, 2026")
   - `content: ""`
   - `visibility: "private"`
   - `legacies: [{ legacy_id: currentLegacyId, position: "primary" }]`
   - `status: "draft"`
3. API returns the new story with a `storyId`
4. Frontend navigates to `/legacy/:legacyId/story/:storyId/evolve`
5. Evolve workspace loads with the placeholder title (inline-editable)
6. Editor shows empty state with placeholder: *"Start writing your story, or open the AI chat to collaborate with a persona..."*

### Draft status behavior

- Stories with `status: "draft"` are hidden from public/shared story lists
- They appear in the author's view with a "Draft" badge
- "Finish" transitions status to `"published"`
- "Discard" on a draft-status story **deletes it entirely** (never published)

## Section 2: Evolve Workspace Adaptations

### Contextual AI labeling

- **Empty content:** Rewrite tool relabels to **"AI Writer"**, button says "Write Story", tool strip tooltip says "AI Writer"
- **Has content:** Stays as "Rewrite" with current behavior
- Same underlying API (`POST /api/stories/{storyId}/rewrite`)

### Editor placeholder

When content is empty: *"Start writing your story, or open the AI chat to collaborate with a persona..."*

### Conversation seed

For empty stories, the persona seed adapts — introduces itself and asks what story the user would like to tell (verify backend handles empty story content in seed context).

### Finish button changes

- **Draft stories:** "Finish" transitions `status` from `"draft"` to `"published"`, accepts evolution, navigates to story view
- **Published stories:** Same as current behavior
- Finish confirmation dialog includes **visibility picker** (defaults to current value or "private" for new)

### Discard button changes

- **Draft stories:** Warning: *"This will delete the story entirely since it hasn't been published yet."* Deletes the story record.
- **Published stories:** Same as current (discards session, reverts to last published state)

### New Settings tool panel

- **Icon:** Gear/cog
- **Position:** Bottom of tool strip
- **Contents:**
  - Visibility selector (public / private / personal) — 3-button toggle
  - Legacy associations — current legacy with add/remove capability
  - Story metadata (created date, last modified, word count)

## Section 3: Story View Page Changes

### Replace Edit with Evolve

- Remove "Edit Story" button (Pencil icon)
- Replace with **"Evolve"** button with pencil+sparkle or wand icon
- Hover tooltip: *"Edit and enhance your story with AI assistance"*

### Remove inline edit form

- `isViewMode` toggle removed — story view is purely a reading experience
- Author toolbar: Back, Evolve, History, Delete
- Non-author toolbar: Back (+ sharing/viewing controls)

### Evolution Resume Banner

Unchanged — continues to show Continue/Discard for active sessions.

### Draft stories in story list

- Show with "Draft" badge on legacy profile Stories section
- Only visible to author
- Clicking a draft goes to story view with a "Continue in Workspace" CTA

## Section 4: Backend API Changes

### Story model — new `status` field

- Add `status` column: `"draft"` | `"published"`
- Default: `"published"` (backward compatible — all existing stories unaffected)

### `POST /api/stories/` changes

- Accept optional `status` field in `CreateStoryInput` (defaults to `"published"`)
- Frontend sends `status: "draft"` for workspace-initiated creation

### `GET /api/stories/` (list) changes

- Exclude `"draft"` stories from non-author viewers
- Include drafts for authenticated author with `status` field in response

### Finish evolution — status transition

- `POST /api/stories/{storyId}/evolution/{sessionId}/accept` on a draft story: update `status` to `"published"`
- Accept optional `visibility` parameter for publish-time visibility setting

### Discard on draft stories

- `POST /api/stories/{storyId}/evolution/discard-active` on a `status: "draft"` story: **delete the story record**
- Return flag in response so frontend navigates to legacy page instead of story view

### Rewrite endpoint

No changes needed — empty content naturally triggers generation vs rewrite.

### Conversation seed

Verify behavior with empty story content. May need prompt adjustment so persona adapts opening for new stories.

## Section 5: Route & Navigation Changes

### Routes

| Route | Status | Purpose |
|-------|--------|---------|
| `/legacy/:legacyId/story/new` | **Removed** | No longer needed |
| `/legacy/:legacyId/story/:storyId` | Kept | Read-only story view |
| `/legacy/:legacyId/story/:storyId/evolve` | Kept | Evolve workspace (new + existing) |

### "Add Story" button flow

- `LegacyHeaderControls` and `StoriesSection` buttons call async handler:
  1. Create story via API
  2. Navigate to `/legacy/:legacyId/story/:storyId/evolve`
- Show loading state on button during API call

### Dead code removal

**Removed:**
- `/story/new` route definition
- `StoryEditForm` component
- Edit mode toggle (`isViewMode` state + "Edit Story" button)
- Story creation form page logic from `StoryCreation.tsx`

**Kept:**
- `StoryViewer` (read-only rendering)
- `StoryCreation.tsx` simplified to view-only + toolbar

**Added:**
- Settings tool in evolve workspace
- `status` field on stories (draft/published)
- Visibility picker in Finish dialog
- Contextual "AI Writer" / "Rewrite" labeling
- Auto-create story logic in "Add Story" handlers
