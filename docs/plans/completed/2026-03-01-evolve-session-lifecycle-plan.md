# Evolve Session Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken evolution session lifecycle so manual edits create versioned drafts, sessions end explicitly via Finish/Discard, and the story view banner offers both Continue and Discard.

**Architecture:** Add a REST endpoint for saving manual drafts (reusing the existing `save_draft` service function with a configurable `source`). Relax `accept_session` to work from any non-terminal phase. On the frontend, replace the Save button with Save draft + Finish, and enhance the resume banner with a Discard action.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), TanStack Query, Zustand, Vitest

---

### Task 1: Backend — Add `source` parameter to `save_draft`

The existing `save_draft` function hardcodes `source="story_evolution"`. Add an optional `source` parameter so manual edits can use `source="manual_edit"`.

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:902-946`
- Test: `services/core-api/tests/services/test_story_evolution_service.py`

**Step 1: Write the failing test**

Add to `test_story_evolution_service.py`:

```python
class TestSaveDraft:
    @pytest.mark.asyncio
    async def test_save_draft_manual_edit_source(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        draft = await evolution_service.save_draft(
            db=db_session,
            session=session,
            title="Updated Title",
            content="Updated content from manual edit",
            user_id=test_user.id,
            source="manual_edit",
        )

        assert draft.source == "manual_edit"
        assert draft.status == "draft"
        assert session.phase == "review"
        assert session.draft_version_id == draft.id
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestSaveDraft::test_save_draft_manual_edit_source -v`

Expected: FAIL — `save_draft()` does not accept a `source` parameter.

**Step 3: Write minimal implementation**

In `services/core-api/app/services/story_evolution.py`, modify `save_draft` (line 902):

```python
async def save_draft(
    db: AsyncSession,
    session: StoryEvolutionSession,
    title: str,
    content: str,
    user_id: uuid.UUID,
    source: str = "story_evolution",
) -> StoryVersion:
    """Create or replace the draft StoryVersion for this session."""
    # ... existing code ...

    draft = StoryVersion(
        story_id=session.story_id,
        version_number=max_version + 1,
        title=title,
        content=content,
        status="draft",
        source=source,  # was hardcoded "story_evolution"
        created_by=user_id,
    )
    # ... rest unchanged ...
```

**Step 4: Run test to verify it passes**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestSaveDraft -v`

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/story_evolution.py services/core-api/tests/services/test_story_evolution_service.py
git commit -m "feat(evolution): add source parameter to save_draft for manual edits"
```

---

### Task 2: Backend — Add `SaveDraftRequest` schema

**Files:**
- Modify: `services/core-api/app/schemas/story_evolution.py`

**Step 1: Add the schema**

Add after `RevisionRequest` (line 67) in `services/core-api/app/schemas/story_evolution.py`:

```python
class SaveDraftRequest(BaseModel):
    """Request to save a manual edit as a draft version."""

    title: str
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            msg = "Draft content cannot be empty"
            raise ValueError(msg)
        return v
```

**Step 2: Commit**

```bash
git add services/core-api/app/schemas/story_evolution.py
git commit -m "feat(evolution): add SaveDraftRequest schema"
```

---

### Task 3: Backend — Add save-draft REST endpoint

**Files:**
- Modify: `services/core-api/app/routes/story_evolution.py`
- Test: `services/core-api/tests/routes/test_story_evolution_routes.py`

**Step 1: Write the failing test**

Add to `test_story_evolution_routes.py`:

```python
class TestSaveManualDraft:
    @pytest.mark.asyncio
    async def test_save_manual_draft_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_with_evolution: Story,
    ) -> None:
        story = test_story_with_evolution
        response = await client.post(
            f"/api/stories/{story.id}/evolution/save-draft",
            json={"title": "Edited Title", "content": "Manually edited content"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "draft"
        assert data["source"] == "manual_edit"

    @pytest.mark.asyncio
    async def test_save_manual_draft_no_active_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/save-draft",
            json={"title": "Title", "content": "Content"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_save_manual_draft_empty_content(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_with_evolution: Story,
    ) -> None:
        story = test_story_with_evolution
        response = await client.post(
            f"/api/stories/{story.id}/evolution/save-draft",
            json={"title": "Title", "content": "   "},
            headers=auth_headers,
        )
        assert response.status_code == 422
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/routes/test_story_evolution_routes.py::TestSaveManualDraft -v`

Expected: FAIL — endpoint does not exist.

**Step 3: Write the route**

Add to `services/core-api/app/routes/story_evolution.py` after the `discard_active_session` route (line 151). Import `SaveDraftRequest` from schemas and `StoryVersionDetail` from story_version schemas.

```python
from app.schemas.story_evolution import (
    # ... existing imports ...
    SaveDraftRequest,
)
from app.schemas.story_version import StoryVersionDetail


@router.post(
    "/save-draft",
    response_model=StoryVersionDetail,
)
async def save_manual_draft(
    story_id: UUID,
    data: SaveDraftRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryVersionDetail:
    """Save the current editor content as a draft version.

    Creates or replaces the draft StoryVersion for the active evolution
    session.  Advances the session to the ``review`` phase so the user
    can then Finish (accept) the session.
    """
    session_data = require_auth(request)

    evo_session = await evolution_service.get_active_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    if not evo_session:
        raise HTTPException(status_code=404, detail="No active evolution session")

    draft = await evolution_service.save_draft(
        db=db,
        session=evo_session,
        title=data.title,
        content=data.content,
        user_id=session_data.user_id,
        source="manual_edit",
    )

    return StoryVersionDetail.model_validate(draft)
```

Note: The route path is `/save-draft` (no session ID). It uses `get_active_session` to find the current session, matching the pattern used by `discard-active`. This is important because the frontend workspace may not have the session ID.

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/routes/test_story_evolution_routes.py::TestSaveManualDraft -v`

Expected: PASS

**Step 5: Validate backend**

Run: `just validate-backend`

Expected: All checks pass (ruff + mypy).

**Step 6: Commit**

```bash
git add services/core-api/app/routes/story_evolution.py services/core-api/app/schemas/story_evolution.py services/core-api/tests/routes/test_story_evolution_routes.py
git commit -m "feat(evolution): add save-draft endpoint for manual edits"
```

---

### Task 4: Backend — Relax `accept_session` phase check

Currently `accept_session` requires `phase == "review"`. While `save_draft` always advances to review, relaxing this to "any non-terminal phase with a draft" makes the system more robust.

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:717-782`
- Test: `services/core-api/tests/services/test_story_evolution_service.py`

**Step 1: Write the failing test**

```python
class TestAcceptSession:
    @pytest.mark.asyncio
    async def test_accept_session_requires_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Accept should fail if no draft exists, regardless of phase."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )
        # Session is in elicitation, no draft
        with pytest.raises(HTTPException) as exc:
            await evolution_service.accept_session(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 422
        assert "No draft" in exc.value.detail
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestAcceptSession::test_accept_session_requires_draft -v`

Expected: FAIL — currently raises "Can only accept from review phase" (phase check fires before draft check).

**Step 3: Modify `accept_session`**

In `services/core-api/app/services/story_evolution.py`, replace lines 726-736:

```python
async def accept_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Accept the draft and complete the session."""
    session = await _get_session(db, session_id, story_id, user_id)

    if session.is_terminal:
        raise HTTPException(
            status_code=422,
            detail="Cannot accept a session that is already terminal",
        )

    if not session.draft_version_id:
        raise HTTPException(
            status_code=422,
            detail="No draft to accept — save a draft first",
        )

    # ... rest of the function unchanged from line 738 onwards ...
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestAcceptSession -v`

Expected: PASS

**Step 5: Validate backend**

Run: `just validate-backend`

**Step 6: Commit**

```bash
git add services/core-api/app/services/story_evolution.py services/core-api/tests/services/test_story_evolution_service.py
git commit -m "feat(evolution): relax accept_session to work from any non-terminal phase"
```

---

### Task 5: Frontend — Add `saveManualDraft` API function

**Files:**
- Modify: `apps/web/src/lib/api/evolution.ts`

**Step 1: Add the API function**

Add after `acceptEvolution` (line 126) in `apps/web/src/lib/api/evolution.ts`:

```typescript
export interface SaveDraftRequest {
  title: string;
  content: string;
}

export interface SaveDraftResponse {
  id: string;
  version_number: number;
  title: string;
  content: string;
  status: string;
  source: string;
}

export function saveManualDraft(
  storyId: string,
  data: SaveDraftRequest
): Promise<SaveDraftResponse> {
  return apiPost(`/api/stories/${storyId}/evolution/save-draft`, data);
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api/evolution.ts
git commit -m "feat(evolution): add saveManualDraft API function"
```

---

### Task 6: Frontend — Add `useSaveManualDraft` and `useFinishEvolution` hooks

**Files:**
- Modify: `apps/web/src/lib/hooks/useEvolution.ts`

**Step 1: Add the hooks**

Add to `apps/web/src/lib/hooks/useEvolution.ts`. Import `saveManualDraft` and `acceptEvolution` from the API module (acceptEvolution is already imported).

```typescript
import {
  // ... existing imports ...
  saveManualDraft,
  type SaveDraftRequest,
} from '@/lib/api/evolution';

export function useSaveManualDraft(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SaveDraftRequest) => saveManualDraft(storyId, data),
    onSuccess: () => {
      // Refetch active evolution to get updated phase + draft_version_id
      queryClient.invalidateQueries({
        queryKey: evolutionKeys.active(storyId),
      });
    },
  });
}

export function useFinishEvolution(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId }: { sessionId: string }) =>
      acceptEvolution(storyId, sessionId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: evolutionKeys.all });
      queryClient.invalidateQueries({
        queryKey: storyKeys.detail(storyId),
      });
    },
  });
}
```

Note: `useFinishEvolution` is functionally identical to `useAcceptEvolution` but with a clearer name for the UI context. If you prefer, you can simply reuse `useAcceptEvolution` directly in the workspace. The key difference is that the workspace needs to pass `sessionId` dynamically (from the active evolution query), while `useAcceptEvolution` takes it as a hook parameter. Adjust the approach based on which is cleaner — passing sessionId at call time is more flexible for the workspace where the session may load asynchronously.

**Step 2: Commit**

```bash
git add apps/web/src/lib/hooks/useEvolution.ts
git commit -m "feat(evolution): add useSaveManualDraft and useFinishEvolution hooks"
```

---

### Task 7: Frontend — Update `WorkspaceHeader`

Replace Save with Save draft, add Finish button with confirmation dialog.

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx`

**Step 1: Update the component**

```typescript
import { ArrowLeft, Save, Trash2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface WorkspaceHeaderProps {
  legacyId: string;
  storyId: string;
  title: string;
  isSaving: boolean;
  isDirty: boolean;
  isDiscarding: boolean;
  isFinishing: boolean;
  hasDraft: boolean;
  onSaveDraft: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}

export function WorkspaceHeader({
  legacyId,
  storyId,
  title,
  isSaving,
  isDirty,
  isDiscarding,
  isFinishing,
  hasDraft,
  onSaveDraft,
  onFinish,
  onDiscard,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();

  const canFinish = hasDraft || isDirty;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to story
        </Button>
        <h1 className="text-sm font-medium text-neutral-700 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">
          {isSaving
            ? 'Saving...'
            : isFinishing
              ? 'Publishing...'
              : isDirty
                ? 'Unsaved changes'
                : 'Saved'}
        </span>

        {/* Discard session */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isDiscarding || isSaving || isFinishing}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Discard session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this evolution session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard the session and any unsaved changes. The original story will be
                unchanged. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDiscard}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Discard session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Save draft */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          disabled={isSaving || !isDirty || isFinishing}
        >
          <Save className="h-4 w-4 mr-1" />
          Save draft
        </Button>

        {/* Finish */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={!canFinish || isSaving || isDiscarding || isFinishing}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Finish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish this version?</AlertDialogTitle>
              <AlertDialogDescription>
                This will replace the current story with your edited version and close the evolution
                session.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onFinish}>
                Publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx
git commit -m "feat(evolve): replace Save with Save draft + Finish in WorkspaceHeader"
```

---

### Task 8: Frontend — Update `EvolveWorkspace` handlers

Wire up `handleSaveDraft` and `handleFinish` in the main workspace component.

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`

**Step 1: Update the component**

Key changes to `EvolveWorkspace.tsx`:

1. Replace `useUpdateStory` with `useSaveManualDraft`
2. Add `useFinishEvolution` hook
3. Add `useActiveEvolution` query to track session state (for `hasDraft` and `sessionId`)
4. Replace `handleSave` with `handleSaveDraft`
5. Add `handleFinish` (auto-saves draft if dirty, then accepts)
6. Update `WorkspaceHeader` props

```typescript
// Add imports
import { useActiveEvolution, useSaveManualDraft } from '@/lib/hooks/useEvolution';
import { acceptEvolution } from '@/lib/api/evolution';

// Inside the component, replace useUpdateStory:
const saveDraft = useSaveManualDraft(storyId);
const { data: activeEvolution } = useActiveEvolution(storyId);

// Derive hasDraft from active evolution session
const hasDraft = !!activeEvolution?.draft_version_id;
const sessionId = activeEvolution?.id;

// Add isFinishing state
const [isFinishing, setIsFinishing] = useState(false);

// Replace handleSave with handleSaveDraft
const handleSaveDraft = useCallback(async () => {
  if (!story) return;
  await saveDraft.mutateAsync({
    title: story.title,
    content,
  });
  setIsDirty(false);
}, [story, content, saveDraft]);

// Add handleFinish
const handleFinish = useCallback(async () => {
  if (!sessionId || !story) return;
  setIsFinishing(true);
  try {
    // Auto-save draft if there are unsaved changes
    if (isDirty) {
      await saveDraft.mutateAsync({
        title: story.title,
        content,
      });
      setIsDirty(false);
    }
    // Accept the session (promotes draft to active, completes session)
    await acceptEvolution(storyId, sessionId);
    // Clear caches
    queryClient.removeQueries({ queryKey: evolutionKeys.all });
    await queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    resetAllStores();
    navigate(`/legacy/${legacyId}/story/${storyId}`);
  } catch (err) {
    console.error('Failed to finish evolution session:', err);
  } finally {
    setIsFinishing(false);
  }
}, [sessionId, story, isDirty, content, storyId, legacyId, saveDraft, queryClient, navigate]);

// Update WorkspaceHeader usage:
<WorkspaceHeader
  legacyId={legacyId}
  storyId={storyId}
  title={story?.title ?? 'Untitled'}
  isSaving={saveDraft.isPending}
  isDirty={isDirty}
  isDiscarding={isDiscarding}
  isFinishing={isFinishing}
  hasDraft={hasDraft}
  onSaveDraft={handleSaveDraft}
  onFinish={handleFinish}
  onDiscard={handleDiscard}
/>
```

**Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx
git commit -m "feat(evolve): wire handleSaveDraft and handleFinish in workspace"
```

---

### Task 9: Frontend — Update `EvolutionResumeBanner` with Discard

**Files:**
- Modify: `apps/web/src/features/story/components/EvolutionResumeBanner.tsx`

**Step 1: Update the component**

```typescript
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface EvolutionResumeBannerProps {
  onContinue: () => void;
  onDiscard: () => void;
  isDiscarding?: boolean;
}

export default function EvolutionResumeBanner({
  onContinue,
  onDiscard,
  isDiscarding = false,
}: EvolutionResumeBannerProps) {
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
      <span className="text-sm text-purple-700">
        You have a story evolution in progress.
      </span>
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isDiscarding}
            >
              Discard
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this evolution session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard the session. The original story will be unchanged.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDiscard}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Discard session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          variant="ghost"
          size="sm"
          onClick={onContinue}
          disabled={isDiscarding}
        >
          Continue &rarr;
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/story/components/EvolutionResumeBanner.tsx
git commit -m "feat(story): add Discard button to EvolutionResumeBanner"
```

---

### Task 10: Frontend — Wire discard into `StoryCreation`

**Files:**
- Modify: `apps/web/src/features/story/components/StoryCreation.tsx`

**Step 1: Update the component**

Add discard handler and state, and pass them to the banner. Key changes:

```typescript
// Add imports at top
import { discardActiveEvolution } from '@/lib/api/evolution';
import { evolutionKeys } from '@/lib/hooks/useEvolution';
import { useQueryClient } from '@tanstack/react-query';

// Inside the component, add:
const queryClient = useQueryClient();
const [isDiscardingEvolution, setIsDiscardingEvolution] = useState(false);

const handleDiscardEvolution = async () => {
  if (!storyId) return;
  setIsDiscardingEvolution(true);
  try {
    await discardActiveEvolution(storyId);
  } catch (err) {
    console.error('Failed to discard evolution session:', err);
  } finally {
    queryClient.setQueryData(evolutionKeys.active(storyId), null);
    queryClient.removeQueries({ queryKey: evolutionKeys.active(storyId) });
    await queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    setIsDiscardingEvolution(false);
  }
};

// Update the banner JSX (around line 304):
{hasActiveEvolution && (
  <EvolutionResumeBanner
    onContinue={handleNavigateToEvolve}
    onDiscard={handleDiscardEvolution}
    isDiscarding={isDiscardingEvolution}
  />
)}
```

Note: `useQueryClient` may already be imported — check first. Also, `storyKeys` is imported from `@/features/story/hooks/useStories`.

**Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/features/story/components/StoryCreation.tsx
git commit -m "feat(story): wire Discard from EvolutionResumeBanner into StoryCreation"
```

---

### Task 11: Validate and test end-to-end

**Step 1: Run backend validation**

Run: `just validate-backend`

Expected: All checks pass (ruff + mypy).

**Step 2: Run backend tests**

Run: `cd services/core-api && uv run pytest tests/ -v --tb=short`

Expected: All tests pass.

**Step 3: Run frontend lint**

Run: `cd apps/web && npm run lint`

Expected: No errors.

**Step 4: Run frontend tests**

Run: `cd apps/web && npm run test`

Expected: All tests pass. If the Zustand store tests in `useEvolveWorkspaceStore.test.ts` need updating due to interface changes, update them.

**Step 5: Commit any fixes**

If any validation or tests required fixes, commit them:

```bash
git add -A
git commit -m "fix(evolve): address lint/test issues from session lifecycle changes"
```
