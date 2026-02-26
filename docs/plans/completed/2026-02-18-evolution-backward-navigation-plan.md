# Evolution Backward Phase Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add backward phase navigation to the Story Evolution workflow so users can click completed steps in the PhaseIndicator to return to earlier phases, with forward-phase data clearing.

**Architecture:** Extend the existing `VALID_TRANSITIONS` map with backward transitions (`style_selection → summary/elicitation`, `review → style_selection/summary/elicitation`). The `advance_phase()` service function detects backward transitions via a `PHASE_ORDER` mapping and clears forward-phase data (summary, style, draft) based on the target. The frontend makes completed PhaseIndicator steps clickable (except `drafting`, which is transient). No new endpoints, schemas, or API types needed — everything flows through the existing `PATCH /phase` endpoint.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (backend), React + TanStack Query + shadcn/ui (frontend)

**Design Document:** [docs/plans/2026-02-17-story-evolution-design.md](2026-02-17-story-evolution-design.md)

---

## Task 1: Add backward transitions to model

**Files:**
- Modify: `services/core-api/app/models/story_evolution.py:110-117`
- Test: `services/core-api/tests/models/test_story_evolution.py`

**Step 1: Write the failing tests**

Add a new test class `TestCanTransitionTo` at the end of `tests/models/test_story_evolution.py`:

```python
class TestCanTransitionTo:
    @pytest.mark.asyncio
    async def test_forward_transitions_allowed(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="elicitation",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.flush()

        assert session.can_transition_to("summary") is True
        assert session.can_transition_to("discarded") is True
        assert session.can_transition_to("review") is False

    @pytest.mark.asyncio
    async def test_style_selection_backward_to_summary(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="style_selection",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.flush()

        assert session.can_transition_to("summary") is True
        assert session.can_transition_to("elicitation") is True

    @pytest.mark.asyncio
    async def test_review_backward_transitions(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="review",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.flush()

        assert session.can_transition_to("style_selection") is True
        assert session.can_transition_to("summary") is True
        assert session.can_transition_to("elicitation") is True

    @pytest.mark.asyncio
    async def test_drafting_no_backward_transitions(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="drafting",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.flush()

        assert session.can_transition_to("style_selection") is False
        assert session.can_transition_to("elicitation") is False
        assert session.can_transition_to("review") is True
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api && uv run pytest tests/models/test_story_evolution.py::TestCanTransitionTo -v
```

Expected: 2 FAIL (backward transitions not yet allowed), 2 PASS.

**Step 3: Update VALID_TRANSITIONS and add PHASE_ORDER**

In `services/core-api/app/models/story_evolution.py`, replace lines 110-117:

```python
    # Phase ordering for backward transition detection
    PHASE_ORDER: dict[str, int] = {
        "elicitation": 0,
        "summary": 1,
        "style_selection": 2,
        "drafting": 3,
        "review": 4,
    }

    # Valid phase transitions (forward + backward)
    VALID_TRANSITIONS: dict[str, set[str]] = {
        "elicitation": {"summary", "discarded"},
        "summary": {"style_selection", "elicitation", "discarded"},
        "style_selection": {"drafting", "summary", "elicitation", "discarded"},
        "drafting": {"review"},
        "review": {"completed", "discarded", "review", "style_selection", "summary", "elicitation"},
    }
```

**Step 4: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/models/test_story_evolution.py -v
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/models/story_evolution.py services/core-api/tests/models/test_story_evolution.py
git commit -m "feat(evolution): add backward phase transitions to model"
```

---

## Task 2: Add forward-data clearing to advance_phase service

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:383-422` (advance_phase) and `425-458` (discard_session)
- Test: `services/core-api/tests/services/test_story_evolution_service.py`

**Step 1: Write the failing tests**

Add a new test class `TestBackwardPhaseTransitions` at the end of `tests/services/test_story_evolution_service.py`:

```python
class TestBackwardPhaseTransitions:
    @pytest.mark.asyncio
    async def test_review_back_to_style_selection_clears_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going back to style_selection should delete draft and reset revision_count."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        # Advance through: elicitation → summary → style_selection
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        # Simulate having a draft (manually set fields as generate endpoint would)
        from app.models.story_version import StoryVersion

        draft = StoryVersion(
            story_id=test_story.id,
            version_number=99,
            title="Draft",
            content="Draft content",
            status="draft",
            source="story_evolution",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()
        session.draft_version_id = draft.id
        session.phase = "review"
        session.revision_count = 2
        await db_session.commit()

        # Go back to style_selection
        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
        )

        assert updated.phase == "style_selection"
        assert updated.draft_version_id is None
        assert updated.revision_count == 0
        # Style and length should be preserved (they belong to style_selection)
        assert updated.writing_style == "vivid"
        assert updated.length_preference == "similar"
        # Summary should be preserved
        assert updated.summary_text is not None

    @pytest.mark.asyncio
    async def test_review_back_to_summary_clears_style_and_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going back to summary should clear style, length, draft, and revision_count."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="emotional",
            length_preference="longer",
        )

        # Simulate review phase
        session.phase = "review"
        await db_session.commit()

        # Go back to summary
        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
        )

        assert updated.phase == "summary"
        assert updated.writing_style is None
        assert updated.length_preference is None
        assert updated.draft_version_id is None
        assert updated.revision_count == 0
        # Summary should be preserved (belongs to this phase)
        assert updated.summary_text == "## New Details\n- Detail"

    @pytest.mark.asyncio
    async def test_review_back_to_elicitation_clears_everything(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going back to elicitation should clear summary, style, length, draft."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## Summary",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="concise",
            length_preference="shorter",
        )

        # Simulate review phase
        session.phase = "review"
        await db_session.commit()

        # Go back to elicitation
        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        assert updated.phase == "elicitation"
        assert updated.summary_text is None
        assert updated.writing_style is None
        assert updated.length_preference is None
        assert updated.draft_version_id is None
        assert updated.revision_count == 0

    @pytest.mark.asyncio
    async def test_style_selection_back_to_elicitation_clears_summary(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going from style_selection back to elicitation should clear summary and style."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## Summary",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        assert updated.phase == "elicitation"
        assert updated.summary_text is None
        assert updated.writing_style is None
        assert updated.length_preference is None

    @pytest.mark.asyncio
    async def test_backward_transition_deletes_draft_version_from_db(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Draft StoryVersion record should be deleted from DB on backward transition."""
        from sqlalchemy import select as sa_select

        from app.models.story_version import StoryVersion

        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        # Create a draft version
        draft = StoryVersion(
            story_id=test_story.id,
            version_number=99,
            title="Draft",
            content="Draft content",
            status="draft",
            source="story_evolution",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        session.draft_version_id = draft.id
        session.phase = "review"
        session.summary_text = "## Summary"
        session.writing_style = "vivid"
        session.length_preference = "similar"
        await db_session.commit()

        draft_id = draft.id

        # Go back to elicitation
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        # Verify draft is deleted from DB
        result = await db_session.execute(
            sa_select(StoryVersion).where(StoryVersion.id == draft_id)
        )
        assert result.scalar_one_or_none() is None
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py::TestBackwardPhaseTransitions -v
```

Expected: FAIL — backward transitions now pass model validation (from Task 1) but `advance_phase()` doesn't clear forward data yet.

**Step 3: Extract `_delete_draft_version()` helper and add backward clearing logic**

In `services/core-api/app/services/story_evolution.py`, add the helper function before `advance_phase()` (around line 382):

```python
from app.models.story_evolution import StoryEvolutionSession


async def _delete_draft_version(
    db: AsyncSession, session: StoryEvolutionSession
) -> None:
    """Delete the draft StoryVersion linked to a session, if one exists."""
    if session.draft_version_id:
        draft = await db.execute(
            select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
        )
        draft_version = draft.scalar_one_or_none()
        if draft_version:
            await db.delete(draft_version)
        session.draft_version_id = None
```

Then update `advance_phase()` to add backward-clearing logic after the validation check (after line 400). The full updated function:

```python
async def advance_phase(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
    target_phase: str,
    summary_text: str | None = None,
    writing_style: str | None = None,
    length_preference: str | None = None,
) -> StoryEvolutionSession:
    """Advance the session to a new phase with validation."""
    session = await _get_session(db, session_id, story_id, user_id)

    if not session.can_transition_to(target_phase):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from '{session.phase}' to '{target_phase}'",
        )

    # Clear forward-phase data on backward transitions
    current_order = StoryEvolutionSession.PHASE_ORDER.get(session.phase, 0)
    target_order = StoryEvolutionSession.PHASE_ORDER.get(target_phase, 0)

    if target_order < current_order:
        # Delete draft version if it exists
        await _delete_draft_version(db, session)
        session.revision_count = 0

        if target_order <= StoryEvolutionSession.PHASE_ORDER["summary"]:
            # Going back to summary or earlier: clear style/length
            session.writing_style = None
            session.length_preference = None

        if target_order <= StoryEvolutionSession.PHASE_ORDER["elicitation"]:
            # Going back to elicitation: also clear summary
            session.summary_text = None

    session.phase = target_phase

    if summary_text is not None:
        session.summary_text = summary_text
    if writing_style is not None:
        session.writing_style = writing_style
    if length_preference is not None:
        session.length_preference = length_preference

    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.phase.advanced",
        extra={
            "session_id": str(session_id),
            "phase": target_phase,
        },
    )

    return session
```

Then update `discard_session()` to use the shared helper. Replace lines 440-447:

```python
    # Delete draft version if one exists
    await _delete_draft_version(db, session)
```

**Step 4: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/services/test_story_evolution_service.py -v
```

Expected: ALL PASS.

**Step 5: Run full backend validation**

```bash
just validate-backend
```

Expected: ruff + mypy pass.

**Step 6: Commit**

```bash
git add services/core-api/app/services/story_evolution.py services/core-api/tests/services/test_story_evolution_service.py
git commit -m "feat(evolution): clear forward-phase data on backward transitions"
```

---

## Task 3: Make PhaseIndicator steps clickable

**Files:**
- Modify: `apps/web/src/features/story-evolution/PhaseIndicator.tsx`
- Test: `apps/web/src/features/story-evolution/PhaseIndicator.test.tsx` (new)

**Step 1: Write the failing tests**

Create `apps/web/src/features/story-evolution/PhaseIndicator.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhaseIndicator } from './PhaseIndicator';

describe('PhaseIndicator', () => {
  it('renders all 5 workflow phases', () => {
    render(<PhaseIndicator currentPhase="elicitation" />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Style')).toBeInTheDocument();
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('calls onPhaseClick when a completed step is clicked', async () => {
    const user = userEvent.setup();
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="review" onPhaseClick={onPhaseClick} />
    );

    // Chat, Summary, Style are completed steps — click Summary
    await user.click(screen.getByRole('button', { name: /summary/i }));
    expect(onPhaseClick).toHaveBeenCalledWith('summary');
  });

  it('does not make the current step clickable', async () => {
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="summary" onPhaseClick={onPhaseClick} />
    );

    // Summary is the current step — should not be a button
    expect(screen.queryByRole('button', { name: /summary/i })).not.toBeInTheDocument();
  });

  it('does not make future steps clickable', async () => {
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="summary" onPhaseClick={onPhaseClick} />
    );

    // Style is a future step — should not be a button
    expect(screen.queryByRole('button', { name: /style/i })).not.toBeInTheDocument();
  });

  it('does not make the drafting step clickable even when completed', async () => {
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="review" onPhaseClick={onPhaseClick} />
    );

    // Drafting is completed but should NOT be clickable (transient phase)
    expect(screen.queryByRole('button', { name: /drafting/i })).not.toBeInTheDocument();
  });

  it('does not render buttons when onPhaseClick is not provided', () => {
    render(<PhaseIndicator currentPhase="review" />);

    // No buttons should exist when no click handler
    expect(screen.queryByRole('button', { name: /chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /summary/i })).not.toBeInTheDocument();
  });

  it('makes all completed non-drafting steps clickable', async () => {
    const user = userEvent.setup();
    const onPhaseClick = vi.fn();

    render(
      <PhaseIndicator currentPhase="review" onPhaseClick={onPhaseClick} />
    );

    // Chat, Summary, Style should all be clickable
    await user.click(screen.getByRole('button', { name: /chat/i }));
    expect(onPhaseClick).toHaveBeenCalledWith('elicitation');

    await user.click(screen.getByRole('button', { name: /style/i }));
    expect(onPhaseClick).toHaveBeenCalledWith('style_selection');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/web && npm run test -- --run src/features/story-evolution/PhaseIndicator.test.tsx
```

Expected: FAIL — `onPhaseClick` prop doesn't exist yet, no buttons rendered.

**Step 3: Update PhaseIndicator to support clickable steps**

Replace the full content of `apps/web/src/features/story-evolution/PhaseIndicator.tsx`:

```tsx
import { Check, MessageSquare, FileText, Palette, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { EvolutionPhase } from '@/lib/api/evolution';

interface PhaseIndicatorProps {
  currentPhase: EvolutionPhase;
  onPhaseClick?: (phase: EvolutionPhase) => void;
  className?: string;
}

interface PhaseConfig {
  id: EvolutionPhase;
  label: string;
  Icon: React.ElementType;
}

const WORKFLOW_PHASES: PhaseConfig[] = [
  { id: 'elicitation', label: 'Chat', Icon: MessageSquare },
  { id: 'summary', label: 'Summary', Icon: FileText },
  { id: 'style_selection', label: 'Style', Icon: Palette },
  { id: 'drafting', label: 'Drafting', Icon: Sparkles },
  { id: 'review', label: 'Review', Icon: Check },
];

const PHASE_ORDER: Record<EvolutionPhase, number> = {
  elicitation: 0,
  summary: 1,
  style_selection: 2,
  drafting: 3,
  review: 4,
  completed: 5,
  discarded: -1,
};

/** Phases that should never be a backward-navigation target. */
const NON_CLICKABLE_PHASES: Set<EvolutionPhase> = new Set(['drafting']);

function getStepState(
  stepIndex: number,
  currentPhaseIndex: number,
  isDiscarded: boolean
): 'completed' | 'current' | 'future' {
  if (isDiscarded) return 'future';
  if (currentPhaseIndex >= WORKFLOW_PHASES.length) return 'completed';
  if (stepIndex < currentPhaseIndex) return 'completed';
  if (stepIndex === currentPhaseIndex) return 'current';
  return 'future';
}

export function PhaseIndicator({ currentPhase, onPhaseClick, className }: PhaseIndicatorProps) {
  const isDiscarded = currentPhase === 'discarded';
  const currentPhaseIndex = PHASE_ORDER[currentPhase];

  const mobileLabel = isDiscarded
    ? 'Discarded'
    : currentPhase === 'completed'
      ? 'Completed'
      : (WORKFLOW_PHASES.find((p) => p.id === currentPhase)?.label ?? '');

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: single-step summary */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-sm font-medium text-muted-foreground">Step:</span>
        <span
          className={cn(
            'text-sm font-semibold',
            isDiscarded
              ? 'text-muted-foreground line-through'
              : currentPhase === 'completed'
                ? 'text-emerald-600'
                : 'text-[rgb(var(--theme-primary))]'
          )}
        >
          {mobileLabel}
        </span>
      </div>

      {/* Desktop: full step indicator */}
      <div className="hidden md:flex items-center w-full">
        {WORKFLOW_PHASES.map((phase, index) => {
          const state = getStepState(index, currentPhaseIndex, isDiscarded);
          const isLast = index === WORKFLOW_PHASES.length - 1;
          const { Icon } = phase;
          const isClickable =
            onPhaseClick &&
            state === 'completed' &&
            !NON_CLICKABLE_PHASES.has(phase.id);

          const stepContent = (
            <>
              <div
                className={cn(
                  'size-8 rounded-full flex items-center justify-center transition-colors',
                  state === 'current' && 'bg-[rgb(var(--theme-primary))] text-white shadow-sm',
                  state === 'completed' && 'bg-emerald-50 text-emerald-600',
                  state === 'future' && 'bg-muted text-muted-foreground',
                  isClickable && 'group-hover:bg-emerald-100'
                )}
              >
                {state === 'completed' ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs leading-none text-center whitespace-nowrap',
                  state === 'current' && 'font-bold text-[rgb(var(--theme-primary))]',
                  state === 'completed' && 'font-medium text-emerald-600',
                  state === 'future' && 'text-muted-foreground',
                  isClickable && 'group-hover:text-emerald-700'
                )}
              >
                {phase.label}
              </span>
            </>
          );

          return (
            <div key={phase.id} className="flex items-center flex-1 min-w-0">
              {isClickable ? (
                <button
                  type="button"
                  className="group flex flex-col items-center gap-1.5 shrink-0 cursor-pointer"
                  onClick={() => onPhaseClick(phase.id)}
                  aria-label={phase.label}
                >
                  {stepContent}
                </button>
              ) : (
                <div
                  className="flex flex-col items-center gap-1.5 shrink-0"
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {stepContent}
                </div>
              )}

              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-px mx-2 mb-4 transition-colors',
                    index < currentPhaseIndex && !isDiscarded
                      ? 'bg-emerald-300'
                      : 'border-t border-dashed border-muted-foreground/30'
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/web && npm run test -- --run src/features/story-evolution/PhaseIndicator.test.tsx
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/story-evolution/PhaseIndicator.tsx apps/web/src/features/story-evolution/PhaseIndicator.test.tsx
git commit -m "feat(evolution): make completed phase steps clickable for backward navigation"
```

---

## Task 4: Wire up handlePhaseClick in StoryEvolutionWorkspace

**Files:**
- Modify: `apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx:67,153,368`

**Step 1: Add the handlePhaseClick callback**

In `apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx`, add a new handler after the existing `handleRevisionComplete` callback (after line 152):

```typescript
  const handlePhaseClick = useCallback(
    async (targetPhase: EvolutionPhase) => {
      if (targetPhase === phase) return;
      try {
        await advancePhase.mutateAsync({ phase: targetPhase });
      } catch (err) {
        console.error('Failed to navigate to phase:', err);
      }
    },
    [advancePhase, phase]
  );
```

Add the `EvolutionPhase` import. Update the existing import from `@/lib/api/evolution` (line 27) to include it:

```typescript
import type { WritingStyle, LengthPreference, EvolutionPhase } from '@/lib/api/evolution';
```

**Step 2: Pass onPhaseClick to PhaseIndicator**

Update the `<PhaseIndicator>` usage (line 368). Replace:

```tsx
          <PhaseIndicator currentPhase={phase} />
```

With:

```tsx
          <PhaseIndicator currentPhase={phase} onPhaseClick={handlePhaseClick} />
```

**Step 3: Clear draftText on backward navigation**

When navigating backward from review, the local `draftText` state needs to be cleared since the backend deletes the draft. Update `handlePhaseClick` to also clear local state:

```typescript
  const handlePhaseClick = useCallback(
    async (targetPhase: EvolutionPhase) => {
      if (targetPhase === phase) return;
      try {
        await advancePhase.mutateAsync({ phase: targetPhase });
        setDraftText('');
        setStreamError(null);
      } catch (err) {
        console.error('Failed to navigate to phase:', err);
      }
    },
    [advancePhase, phase]
  );
```

**Step 4: Run frontend linting**

```bash
cd apps/web && npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx
git commit -m "feat(evolution): wire up phase click handler for backward navigation"
```

---

## Task 5: Run full validation

**Step 1: Run backend tests**

```bash
cd services/core-api && uv run pytest tests/ -v --tb=short
```

Expected: ALL PASS.

**Step 2: Run backend validation (ruff + mypy)**

```bash
just validate-backend
```

Expected: PASS.

**Step 3: Run frontend tests**

```bash
cd apps/web && npm run test -- --run
```

Expected: ALL PASS.

**Step 4: Run frontend lint**

```bash
cd apps/web && npm run lint
```

Expected: PASS.

**Step 5: Final commit if any fixes were needed**

If any validation required fixes, commit them.

---

## Summary

| Task | Description | Files Modified | Files Created |
|------|-------------|----------------|---------------|
| 1 | Add backward transitions to model | `models/story_evolution.py` | `tests/models/test_story_evolution.py` (extended) |
| 2 | Add forward-data clearing to service | `services/story_evolution.py` | `tests/services/test_story_evolution_service.py` (extended) |
| 3 | Make PhaseIndicator steps clickable | `PhaseIndicator.tsx` | `PhaseIndicator.test.tsx` |
| 4 | Wire up handlePhaseClick in workspace | `StoryEvolutionWorkspace.tsx` | — |
| 5 | Full validation | — | — |

**Total: 4 files modified, 1 file created. Zero new endpoints, schemas, or API types.**
