# Evolve Workspace as Primary Entrypoint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Evolve Workspace the single entrypoint for creating new stories and editing existing stories, replacing the separate creation form and inline edit mode.

**Architecture:** Add a `status` field (draft/published) to stories. "Add Story" auto-creates a draft story record and drops the user into the evolve workspace. The story view page becomes read-only with an "Evolve" button replacing "Edit Story". A new Settings tool in the workspace handles visibility and legacy associations. The Finish dialog transitions drafts to published.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), React + TypeScript + Zustand + TanStack Query (frontend), Vitest + pytest (tests)

---

## Task 1: Add `status` column to Story model + migration ✅ DONE

**Files:**
- Modify: `services/core-api/app/models/story.py:1-87`
- Create: `services/core-api/alembic/versions/XXXX_add_story_status.py`
- Modify: `services/core-api/app/schemas/story.py:13-40` (StoryCreate)
- Modify: `services/core-api/app/schemas/story.py:74-110` (StorySummary, StoryDetail)
- Test: `services/core-api/tests/test_story_service.py`

**Step 1: Write the failing test**

Add a test to `tests/test_story_service.py`:

```python
class TestCreateDraftStory:
    @pytest.mark.asyncio
    async def test_create_story_with_draft_status(
        self, db_session, test_user, test_legacy, auth_headers
    ):
        """Stories can be created with status='draft'."""
        from app.services.story import StoryService

        service = StoryService(db_session)
        story = await service.create_story(
            author_id=test_user.id,
            title="Untitled Story - Mar 1, 2026",
            content="",
            visibility="private",
            legacies=[{"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}],
            status="draft",
        )
        assert story.status == "draft"

    @pytest.mark.asyncio
    async def test_create_story_defaults_to_published(
        self, db_session, test_user, test_legacy, auth_headers
    ):
        """Stories default to status='published' when not specified."""
        from app.services.story import StoryService

        service = StoryService(db_session)
        story = await service.create_story(
            author_id=test_user.id,
            title="A real story",
            content="Some content",
            visibility="private",
            legacies=[{"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}],
        )
        assert story.status == "published"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/test_story_service.py::TestCreateDraftStory -v`
Expected: FAIL — `status` parameter not recognized

**Step 3: Add `status` column to Story model**

In `services/core-api/app/models/story.py`, add after the `visibility` column:

```python
status: Mapped[str] = mapped_column(
    String(20), nullable=False, default="published", index=True
)
```

**Step 4: Update StoryCreate schema**

In `services/core-api/app/schemas/story.py`, add to `StoryCreate`:

```python
status: Literal["draft", "published"] = "published"
```

**Step 5: Update StorySummary and StoryDetail schemas**

Add `status: str` field to both `StorySummary` and `StoryDetail` schemas.

**Step 6: Update StoryService.create_story**

In `services/core-api/app/services/story.py`, update the `create_story` method signature to accept `status: str = "published"` and pass it to the Story constructor.

**Step 7: Update the create story route**

In `services/core-api/app/routes/story.py`, pass `data.status` through to `service.create_story()`.

**Step 8: Create Alembic migration**

Run: `cd services/core-api && uv run alembic revision --autogenerate -m "add_story_status"`

Review the generated migration — it should add a `status` column with default `"published"` and an index.

**Step 9: Run test to verify it passes**

Run: `cd services/core-api && uv run pytest tests/test_story_service.py::TestCreateDraftStory -v`
Expected: PASS

**Step 10: Update create story content validation**

The current `StoryCreate` schema validates `content` with `min_length=1`. For draft stories, content can be empty. Update the validator:

```python
content: str = Field(default="", max_length=50000)
```

Add a model validator that enforces non-empty content only for published stories:

```python
@model_validator(mode="after")
def validate_content_for_published(self) -> "StoryCreate":
    if self.status == "published" and not self.content.strip():
        raise ValueError("Published stories must have content")
    return self
```

**Step 11: Run full backend validation**

Run: `cd services/core-api && just validate-backend`
Expected: All checks pass

**Step 12: Commit**

```bash
git add -A
git commit -m "feat(api): add status field to Story model (draft/published)"
```

---

## Task 2: Filter draft stories from list endpoints ✅ DONE

**Files:**
- Modify: `services/core-api/app/services/story.py` (list_legacy_stories method)
- Test: `services/core-api/tests/test_story_service.py`
- Test: `services/core-api/tests/test_story_api.py`

**Step 1: Write the failing test**

Add to `tests/test_story_service.py`:

```python
class TestDraftStoryVisibility:
    @pytest.mark.asyncio
    async def test_draft_stories_visible_to_author(
        self, db_session, test_user, test_legacy
    ):
        """Authors can see their own draft stories in the list."""
        from app.services.story import StoryService

        service = StoryService(db_session)
        draft = await service.create_story(
            author_id=test_user.id,
            title="Draft story",
            content="",
            visibility="private",
            legacies=[{"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}],
            status="draft",
        )
        stories = await service.list_legacy_stories(
            legacy_id=test_legacy.id, user_id=test_user.id
        )
        story_ids = [s.id for s in stories]
        assert draft.id in story_ids

    @pytest.mark.asyncio
    async def test_draft_stories_hidden_from_others(
        self, db_session, test_user, test_user_2, test_legacy
    ):
        """Other users cannot see draft stories."""
        from app.services.story import StoryService

        service = StoryService(db_session)
        draft = await service.create_story(
            author_id=test_user.id,
            title="Draft story",
            content="",
            visibility="private",
            legacies=[{"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}],
            status="draft",
        )
        # Make test_user_2 a member of test_legacy so they can see private stories
        # but still not drafts from other users
        stories = await service.list_legacy_stories(
            legacy_id=test_legacy.id, user_id=test_user_2.id
        )
        story_ids = [s.id for s in stories]
        assert draft.id not in story_ids
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/test_story_service.py::TestDraftStoryVisibility -v`
Expected: FAIL — draft stories currently appear for everyone

**Step 3: Update list query to filter drafts**

In `services/core-api/app/services/story.py`, in the `list_legacy_stories` method, add a filter condition: exclude stories where `status='draft'` AND `author_id != current_user_id`. Author's own drafts remain visible.

```python
# After existing visibility filters, add:
query = query.where(
    or_(
        Story.status == "published",
        Story.author_id == user_id,  # Author sees their own drafts
    )
)
```

**Step 4: Run test to verify it passes**

Run: `cd services/core-api && uv run pytest tests/test_story_service.py::TestDraftStoryVisibility -v`
Expected: PASS

**Step 5: Run full test suite + validation**

Run: `cd services/core-api && uv run pytest && just validate-backend`
Expected: All pass

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): filter draft stories from non-author list views"
```

---

## Task 3: Update evolution accept to transition draft → published + accept visibility ✅ DONE

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:717-782` (accept_session)
- Modify: `services/core-api/app/routes/story_evolution.py:189-207` (accept route)
- Modify: `services/core-api/app/schemas/story_evolution.py` (add AcceptRequest schema)
- Test: `services/core-api/tests/services/test_story_evolution_service.py`

**Step 1: Write the failing test**

Add to `tests/services/test_story_evolution_service.py`:

```python
class TestAcceptSessionDraftTransition:
    @pytest.mark.asyncio
    async def test_accept_transitions_draft_to_published(self, db_session, test_story_with_evolution):
        """Accepting a session on a draft story transitions status to published."""
        story, session = test_story_with_evolution
        # Set story to draft status
        story.status = "draft"
        await db_session.flush()

        service = StoryEvolutionService(db_session)
        # Ensure there's a draft version to accept
        await service.save_draft(
            story_id=story.id,
            user_id=story.author_id,
            title="My Story",
            content="Final content",
        )
        result = await service.accept_session(
            story_id=story.id,
            session_id=session.id,
            user_id=story.author_id,
            visibility="public",
        )
        await db_session.refresh(story)
        assert story.status == "published"
        assert story.visibility == "public"

    @pytest.mark.asyncio
    async def test_accept_with_visibility_updates_story(self, db_session, test_story_with_evolution):
        """Accepting with visibility param updates the story visibility."""
        story, session = test_story_with_evolution

        service = StoryEvolutionService(db_session)
        await service.save_draft(
            story_id=story.id,
            user_id=story.author_id,
            title="My Story",
            content="Final content",
        )
        await service.accept_session(
            story_id=story.id,
            session_id=session.id,
            user_id=story.author_id,
            visibility="personal",
        )
        await db_session.refresh(story)
        assert story.visibility == "personal"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestAcceptSessionDraftTransition -v`
Expected: FAIL — accept_session doesn't accept `visibility` param

**Step 3: Create AcceptEvolutionRequest schema**

In `services/core-api/app/schemas/story_evolution.py`:

```python
class AcceptEvolutionRequest(BaseModel):
    visibility: Literal["public", "private", "personal"] | None = None
```

**Step 4: Update accept_session service method**

In `services/core-api/app/services/story_evolution.py`, update `accept_session` to accept `visibility: str | None = None`. After promoting the draft:

```python
# Transition draft → published
if story.status == "draft":
    story.status = "published"

# Update visibility if provided
if visibility is not None:
    story.visibility = visibility
```

**Step 5: Update accept route to pass visibility**

In `services/core-api/app/routes/story_evolution.py`, update the accept endpoint to accept the request body and pass `visibility` to the service.

**Step 6: Run test to verify it passes**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestAcceptSessionDraftTransition -v`
Expected: PASS

**Step 7: Run full validation**

Run: `cd services/core-api && uv run pytest && just validate-backend`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): accept evolution transitions draft to published with optional visibility"
```

---

## Task 4: Update evolution discard to delete draft stories ✅ DONE

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py` (discard_session, discard_active_session)
- Modify: `services/core-api/app/schemas/story_evolution.py` (update response)
- Test: `services/core-api/tests/services/test_story_evolution_service.py`

**Step 1: Write the failing test**

```python
class TestDiscardDraftStory:
    @pytest.mark.asyncio
    async def test_discard_deletes_draft_story(self, db_session, test_story_with_evolution):
        """Discarding an evolution session on a draft story deletes the story."""
        from app.models.story import Story

        story, session = test_story_with_evolution
        story.status = "draft"
        story_id = story.id
        await db_session.flush()

        service = StoryEvolutionService(db_session)
        result = await service.discard_active_session(
            story_id=story_id,
            user_id=story.author_id,
        )
        assert result is not None
        assert result.get("story_deleted") is True

        # Verify story is actually deleted
        deleted = await db_session.get(Story, story_id)
        assert deleted is None

    @pytest.mark.asyncio
    async def test_discard_preserves_published_story(self, db_session, test_story_with_evolution):
        """Discarding a session on a published story does not delete it."""
        from app.models.story import Story

        story, session = test_story_with_evolution
        story_id = story.id
        assert story.status == "published"

        service = StoryEvolutionService(db_session)
        result = await service.discard_active_session(
            story_id=story_id,
            user_id=story.author_id,
        )
        preserved = await db_session.get(Story, story_id)
        assert preserved is not None
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestDiscardDraftStory -v`
Expected: FAIL

**Step 3: Update discard logic**

In `services/core-api/app/services/story_evolution.py`, in both `discard_session` and `discard_active_session`, after the existing discard logic:

```python
# If story was a draft (never published), delete it entirely
story_deleted = False
if story.status == "draft":
    await db.delete(story)
    story_deleted = True
```

Update the return type/response to include `story_deleted: bool` so the frontend knows to navigate differently. Add `story_deleted` field to `EvolutionSessionResponse` or return a dict with this flag.

**Step 4: Update the discard-active route response**

In `services/core-api/app/routes/story_evolution.py`, update the discard-active endpoint to return the `story_deleted` flag.

**Step 5: Run test to verify it passes**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestDiscardDraftStory -v`
Expected: PASS

**Step 6: Run full validation**

Run: `cd services/core-api && uv run pytest && just validate-backend`

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): discard evolution deletes draft stories entirely"
```

---

## Task 5: Frontend — Update types and API for story status ✅ DONE

**Files:**
- Modify: `apps/web/src/features/story/api/stories.ts:45-50` (CreateStoryInput)
- Modify: `apps/web/src/features/story/api/stories.ts` (StoryDetail/StorySummary types if defined here)
- Modify: `apps/web/src/lib/api/evolution.ts:119-126` (acceptEvolution)

**Step 1: Update CreateStoryInput**

In `apps/web/src/features/story/api/stories.ts`:

```typescript
export interface CreateStoryInput {
  legacies: LegacyAssociationInput[];
  title: string;
  content: string;
  visibility?: 'public' | 'private' | 'personal';
  status?: 'draft' | 'published';
}
```

**Step 2: Update story response types**

Add `status: 'draft' | 'published'` to `StorySummary` and `StoryDetail` types (or wherever the response types are defined).

**Step 3: Update acceptEvolution to accept visibility**

In `apps/web/src/lib/api/evolution.ts`:

```typescript
export function acceptEvolution(
  storyId: string,
  sessionId: string,
  options?: { visibility?: 'public' | 'private' | 'personal' }
): Promise<EvolutionSession> {
  return apiPost(
    `/api/stories/${storyId}/evolution/${sessionId}/accept`,
    options ?? {}
  );
}
```

**Step 4: Update discardActiveEvolution response type**

The response now includes `story_deleted: boolean`. Update the type accordingly.

**Step 5: Run frontend type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): update story API types for draft status and accept visibility"
```

---

## Task 6: Frontend — Wire "Add Story" to auto-create draft + navigate to evolve ✅ DONE

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyHeaderControls.tsx:57-60`
- Modify: `apps/web/src/features/legacy/components/StoriesSection.tsx:54-67`
- Modify: parent component that provides `onAddStory` callback (find where it's wired)
- Modify: `apps/web/src/routes/index.tsx:127-132` (remove /story/new route)

**Step 1: Find where onAddStory is wired**

Search for where `onAddStory` is passed to `LegacyHeaderControls` and `StoriesSection`. It likely navigates to `/legacy/:legacyId/story/new`. Replace that with an async handler that:

1. Calls `createStory()` with draft payload
2. Navigates to `/legacy/:legacyId/story/:newStoryId/evolve`

```typescript
const createStoryMutation = useCreateStory();

const handleAddStory = useCallback(async () => {
  try {
    const title = `Untitled Story - ${new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
    const newStory = await createStoryMutation.mutateAsync({
      title,
      content: '',
      visibility: 'private',
      status: 'draft',
      legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
    });
    navigate(`/legacy/${legacyId}/story/${newStory.id}/evolve`);
  } catch (err) {
    console.error('Failed to create story:', err);
    // Show toast/error
  }
}, [legacyId, createStoryMutation, navigate]);
```

**Step 2: Add loading state to buttons**

Pass `isCreating` state to the "Add Story" buttons so they show a spinner during the API call:

```typescript
<Button
  size="sm"
  onClick={handleAddStory}
  disabled={createStoryMutation.isPending}
>
  {createStoryMutation.isPending ? (
    <Loader2 className="size-4 mr-2 animate-spin" />
  ) : (
    <Plus className="size-4 mr-2" />
  )}
  <span className="hidden sm:inline">Add Story</span>
</Button>
```

**Step 3: Remove /story/new route**

In `apps/web/src/routes/index.tsx`, remove the route definition for `legacy/:legacyId/story/new` (lines 127-132).

**Step 4: Test manually**

Verify clicking "Add Story" creates a draft and lands in the evolve workspace with the placeholder title.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): wire Add Story to auto-create draft and open evolve workspace"
```

---

## Task 7: Frontend — Replace "Edit Story" with "Evolve" on story view page ✅ DONE

**Files:**
- Modify: `apps/web/src/features/story/components/StoryToolbar.tsx:59-85`
- Modify: `apps/web/src/features/story/components/StoryCreation.tsx`

**Step 1: Update StoryToolbar**

Remove the "Edit Story" button (lines 59-68). Update the "Evolve Story" button to be the primary action:

```typescript
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
```

Change variant from `"outline"` to default (primary button styling). Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from the UI library.

Remove `onEditClick` prop from the component interface.

**Step 2: Simplify StoryCreation — remove edit mode**

In `apps/web/src/features/story/components/StoryCreation.tsx`:

- Remove `isViewMode` state and all toggle logic
- Remove `handleEditClick` and `handleCancelEdit` functions
- Remove the conditional rendering that shows `StoryEditForm`
- Always render `StoryViewer` for existing stories
- Remove `onEditClick` from StoryToolbar usage
- Keep the new story guard: if no `storyId`, redirect to legacy page (since creation now goes through evolve)

**Step 3: Add draft story CTA**

For draft stories displayed on the view page, show a prominent call-to-action:

```typescript
{story?.status === 'draft' && (
  <Card className="border-amber-200 bg-amber-50 p-4 text-center">
    <p className="text-sm text-amber-800 mb-2">This story is still a draft.</p>
    <Button size="sm" onClick={handleNavigateToEvolve}>
      <Sparkles className="size-4 mr-2" />
      Continue in Workspace
    </Button>
  </Card>
)}
```

**Step 4: Run lint and type check**

Run: `cd apps/web && npm run lint && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): replace Edit Story with Evolve button on story view page"
```

---

## Task 8: Frontend — Add Settings tool to evolve workspace ✅ DONE

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/SettingsTool.tsx`
- Modify: `apps/web/src/features/evolve-workspace/components/ToolStrip.tsx:6-18`
- Modify: `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx`
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts` (add 'settings' to ToolId)
- Modify: `apps/web/src/features/evolve-workspace/components/MobileBottomBar.tsx` (if exists)

**Step 1: Add 'settings' to ToolId type**

In the store file or wherever `ToolId` is defined, add `'settings'` to the union type.

**Step 2: Add Settings to ToolStrip**

In `ToolStrip.tsx`, add Settings to the REFERENCE_TOOLS array:

```typescript
import { Settings } from 'lucide-react';

const REFERENCE_TOOLS = [
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];
```

**Step 3: Create SettingsTool component**

Create `apps/web/src/features/evolve-workspace/tools/SettingsTool.tsx`:

```typescript
// SettingsTool provides:
// 1. Visibility selector (public / private / personal) — 3-button toggle
// 2. Legacy associations — current legacy with ability to add/remove
// 3. Story metadata display (created date, last modified, word count)

interface SettingsToolProps {
  storyId: string;
  legacyId: string;
  visibility: 'public' | 'private' | 'personal';
  onVisibilityChange: (v: 'public' | 'private' | 'personal') => void;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}
```

The component should:
- Show a "Visibility" section with 3 toggle buttons (same styling as old StoryEditForm)
- Show a "Legacies" section with the current legacy chip and a way to manage associations (reuse LegacyMultiSelect or a simplified version)
- Show a "Details" section with word count (computed from `content`), created/modified dates

**Step 4: Wire SettingsTool into ToolPanel**

In `ToolPanel.tsx`, add the settings case to render `SettingsTool` when `activeTool === 'settings'`.

**Step 5: Wire visibility changes to the story API**

When the user changes visibility in the Settings tool, call `updateStory({ storyId, data: { visibility } })` to persist it immediately.

**Step 6: Update MobileBottomBar**

Add the settings icon to the mobile bottom bar tool list.

**Step 7: Run lint and type check**

Run: `cd apps/web && npm run lint && npx tsc --noEmit`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): add Settings tool to evolve workspace with visibility and legacy management"
```

---

## Task 9: Frontend — Update Finish dialog with visibility picker ✅ DONE

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx:188-213`
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx:133-157` (handleFinish)

**Step 1: Add visibility picker to Finish dialog**

In `WorkspaceHeader.tsx`, update the Finish `AlertDialogContent`:

```typescript
<AlertDialogContent>
  <AlertDialogHeader>
    <AlertDialogTitle>Publish this version?</AlertDialogTitle>
    <AlertDialogDescription>
      This will replace the current story with your edited version and close the
      evolution session.
    </AlertDialogDescription>
  </AlertDialogHeader>

  {/* Visibility picker — show for all stories, highlight for drafts */}
  <div className="space-y-2 py-2">
    <label className="text-sm font-medium">Visibility</label>
    <div className="flex gap-2">
      {(['public', 'private', 'personal'] as const).map((v) => (
        <Button
          key={v}
          variant={finishVisibility === v ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFinishVisibility(v)}
        >
          {v === 'public' ? 'Public' : v === 'private' ? 'Members Only' : 'Personal'}
        </Button>
      ))}
    </div>
  </div>

  <AlertDialogFooter>
    <AlertDialogCancel>Cancel</AlertDialogCancel>
    <AlertDialogAction onClick={() => onFinish(finishVisibility)}>
      Publish
    </AlertDialogAction>
  </AlertDialogFooter>
</AlertDialogContent>
```

Add local state `finishVisibility` initialized from the current story visibility prop.

**Step 2: Update onFinish to accept and pass visibility**

Update `handleFinish` in `EvolveWorkspace.tsx`:

```typescript
const handleFinish = useCallback(async (visibility?: string) => {
  // ... existing auto-save logic ...
  await acceptEvolution(storyId, sessionId, { visibility });
  // ... existing cleanup ...
}, [/* deps */]);
```

**Step 3: Run lint and type check**

Run: `cd apps/web && npm run lint && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): add visibility picker to Finish confirmation dialog"
```

---

## Task 10: Frontend — Update Discard behavior for draft stories ✅ DONE

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx:143-174`
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx:214-238` (handleDiscard)

**Step 1: Make discard dialog contextual**

In `WorkspaceHeader.tsx`, accept a `isDraftStory` prop. Update the discard dialog text:

```typescript
<AlertDialogTitle>
  {isDraftStory ? 'Delete this story?' : 'Discard this evolution session?'}
</AlertDialogTitle>
<AlertDialogDescription>
  {isDraftStory
    ? 'This story has never been published. Discarding will delete it permanently. This action cannot be undone.'
    : 'This will discard the session and any unsaved changes. The original story will be unchanged. This action cannot be undone.'}
</AlertDialogDescription>
```

Update the action button label:

```typescript
<AlertDialogAction ...>
  {isDraftStory ? 'Delete story' : 'Discard session'}
</AlertDialogAction>
```

**Step 2: Update handleDiscard navigation**

In `EvolveWorkspace.tsx`, update `handleDiscard`:

```typescript
const handleDiscard = useCallback(async () => {
  // ... existing abort + discard logic ...
  const result = await discardActiveEvolution(storyId);

  // ... existing cache cleanup ...

  // Navigate: if story was deleted (draft), go to legacy page; otherwise story page
  if (result?.story_deleted) {
    navigate(`/legacy/${legacyId}`);
  } else {
    navigate(`/legacy/${legacyId}/story/${storyId}`);
  }
}, [/* deps */]);
```

**Step 3: Pass isDraftStory to WorkspaceHeader**

Derive from the story data: `isDraftStory={story?.status === 'draft'}`.

**Step 4: Run lint and type check**

Run: `cd apps/web && npm run lint && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): update discard to delete draft stories and navigate to legacy page"
```

---

## Task 11: Frontend — Contextual "AI Writer" / "Rewrite" labeling ✅ DONE

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/tools/RewriteTool.tsx:88-90, 240-257`
- Modify: `apps/web/src/features/evolve-workspace/components/ToolStrip.tsx`
- Modify: `apps/web/src/features/evolve-workspace/components/EditorPanel.tsx` (placeholder)

**Step 1: Update RewriteTool button label**

In `RewriteTool.tsx`, accept a `hasContent` prop or derive it from the content prop. Update the button:

```typescript
const actionLabel = isReviewing
  ? 'Regenerate'
  : hasContent
    ? 'Rewrite Story'
    : 'Write Story';
```

Update the `aria-label` and displayed text accordingly.

**Step 2: Update ToolStrip label**

In `ToolStrip.tsx`, make the Rewrite tool label dynamic. Pass content state or a boolean to determine the label:

```typescript
const REWRITE_TOOL = {
  id: 'rewrite' as ToolId,
  icon: Sparkles,
  label: hasContent ? 'Rewrite' : 'AI Writer',
};
```

This requires `ToolStrip` to accept a `hasContent` prop or read from a shared store.

**Step 3: Update editor placeholder**

In the `EditorPanel` or `EvolveWorkspace`, pass a contextual placeholder to `StoryEditor`:

```typescript
placeholder="Start writing your story, or open the AI chat to collaborate with a persona..."
```

**Step 4: Run lint and type check**

Run: `cd apps/web && npm run lint && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): contextual AI Writer vs Rewrite labeling based on story content"
```

---

## Task 12: Frontend — Draft badge in story list ✅ DONE

**Files:**
- Modify: `apps/web/src/features/legacy/components/StoriesSection.tsx` or the story card component
- Modify: `apps/web/src/features/story/components/StoryCard.tsx` (if exists, or wherever story cards render)

**Step 1: Add draft badge to story cards**

Find the component that renders story cards in the legacy stories list. Add a "Draft" badge when `story.status === 'draft'`:

```typescript
{story.status === 'draft' && (
  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
    Draft
  </span>
)}
```

**Step 2: Run lint and type check**

Run: `cd apps/web && npm run lint && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(web): show Draft badge on story cards for unpublished stories"
```

---

## Task 13: Clean up dead code ✅ DONE

**Files:**
- Delete: `apps/web/src/features/story/components/StoryEditForm.tsx`
- Modify: `apps/web/src/features/story/components/StoryCreation.tsx` (remove StoryEditForm import)
- Clean up any unused imports, props, or types related to the old edit flow

**Step 1: Remove StoryEditForm**

Delete the file entirely. Remove all imports of it.

**Step 2: Clean up StoryCreation**

Remove any remaining edit-mode state, handlers, and conditional rendering that references `StoryEditForm`.

**Step 3: Remove unused props from StoryToolbar**

Remove `onEditClick` prop and any related types/interfaces.

**Step 4: Search for dead references**

Search the codebase for any remaining references to:
- `StoryEditForm`
- `isViewMode` (in story context)
- `/story/new` path strings
- `onEditClick`

Remove all found references.

**Step 5: Run full frontend checks**

Run: `cd apps/web && npm run lint && npx tsc --noEmit && npm run test`

**Step 6: Run full backend validation**

Run: `cd services/core-api && just validate-backend`

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor(web): remove dead code from old story creation and edit flows"
```

---

## Task 14: Final integration test ✅ DONE

**Step 1: Start local environment**

Run: `docker compose -f infra/compose/docker-compose.yml up -d`

**Step 2: Run database migration**

Run: `cd services/core-api && uv run alembic upgrade head`

**Step 3: Run full backend test suite**

Run: `cd services/core-api && uv run pytest -v`

**Step 4: Run full frontend test suite**

Run: `cd apps/web && npm run test`

**Step 5: Run frontend build**

Run: `cd apps/web && npm run build`

**Step 6: Manual smoke test**

Verify these flows work end-to-end:
1. Click "Add Story" → draft created → lands in evolve workspace with "Untitled Story - <date>"
2. Edit title inline → saved
3. Type content manually → Save Draft works
4. AI Chat opens and persona seeds correctly for empty story
5. "AI Writer" label shown (not "Rewrite") when content empty
6. After adding content, label changes to "Rewrite"
7. Settings tool shows visibility and legacy controls
8. Finish → visibility picker → story published → view page shows story
9. Create another draft → Discard → story deleted → back on legacy page
10. Existing published stories → "Evolve" button (not "Edit") → workspace works normally
11. Draft stories show "Draft" badge in story list
12. Draft story view page shows "Continue in Workspace" CTA

**Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration test findings"
```
