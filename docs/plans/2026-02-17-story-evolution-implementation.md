# Story Evolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Story Evolution feature that enables users to deepen existing stories through guided AI conversation and AI-assisted draft generation.

**Architecture:** A new `StoryEvolutionSession` model orchestrates a multi-phase workflow (elicitation → summary → style_selection → drafting → review → completed/discarded). The backend adds a new route group under `/api/stories/{story_id}/evolution`, a `StoryWriterAgent` service for draft generation, and elicitation mode augmentation for existing personas. The frontend adds a dedicated workspace page at `/stories/:storyId/evolve` with phase-aware panels.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (backend), React + TanStack Query + Zustand + shadcn/ui (frontend), SSE streaming, pgvector RAG

**Design Document:** [docs/plans/2026-02-17-story-evolution-design.md](2026-02-17-story-evolution-design.md)

---

## Phase 1: Data Layer -- COMPLETED

### Task 1: Add `source_conversation_id` Column to StoryVersion -- COMPLETED (commit 2194336)

**Files:**
- Create: `services/core-api/alembic/versions/xxxx_add_source_conversation_id_to_story_versions.py`
- Modify: `services/core-api/app/models/story_version.py`

**Step 1: Write the migration**

```bash
cd services/core-api
uv run alembic revision --autogenerate -m "add_source_conversation_id_to_story_versions"
```

Edit the generated migration to contain:

```python
"""add_source_conversation_id_to_story_versions

Revision ID: <auto>
"""

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "story_versions",
        sa.Column(
            "source_conversation_id",
            sa.Uuid(),
            sa.ForeignKey("ai_conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_story_versions_source_conversation_id",
        "story_versions",
        ["source_conversation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_story_versions_source_conversation_id", table_name="story_versions")
    op.drop_column("story_versions", "source_conversation_id")
```

**Step 2: Add the column to the StoryVersion model**

In `services/core-api/app/models/story_version.py`, add after the `source_version` field:

```python
source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
    PG_UUID, ForeignKey("ai_conversations.id", ondelete="SET NULL"), nullable=True
)
```

**Step 3: Run the migration**

```bash
cd services/core-api
uv run alembic upgrade head
```

**Step 4: Run validation**

```bash
just validate-backend
```

**Step 5: Commit**

```bash
git add services/core-api/alembic/versions/*source_conversation_id* services/core-api/app/models/story_version.py
git commit -m "feat(evolution): add source_conversation_id column to story_versions"
```

---

### Task 2: Create StoryEvolutionSession Model and Migration -- COMPLETED (commit 26c14e5)

**Files:**
- Create: `services/core-api/app/models/story_evolution.py`
- Modify: `services/core-api/app/models/__init__.py`
- Modify: `services/core-api/alembic/env.py`
- Create: `services/core-api/alembic/versions/xxxx_add_story_evolution_sessions.py`

**Step 1: Write failing test for the model**

Create `services/core-api/tests/models/test_story_evolution.py`:

```python
"""Tests for StoryEvolutionSession model."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.story_version import StoryVersion
from app.models.user import User


@pytest_asyncio.fixture
async def evolution_conversation(
    db_session: AsyncSession, test_user: User
) -> AIConversation:
    conv = AIConversation(
        user_id=test_user.id,
        persona_id="biographer",
        title="Evolution elicitation",
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


class TestStoryEvolutionSession:
    @pytest.mark.asyncio
    async def test_create_session(
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
        await db_session.commit()
        await db_session.refresh(session)

        assert session.id is not None
        assert session.phase == "elicitation"
        assert session.summary_text is None
        assert session.writing_style is None
        assert session.length_preference is None
        assert session.revision_count == 0
        assert session.draft_version_id is None

    @pytest.mark.asyncio
    async def test_session_phase_update(
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

        session.phase = "summary"
        session.summary_text = "## New Details\n- Uncle Ray was present"
        await db_session.commit()
        await db_session.refresh(session)

        assert session.phase == "summary"
        assert session.summary_text is not None

    @pytest.mark.asyncio
    async def test_session_with_style_selection(
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
            writing_style="vivid",
            length_preference="similar",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        assert session.writing_style == "vivid"
        assert session.length_preference == "similar"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api
uv run pytest tests/models/test_story_evolution.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.story_evolution'`

**Step 3: Create the model**

Create `services/core-api/app/models/story_evolution.py`:

```python
"""StoryEvolutionSession model for orchestrating story evolution workflow."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StoryEvolutionSession(Base):
    """Orchestrates the story evolution workflow state."""

    __tablename__ = "story_evolution_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    story_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("stories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    base_version_number: Mapped[int] = mapped_column(nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID,
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    draft_version_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID,
        ForeignKey("story_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    phase: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="elicitation"
    )
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    writing_style: Mapped[str | None] = mapped_column(String(20), nullable=True)
    length_preference: Mapped[str | None] = mapped_column(String(20), nullable=True)
    revision_count: Mapped[int] = mapped_column(
        nullable=False, default=0, server_default=text("0")
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    story: Mapped["Story"] = relationship(  # noqa: F821
        foreign_keys=[story_id], lazy="selectin"
    )
    conversation: Mapped["AIConversation"] = relationship(  # noqa: F821
        foreign_keys=[conversation_id], lazy="selectin"
    )
    draft_version: Mapped["StoryVersion | None"] = relationship(  # noqa: F821
        foreign_keys=[draft_version_id], lazy="selectin"
    )
    creator: Mapped["User"] = relationship(  # noqa: F821
        foreign_keys=[created_by]
    )

    __table_args__ = (
        Index(
            "ix_one_active_session_per_story",
            "story_id",
            unique=True,
            postgresql_where=text(
                "phase NOT IN ('completed', 'discarded')"
            ),
        ),
    )

    # Valid phase values
    PHASES = {
        "elicitation",
        "summary",
        "style_selection",
        "drafting",
        "review",
        "completed",
        "discarded",
    }

    TERMINAL_PHASES = {"completed", "discarded"}

    # Valid phase transitions
    VALID_TRANSITIONS: dict[str, set[str]] = {
        "elicitation": {"summary", "discarded"},
        "summary": {"style_selection", "elicitation", "discarded"},
        "style_selection": {"drafting", "discarded"},
        "drafting": {"review"},
        "review": {"completed", "discarded", "review"},
    }

    WRITING_STYLES = {"vivid", "emotional", "conversational", "concise", "documentary"}
    LENGTH_PREFERENCES = {"similar", "shorter", "longer"}

    @property
    def is_terminal(self) -> bool:
        return self.phase in self.TERMINAL_PHASES

    def can_transition_to(self, target_phase: str) -> bool:
        allowed = self.VALID_TRANSITIONS.get(self.phase, set())
        return target_phase in allowed
```

**Step 4: Register the model**

In `services/core-api/app/models/__init__.py`, add the import:

```python
from .story_evolution import StoryEvolutionSession
```

In `services/core-api/alembic/env.py`, add the import alongside existing model imports:

```python
from app.models import StoryEvolutionSession
```

**Step 5: Generate and review the migration**

```bash
cd services/core-api
uv run alembic revision --autogenerate -m "add_story_evolution_sessions"
```

Review the generated migration file. It should create the `story_evolution_sessions` table with all columns and the partial unique index. Adjust if autogenerate doesn't capture the partial index correctly — add it manually:

```python
op.create_index(
    "ix_one_active_session_per_story",
    "story_evolution_sessions",
    ["story_id"],
    unique=True,
    postgresql_where=sa.text("phase NOT IN ('completed', 'discarded')"),
)
```

**Step 6: Run test to verify it passes**

```bash
cd services/core-api
uv run pytest tests/models/test_story_evolution.py -v
```

Expected: PASS

**Step 7: Run validation**

```bash
just validate-backend
```

**Step 8: Commit**

```bash
git add services/core-api/app/models/story_evolution.py services/core-api/app/models/__init__.py services/core-api/alembic/env.py services/core-api/alembic/versions/*story_evolution* services/core-api/tests/models/test_story_evolution.py
git commit -m "feat(evolution): add StoryEvolutionSession model and migration"
```

---

### Task 3: Create Pydantic Schemas for Story Evolution -- COMPLETED (commit 828a63a)

**Files:**
- Create: `services/core-api/app/schemas/story_evolution.py`

**Step 1: Write failing test for schemas**

Create `services/core-api/tests/schemas/test_story_evolution_schemas.py`:

```python
"""Tests for story evolution Pydantic schemas."""

import uuid
from datetime import datetime, timezone

import pytest

from app.schemas.story_evolution import (
    EvolutionSessionCreate,
    EvolutionSessionResponse,
    PhaseAdvanceRequest,
    GenerateRequest,
    RevisionRequest,
)


class TestEvolutionSessionCreate:
    def test_valid_create(self) -> None:
        data = EvolutionSessionCreate(persona_id="biographer")
        assert data.persona_id == "biographer"

    def test_persona_id_required(self) -> None:
        with pytest.raises(Exception):
            EvolutionSessionCreate()  # type: ignore[call-arg]


class TestPhaseAdvanceRequest:
    def test_advance_to_summary(self) -> None:
        req = PhaseAdvanceRequest(
            phase="summary",
            summary_text="## New Details\n- Uncle Ray was present",
        )
        assert req.phase == "summary"
        assert req.summary_text is not None

    def test_advance_to_style_selection(self) -> None:
        req = PhaseAdvanceRequest(
            phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )
        assert req.writing_style == "vivid"
        assert req.length_preference == "similar"

    def test_advance_to_elicitation(self) -> None:
        req = PhaseAdvanceRequest(phase="elicitation")
        assert req.phase == "elicitation"

    def test_invalid_phase(self) -> None:
        with pytest.raises(Exception):
            PhaseAdvanceRequest(phase="invalid_phase")

    def test_invalid_writing_style(self) -> None:
        with pytest.raises(Exception):
            PhaseAdvanceRequest(
                phase="style_selection",
                writing_style="invalid_style",
                length_preference="similar",
            )


class TestRevisionRequest:
    def test_valid_revision(self) -> None:
        req = RevisionRequest(instructions="Make paragraph two longer")
        assert req.instructions == "Make paragraph two longer"

    def test_empty_instructions_rejected(self) -> None:
        with pytest.raises(Exception):
            RevisionRequest(instructions="")


class TestEvolutionSessionResponse:
    def test_from_model(self) -> None:
        now = datetime.now(tz=timezone.utc)
        resp = EvolutionSessionResponse(
            id=uuid.uuid4(),
            story_id=uuid.uuid4(),
            base_version_number=1,
            conversation_id=uuid.uuid4(),
            draft_version_id=None,
            phase="elicitation",
            summary_text=None,
            writing_style=None,
            length_preference=None,
            revision_count=0,
            created_by=uuid.uuid4(),
            created_at=now,
            updated_at=now,
        )
        assert resp.phase == "elicitation"
        assert resp.draft_version_id is None
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api
uv run pytest tests/schemas/test_story_evolution_schemas.py -v
```

Expected: FAIL — `ModuleNotFoundError`

**Step 3: Create the schemas**

Create `services/core-api/app/schemas/story_evolution.py`:

```python
"""Pydantic schemas for story evolution endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


WritingStyle = Literal["vivid", "emotional", "conversational", "concise", "documentary"]
LengthPreference = Literal["similar", "shorter", "longer"]
EvolutionPhase = Literal[
    "elicitation",
    "summary",
    "style_selection",
    "drafting",
    "review",
    "completed",
    "discarded",
]


class EvolutionSessionCreate(BaseModel):
    """Request to start a new evolution session."""

    persona_id: str


class PhaseAdvanceRequest(BaseModel):
    """Request to advance the workflow phase."""

    phase: EvolutionPhase
    summary_text: str | None = None
    writing_style: WritingStyle | None = None
    length_preference: LengthPreference | None = None

    @field_validator("writing_style")
    @classmethod
    def validate_style_with_phase(
        cls, v: str | None, info: object
    ) -> str | None:
        return v

    @field_validator("length_preference")
    @classmethod
    def validate_length_with_phase(
        cls, v: str | None, info: object
    ) -> str | None:
        return v


class GenerateRequest(BaseModel):
    """Request to trigger draft generation (empty body, triggers from style_selection)."""

    pass


class RevisionRequest(BaseModel):
    """Request to revise the current draft."""

    instructions: str

    @field_validator("instructions")
    @classmethod
    def instructions_not_empty(cls, v: str) -> str:
        if not v.strip():
            msg = "Revision instructions cannot be empty"
            raise ValueError(msg)
        return v


class EvolutionSessionResponse(BaseModel):
    """Response containing full session state."""

    id: uuid.UUID
    story_id: uuid.UUID
    base_version_number: int
    conversation_id: uuid.UUID
    draft_version_id: uuid.UUID | None
    phase: EvolutionPhase
    summary_text: str | None
    writing_style: WritingStyle | None
    length_preference: LengthPreference | None
    revision_count: int
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvolutionSSEChunkEvent(BaseModel):
    """SSE chunk event for draft streaming."""

    type: Literal["chunk"] = "chunk"
    text: str


class EvolutionSSEDoneEvent(BaseModel):
    """SSE done event when draft generation completes."""

    type: Literal["done"] = "done"
    version_id: uuid.UUID
    version_number: int
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api
uv run pytest tests/schemas/test_story_evolution_schemas.py -v
```

Expected: PASS

**Step 5: Run validation**

```bash
just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/schemas/story_evolution.py services/core-api/tests/schemas/test_story_evolution_schemas.py
git commit -m "feat(evolution): add Pydantic schemas for story evolution"
```

---

## Phase 2: Configuration Files -- COMPLETED

### Task 4: Create Writing Style Directive Files -- COMPLETED (commit 1cca9a2)

**Files:**
- Create: `services/core-api/app/config/writing_styles/vivid.txt`
- Create: `services/core-api/app/config/writing_styles/emotional.txt`
- Create: `services/core-api/app/config/writing_styles/conversational.txt`
- Create: `services/core-api/app/config/writing_styles/concise.txt`
- Create: `services/core-api/app/config/writing_styles/documentary.txt`

**Step 1: Create the directory and style files**

Create `services/core-api/app/config/writing_styles/vivid.txt`:

```
Write with vivid, sensory-rich language. Bring scenes to life through specific imagery — the colour of the light, the sound of a voice, the feel of a surface. Ground the reader in place and time by describing settings in concrete detail. Use strong verbs and precise nouns over adverbs and adjectives. Let the atmosphere emerge from carefully chosen details rather than telling the reader what to feel. Vary sentence rhythm: short sentences for impact, longer ones for immersion. When the source material mentions a location, weather, time of day, or physical sensation, expand those moments with layered description. Avoid purple prose — aim for clarity that happens to be beautiful.
```

Create `services/core-api/app/config/writing_styles/emotional.txt`:

```
Write with emotional depth and resonance. Focus on the internal experience — what people felt, what moments meant, how relationships shaped the events described. Surface the emotional arc of the story: build tension, sit with difficult feelings, and allow moments of joy or tenderness to land. Use the characters' own words and reactions to reveal emotion rather than labelling feelings directly. Pay attention to the significance people attach to small gestures, traditions, and turning points. When the source material hints at something unspoken, honour that subtlety. Let the reader feel the weight of what is remembered and why it matters.
```

Create `services/core-api/app/config/writing_styles/conversational.txt`:

```
Write in a warm, informal, first-person voice — as though the storyteller is speaking directly to someone they trust. Use natural sentence structures, contractions, and the occasional aside or parenthetical. Match the vocabulary and cadence of someone telling a story aloud: comfortable pauses, moments of humour, rhetorical questions. Avoid formality, academic language, or literary flourish. If the original material uses nicknames, slang, or regional expressions, preserve them. The goal is authenticity — the reader should feel they are hearing the storyteller's own voice, not a polished rewrite.
```

Create `services/core-api/app/config/writing_styles/concise.txt`:

```
Write with economy and precision. Every sentence should earn its place. Strip away filler, redundancy, and throat-clearing. Prefer short, direct sentences that carry impact. Choose the single best word over a cluster of approximate ones. Let silences and white space do work — not everything needs to be spelled out. This style suits stories meant to be read aloud, shared in a eulogy, or displayed alongside a photograph. Aim for the density of poetry without the obscurity: clear, distilled, and memorable.
```

Create `services/core-api/app/config/writing_styles/documentary.txt`:

```
Write in a measured, factual, third-person voice — as though documenting events for a biographical record. Organise information chronologically where possible. Use full names on first reference, then natural short forms. Include dates, locations, and contextual details that situate events in history. Attribute information to its source when the material allows ("According to his daughter…", "As she later recalled…"). Maintain respectful distance: report what happened and what people said without editorialising or speculating about internal states. This style suits family histories, biographical sketches, and legacy documents.
```

**Step 2: Create the elicitation mode directive**

Create `services/core-api/app/config/elicitation_mode.txt`:

```
ELICITATION MODE — ACTIVE

You are now in story evolution mode. Your goal is to help the user deepen and expand the story shown below through Socratic questioning. Follow these guidelines:

QUESTIONING APPROACH:
- Ask probing, open-ended questions — one or two at a time, not a list
- Focus on: sensory details, emotions, timeline and sequence, other people present, what the moment meant, cause and effect
- Follow the user's energy — if they light up about a detail, go deeper there
- Cross-reference other stories and known facts when relevant, but only if the connection is natural

STRICT BOUNDARIES:
- NEVER fabricate, suggest, or invent details — only elicit from the user
- NEVER say "maybe it was like…" or "perhaps you felt…" — ask, don't assume
- If the user says "I don't remember," accept it and move to a different angle

TRACKING:
- Mentally track new information surfaced during the conversation
- Note corrections to the original story
- Note new people, places, dates, and emotional details

TRANSITION:
- When the user signals readiness, or when you sense enough depth has been reached, offer to produce a structured summary
- Format the summary with these categories:
  **New Details** — Facts, events, descriptions surfaced in conversation
  **People Mentioned** — New people or expanded details about existing people
  **Timeline/Sequence** — Temporal ordering, dates, sequences clarified
  **Emotions/Significance** — What moments meant, how people felt
  **Corrections to Original** — Anything the user wants changed from the existing story
```

**Step 3: Commit**

```bash
git add services/core-api/app/config/writing_styles/ services/core-api/app/config/elicitation_mode.txt
git commit -m "feat(evolution): add writing style directives and elicitation mode prompt"
```

---

## Phase 3: Backend Services -- COMPLETED

### Task 5: Create Story Evolution Service (Session Management) -- COMPLETED (commit 463f0e1)

**Files:**
- Create: `services/core-api/app/services/story_evolution.py`
- Create: `services/core-api/tests/services/test_story_evolution_service.py`

**Step 1: Write failing tests for session management**

Create `services/core-api/tests/services/test_story_evolution_service.py`:

```python
"""Tests for story evolution service."""

import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.user import User
from app.services import story_evolution as evolution_service


class TestStartEvolutionSession:
    @pytest.mark.asyncio
    async def test_start_session_success(
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

        assert session.phase == "elicitation"
        assert session.story_id == test_story.id
        assert session.base_version_number == 1
        assert session.conversation_id is not None
        assert session.created_by == test_user.id

    @pytest.mark.asyncio
    async def test_start_session_non_author_forbidden(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story: Story,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await evolution_service.start_session(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                persona_id="biographer",
            )
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_start_session_conflict_when_active_exists(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        # Create first session
        await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        # Try to create second — should fail with 409
        with pytest.raises(HTTPException) as exc:
            await evolution_service.start_session(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user.id,
                persona_id="biographer",
            )
        assert exc.value.status_code == 409


class TestGetActiveSession:
    @pytest.mark.asyncio
    async def test_get_active_session(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        created = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        found = await evolution_service.get_active_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
        )
        assert found is not None
        assert found.id == created.id

    @pytest.mark.asyncio
    async def test_get_active_session_returns_none_when_none(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ) -> None:
        result = await evolution_service.get_active_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
        )
        assert result is None


class TestAdvancePhase:
    @pytest.mark.asyncio
    async def test_elicitation_to_summary(
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

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Uncle Ray was present",
        )

        assert updated.phase == "summary"
        assert updated.summary_text is not None

    @pytest.mark.asyncio
    async def test_invalid_transition_rejected(
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

        with pytest.raises(HTTPException) as exc:
            await evolution_service.advance_phase(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
                target_phase="review",  # Can't jump from elicitation to review
            )
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    async def test_summary_to_style_selection(
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

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        assert updated.phase == "style_selection"
        assert updated.writing_style == "vivid"
        assert updated.length_preference == "similar"

    @pytest.mark.asyncio
    async def test_summary_back_to_elicitation(
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

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## Summary",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        assert updated.phase == "elicitation"


class TestDiscardSession:
    @pytest.mark.asyncio
    async def test_discard_session(
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

        discarded = await evolution_service.discard_session(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        assert discarded.phase == "discarded"

    @pytest.mark.asyncio
    async def test_discard_terminal_session_rejected(
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

        await evolution_service.discard_session(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        with pytest.raises(HTTPException) as exc:
            await evolution_service.discard_session(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 422
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api
uv run pytest tests/services/test_story_evolution_service.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.story_evolution'`

**Step 3: Implement the service**

Create `services/core-api/app/services/story_evolution.py`:

```python
"""Service layer for story evolution session management."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.associations import ConversationLegacy, StoryLegacy
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.story_version import StoryVersion

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


async def _require_story_author(
    db: AsyncSession, story_id: uuid.UUID, user_id: uuid.UUID
) -> Story:
    """Load story and verify user is the author. Raises 404 or 403."""
    result = await db.execute(
        select(Story)
        .where(Story.id == story_id)
        .options()
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story.author_id != user_id:
        raise HTTPException(status_code=403, detail="Only the story author can evolve it")
    return story


async def _get_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Load session and verify ownership. Raises 404 or 403."""
    result = await db.execute(
        select(StoryEvolutionSession).where(
            StoryEvolutionSession.id == session_id,
            StoryEvolutionSession.story_id == story_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Evolution session not found")
    if session.created_by != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return session


async def start_session(
    db: AsyncSession,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
    persona_id: str,
) -> StoryEvolutionSession:
    """Start a new evolution session for a story."""
    story = await _require_story_author(db, story_id, user_id)

    # Check for existing non-terminal session
    existing = await db.execute(
        select(StoryEvolutionSession).where(
            StoryEvolutionSession.story_id == story_id,
            StoryEvolutionSession.phase.notin_(
                StoryEvolutionSession.TERMINAL_PHASES
            ),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="An active evolution session already exists for this story",
        )

    # Get primary legacy for conversation
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary_legacy = legacy_result.scalar_one_or_none()
    if not primary_legacy:
        raise HTTPException(
            status_code=422, detail="Story must have a primary legacy"
        )

    # Determine base version number
    base_version_number = 1
    if story.active_version_id:
        version_result = await db.execute(
            select(StoryVersion.version_number).where(
                StoryVersion.id == story.active_version_id
            )
        )
        vn = version_result.scalar_one_or_none()
        if vn:
            base_version_number = vn

    # Create conversation for elicitation
    conversation = AIConversation(
        user_id=user_id,
        persona_id=persona_id,
        title=f"Story Evolution: {story.title}",
    )
    db.add(conversation)
    await db.flush()

    # Link conversation to legacy
    conv_legacy = ConversationLegacy(
        conversation_id=conversation.id,
        legacy_id=primary_legacy.legacy_id,
        role="primary",
        position=0,
    )
    db.add(conv_legacy)

    # Create session
    session = StoryEvolutionSession(
        story_id=story_id,
        base_version_number=base_version_number,
        conversation_id=conversation.id,
        phase="elicitation",
        created_by=user_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.session.started",
        extra={
            "session_id": str(session.id),
            "story_id": str(story_id),
            "user_id": str(user_id),
            "persona_id": persona_id,
        },
    )

    return session


async def get_active_session(
    db: AsyncSession,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession | None:
    """Get the active (non-terminal) session for a story."""
    await _require_story_author(db, story_id, user_id)

    result = await db.execute(
        select(StoryEvolutionSession).where(
            StoryEvolutionSession.story_id == story_id,
            StoryEvolutionSession.phase.notin_(
                StoryEvolutionSession.TERMINAL_PHASES
            ),
        )
    )
    return result.scalar_one_or_none()


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


async def discard_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Discard an evolution session."""
    session = await _get_session(db, session_id, story_id, user_id)

    if session.is_terminal:
        raise HTTPException(
            status_code=422,
            detail="Cannot discard a session that is already terminal",
        )

    # Delete draft version if one exists
    if session.draft_version_id:
        draft = await db.execute(
            select(StoryVersion).where(
                StoryVersion.id == session.draft_version_id
            )
        )
        draft_version = draft.scalar_one_or_none()
        if draft_version:
            await db.delete(draft_version)

    session.phase = "discarded"
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.session.discarded",
        extra={"session_id": str(session_id)},
    )

    return session


async def accept_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Accept the draft and complete the session."""
    session = await _get_session(db, session_id, story_id, user_id)

    if session.phase != "review":
        raise HTTPException(
            status_code=422,
            detail="Can only accept from review phase",
        )

    if not session.draft_version_id:
        raise HTTPException(
            status_code=422,
            detail="No draft to accept",
        )

    # Load draft version
    draft_result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.id == session.draft_version_id
        )
    )
    draft_version = draft_result.scalar_one_or_none()
    if not draft_version:
        raise HTTPException(status_code=404, detail="Draft version not found")

    # Deactivate current active version
    story = await db.execute(select(Story).where(Story.id == story_id))
    story_obj = story.scalar_one()

    if story_obj.active_version_id:
        current_active = await db.execute(
            select(StoryVersion).where(
                StoryVersion.id == story_obj.active_version_id
            )
        )
        current = current_active.scalar_one_or_none()
        if current:
            current.status = "inactive"

    # Promote draft to active
    draft_version.status = "active"
    draft_version.source_conversation_id = session.conversation_id

    # Update story content and active version
    story_obj.title = draft_version.title
    story_obj.content = draft_version.content
    story_obj.active_version_id = draft_version.id

    # Complete session
    session.phase = "completed"
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.session.completed",
        extra={
            "session_id": str(session_id),
            "version_id": str(draft_version.id),
        },
    )

    return session
```

**Step 4: Run tests to verify they pass**

```bash
cd services/core-api
uv run pytest tests/services/test_story_evolution_service.py -v
```

Expected: PASS

**Step 5: Run validation**

```bash
just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/services/story_evolution.py services/core-api/tests/services/test_story_evolution_service.py
git commit -m "feat(evolution): add story evolution service with session management"
```

---

### Task 6: Create StoryWriterAgent Service -- COMPLETED (commit da98411)

**Files:**
- Create: `services/core-api/app/services/story_writer.py`
- Create: `services/core-api/tests/services/test_story_writer.py`

**Step 1: Write failing test**

Create `services/core-api/tests/services/test_story_writer.py`:

```python
"""Tests for StoryWriterAgent."""

import pytest

from app.services.story_writer import StoryWriterAgent, load_style_directive


class TestLoadStyleDirective:
    def test_load_vivid(self) -> None:
        directive = load_style_directive("vivid")
        assert "sensory" in directive.lower() or "vivid" in directive.lower()
        assert len(directive) > 50

    def test_load_emotional(self) -> None:
        directive = load_style_directive("emotional")
        assert len(directive) > 50

    def test_load_all_styles(self) -> None:
        for style in ["vivid", "emotional", "conversational", "concise", "documentary"]:
            directive = load_style_directive(style)
            assert len(directive) > 50

    def test_invalid_style_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_style_directive("nonexistent")


class TestStoryWriterAgent:
    def test_build_system_prompt(self) -> None:
        agent = StoryWriterAgent()
        prompt = agent.build_system_prompt(
            writing_style="vivid",
            length_preference="similar",
            legacy_name="Papa",
            relationship_context="Papa is what the user calls their grandfather.",
            is_revision=False,
        )

        assert "ghostwriter" in prompt.lower()
        assert "Papa" in prompt
        assert "similar" in prompt.lower()
        assert "vivid" in prompt.lower() or "sensory" in prompt.lower()

    def test_build_system_prompt_revision_mode(self) -> None:
        agent = StoryWriterAgent()
        prompt = agent.build_system_prompt(
            writing_style="concise",
            length_preference="shorter",
            legacy_name="Grandma",
            relationship_context="",
            is_revision=True,
        )

        assert "revise" in prompt.lower() or "revision" in prompt.lower()

    def test_build_user_message(self) -> None:
        agent = StoryWriterAgent()
        message = agent.build_user_message(
            original_story="The original story content.",
            summary_text="## New Details\n- Uncle Ray was present",
            previous_draft=None,
            revision_instructions=None,
        )

        assert "original story" in message.lower() or "Original Story" in message
        assert "The original story content." in message
        assert "Uncle Ray" in message

    def test_build_user_message_revision(self) -> None:
        agent = StoryWriterAgent()
        message = agent.build_user_message(
            original_story="The original story content.",
            summary_text="## New Details\n- Detail",
            previous_draft="Previous draft text here.",
            revision_instructions="Make it longer",
        )

        assert "Previous draft text here." in message
        assert "Make it longer" in message
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api
uv run pytest tests/services/test_story_writer.py -v
```

Expected: FAIL

**Step 3: Implement StoryWriterAgent**

Create `services/core-api/app/services/story_writer.py`:

```python
"""StoryWriterAgent — standalone generation service for story evolution drafts."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.adapters.ai import LLMProvider

logger = logging.getLogger(__name__)

STYLES_DIR = Path(__file__).resolve().parent.parent / "config" / "writing_styles"

# Cache loaded style directives
_style_cache: dict[str, str] = {}


def load_style_directive(style: str) -> str:
    """Load a writing style directive from the config directory."""
    if style in _style_cache:
        return _style_cache[style]

    path = STYLES_DIR / f"{style}.txt"
    if not path.exists():
        msg = f"Writing style directive not found: {path}"
        raise FileNotFoundError(msg)

    content = path.read_text().strip()
    _style_cache[style] = content
    return content


CORE_INSTRUCTIONS = """You are a ghostwriter. The output should read as if the user wrote it themselves.

STRICT RULES:
- Only include details from the original story or the provided summary. NEVER invent names, dates, locations, or events.
- Use the names and terms from the relationship metadata. For example, if the user calls their grandfather "Papa," use "Papa" throughout.
- Produce the COMPLETE story text — not a diff, not a partial update, not notes about what changed.
- Do not include section headers, metadata, or commentary. Output only the story text.
- Do not start with a title unless the original story started with one.

LENGTH GUIDANCE:
- "similar" means stay within ~20% of the original word count.
- "shorter" means reduce word count — distil to essentials.
- "longer" means allow natural expansion with new details, but do not pad."""

REVISION_INSTRUCTIONS = """
REVISION MODE:
- You are revising a previous draft based on the user's feedback.
- Preserve everything the user did NOT ask to change.
- Apply the revision instructions precisely.
- Still produce the complete story text."""


class StoryWriterAgent:
    """Builds prompts and streams drafts for story evolution."""

    def build_system_prompt(
        self,
        writing_style: str,
        length_preference: str,
        legacy_name: str,
        relationship_context: str,
        is_revision: bool,
    ) -> str:
        """Assemble the full system prompt for draft generation."""
        style_directive = load_style_directive(writing_style)

        parts = [
            CORE_INSTRUCTIONS,
            f"\nWRITING STYLE:\n{style_directive}",
            f"\nLENGTH PREFERENCE: {length_preference}",
            f"\nRELATIONSHIP CONTEXT:\nThe story is about {legacy_name}. {relationship_context}".strip(),
        ]

        if is_revision:
            parts.append(REVISION_INSTRUCTIONS)

        return "\n".join(parts)

    def build_user_message(
        self,
        original_story: str,
        summary_text: str,
        previous_draft: str | None = None,
        revision_instructions: str | None = None,
    ) -> str:
        """Build the user message containing all context for generation."""
        parts = [
            "## Original Story\n",
            original_story,
            "\n\n## New Information from Conversation\n",
            summary_text,
        ]

        if previous_draft:
            parts.extend([
                "\n\n## Previous Draft\n",
                previous_draft,
            ])

        if revision_instructions:
            parts.extend([
                "\n\n## Revision Instructions\n",
                revision_instructions,
            ])

        if not previous_draft:
            parts.append(
                "\n\nPlease write the complete updated story incorporating "
                "the new information above."
            )
        else:
            parts.append(
                "\n\nPlease revise the draft according to the instructions above."
            )

        return "".join(parts)

    async def stream_draft(
        self,
        llm_provider: LLMProvider,
        system_prompt: str,
        user_message: str,
        model_id: str,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Stream the draft text from the LLM."""
        messages = [{"role": "user", "content": user_message}]

        async for chunk in llm_provider.stream_generate(
            messages=messages,
            system_prompt=system_prompt,
            model_id=model_id,
            max_tokens=max_tokens,
        ):
            yield chunk
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api
uv run pytest tests/services/test_story_writer.py -v
```

Expected: PASS

**Step 5: Run validation**

```bash
just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/services/story_writer.py services/core-api/tests/services/test_story_writer.py
git commit -m "feat(evolution): add StoryWriterAgent service for draft generation"
```

---

### Task 7: Augment Storytelling Adapter for Elicitation Mode -- COMPLETED (commit cba840f)

**Files:**
- Modify: `services/core-api/app/adapters/storytelling.py`
- Modify: `services/core-api/app/config/personas.py`
- Create: `services/core-api/tests/adapters/test_elicitation_mode.py`

**Step 1: Write failing test**

Create `services/core-api/tests/adapters/test_elicitation_mode.py`:

```python
"""Tests for elicitation mode augmentation in storytelling adapter."""

import pytest

from app.config.personas import build_system_prompt


class TestElicitationModePrompt:
    def test_build_prompt_with_elicitation(self) -> None:
        prompt = build_system_prompt(
            persona_id="biographer",
            legacy_name="Papa",
            story_context="",
            facts=None,
            elicitation_mode=True,
            original_story_text="This is the original story about Papa.",
        )

        assert prompt is not None
        assert "ELICITATION MODE" in prompt
        assert "Papa" in prompt
        assert "This is the original story about Papa." in prompt

    def test_build_prompt_without_elicitation(self) -> None:
        prompt = build_system_prompt(
            persona_id="biographer",
            legacy_name="Papa",
            story_context="",
            facts=None,
            elicitation_mode=False,
        )

        assert prompt is not None
        assert "ELICITATION MODE" not in prompt

    def test_elicitation_default_is_false(self) -> None:
        prompt = build_system_prompt(
            persona_id="biographer",
            legacy_name="Papa",
        )

        assert prompt is not None
        assert "ELICITATION MODE" not in prompt
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api
uv run pytest tests/adapters/test_elicitation_mode.py -v
```

Expected: FAIL — `build_system_prompt()` doesn't accept `elicitation_mode` parameter yet

**Step 3: Modify `build_system_prompt` in personas.py**

In `services/core-api/app/config/personas.py`, update `build_system_prompt()` to accept optional elicitation parameters:

```python
# Add at module level
from pathlib import Path

ELICITATION_PROMPT_PATH = Path(__file__).parent / "elicitation_mode.txt"
_elicitation_directive: str | None = None


def _load_elicitation_directive() -> str:
    global _elicitation_directive
    if _elicitation_directive is None:
        _elicitation_directive = ELICITATION_PROMPT_PATH.read_text().strip()
    return _elicitation_directive
```

Update the `build_system_prompt` function signature to add:

```python
def build_system_prompt(
    persona_id: str,
    legacy_name: str,
    story_context: str = "",
    facts: list[Any] | None = None,
    elicitation_mode: bool = False,
    original_story_text: str | None = None,
) -> str | None:
```

At the end of the prompt assembly (after facts section), add:

```python
    if elicitation_mode:
        parts.append("\n\n")
        parts.append(_load_elicitation_directive())
        if original_story_text:
            parts.append(f"\n\n## Story Being Evolved\n\n{original_story_text}")
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api
uv run pytest tests/adapters/test_elicitation_mode.py -v
```

Expected: PASS

**Step 5: Update storytelling adapter to detect evolution sessions**

In `services/core-api/app/adapters/storytelling.py`, update `DefaultStorytellingAgent.prepare_turn()` to check if the conversation is linked to an active evolution session and pass `elicitation_mode=True` when building the system prompt.

Add to the `prepare_turn` method, before the `build_system_prompt` call:

```python
        # Check if this conversation is linked to an active evolution session
        from app.models.story_evolution import StoryEvolutionSession
        from app.models.story_version import StoryVersion

        elicitation_mode = False
        original_story_text: str | None = None

        evo_result = await db.execute(
            select(StoryEvolutionSession).where(
                StoryEvolutionSession.conversation_id == conversation_id,
                StoryEvolutionSession.phase == "elicitation",
            )
        )
        evo_session = evo_result.scalar_one_or_none()
        if evo_session:
            elicitation_mode = True
            # Load the original story text
            from app.models.story import Story
            story_result = await db.execute(
                select(Story).where(Story.id == evo_session.story_id)
            )
            story = story_result.scalar_one_or_none()
            if story:
                original_story_text = story.content
```

Then pass these to `build_system_prompt`:

```python
        system_prompt = build_system_prompt(
            persona_id=persona_id,
            legacy_name=legacy_name,
            story_context=story_context,
            facts=facts,
            elicitation_mode=elicitation_mode,
            original_story_text=original_story_text,
        )
```

**Step 6: Run full test suite to ensure nothing breaks**

```bash
cd services/core-api
uv run pytest tests/ -v --timeout=30
```

**Step 7: Run validation**

```bash
just validate-backend
```

**Step 8: Commit**

```bash
git add services/core-api/app/config/personas.py services/core-api/app/adapters/storytelling.py services/core-api/tests/adapters/test_elicitation_mode.py
git commit -m "feat(evolution): add elicitation mode augmentation to persona system prompts"
```

---

## Phase 4: Backend API Routes -- COMPLETED

### Task 8: Create Story Evolution API Routes -- COMPLETED (commit e0911f8)

**Files:**
- Create: `services/core-api/app/routes/story_evolution.py`
- Modify: `services/core-api/app/main.py` (register router)
- Create: `services/core-api/tests/routes/test_story_evolution_routes.py`

**Step 1: Write failing route tests**

Create `services/core-api/tests/routes/test_story_evolution_routes.py`:

```python
"""Tests for story evolution API routes."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.associations import ConversationLegacy, StoryLegacy
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.story_version import StoryVersion
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestCreateEvolutionSession:
    @pytest.mark.asyncio
    async def test_start_session_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["phase"] == "elicitation"
        assert data["conversation_id"] is not None

    @pytest.mark.asyncio
    async def test_start_session_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ) -> None:
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_start_session_non_author_forbidden(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_start_session_conflict(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        # First session
        await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )

        # Second attempt — 409
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        assert response.status_code == 409


class TestGetActiveSession:
    @pytest.mark.asyncio
    async def test_get_active_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        # Create session first
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        assert create_resp.status_code == 201

        # Get active
        response = await client.get(
            f"/api/stories/{test_story.id}/evolution/active",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["phase"] == "elicitation"

    @pytest.mark.asyncio
    async def test_get_active_session_404(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        response = await client.get(
            f"/api/stories/{test_story.id}/evolution/active",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestAdvancePhase:
    @pytest.mark.asyncio
    async def test_advance_to_summary(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/stories/{test_story.id}/evolution/{session_id}/phase",
            json={
                "phase": "summary",
                "summary_text": "## New Details\n- Uncle Ray",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["phase"] == "summary"

    @pytest.mark.asyncio
    async def test_invalid_transition(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/stories/{test_story.id}/evolution/{session_id}/phase",
            json={"phase": "review"},
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestDiscardSession:
    @pytest.mark.asyncio
    async def test_discard_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{session_id}/discard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["phase"] == "discarded"
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api
uv run pytest tests/routes/test_story_evolution_routes.py -v
```

Expected: FAIL — routes don't exist yet

**Step 3: Create the route file**

Create `services/core-api/app/routes/story_evolution.py`:

```python
"""API routes for story evolution workflow."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.schemas.story_evolution import (
    EvolutionSessionCreate,
    EvolutionSessionResponse,
    PhaseAdvanceRequest,
    RevisionRequest,
)
from app.services import story_evolution as evolution_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}/evolution", tags=["evolution"])


@router.post("", status_code=201, response_model=EvolutionSessionResponse)
async def start_evolution(
    story_id: UUID,
    data: EvolutionSessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Start a new evolution session for a story."""
    session_data = require_auth(request)
    evo_session = await evolution_service.start_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
        persona_id=data.persona_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.get("/active", response_model=EvolutionSessionResponse)
async def get_active_session(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Get the active evolution session for a story."""
    session_data = require_auth(request)
    evo_session = await evolution_service.get_active_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    if not evo_session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No active evolution session")
    return EvolutionSessionResponse.model_validate(evo_session)


@router.patch(
    "/{session_id}/phase",
    response_model=EvolutionSessionResponse,
)
async def advance_phase(
    story_id: UUID,
    session_id: UUID,
    data: PhaseAdvanceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Advance the evolution session phase."""
    session_data = require_auth(request)
    evo_session = await evolution_service.advance_phase(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
        target_phase=data.phase,
        summary_text=data.summary_text,
        writing_style=data.writing_style,
        length_preference=data.length_preference,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post(
    "/{session_id}/discard",
    response_model=EvolutionSessionResponse,
)
async def discard_session(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Discard an evolution session."""
    session_data = require_auth(request)
    evo_session = await evolution_service.discard_session(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post(
    "/{session_id}/accept",
    response_model=EvolutionSessionResponse,
)
async def accept_session(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Accept the draft and complete the session."""
    session_data = require_auth(request)
    evo_session = await evolution_service.accept_session(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)
```

**Step 4: Register the router in main.py**

In `services/core-api/app/main.py`, add alongside existing router includes:

```python
from app.routes.story_evolution import router as story_evolution_router
app.include_router(story_evolution_router)
```

**Step 5: Run tests to verify they pass**

```bash
cd services/core-api
uv run pytest tests/routes/test_story_evolution_routes.py -v
```

Expected: PASS

**Step 6: Run validation**

```bash
just validate-backend
```

**Step 7: Commit**

```bash
git add services/core-api/app/routes/story_evolution.py services/core-api/app/main.py services/core-api/tests/routes/test_story_evolution_routes.py
git commit -m "feat(evolution): add story evolution API routes"
```

---

### Task 9: Add SSE Streaming Endpoints (Generate and Revise) -- COMPLETED (commit 6f6ab39)

**Files:**
- Modify: `services/core-api/app/routes/story_evolution.py`
- Modify: `services/core-api/app/services/story_evolution.py`

**Step 1: Write failing tests for generate endpoint**

Add to `services/core-api/tests/routes/test_story_evolution_routes.py`:

```python
class TestGenerateDraft:
    @pytest.mark.asyncio
    async def test_generate_requires_style_selection_phase(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        # Create session in elicitation phase
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        # Try to generate from wrong phase
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{session_id}/generate",
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestReviseDraft:
    @pytest.mark.asyncio
    async def test_revise_requires_review_phase(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{session_id}/revise",
            json={"instructions": "Make it longer"},
            headers=auth_headers,
        )
        assert response.status_code == 422
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api
uv run pytest tests/routes/test_story_evolution_routes.py::TestGenerateDraft -v
uv run pytest tests/routes/test_story_evolution_routes.py::TestReviseDraft -v
```

**Step 3: Add generate and revise endpoints to routes**

Add to `services/core-api/app/routes/story_evolution.py`:

```python
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.services.story_writer import StoryWriterAgent, load_style_directive
from app.providers.registry import get_provider_registry
from app.schemas.story_evolution import EvolutionSSEChunkEvent, EvolutionSSEDoneEvent


@router.post("/{session_id}/generate")
async def generate_draft(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Trigger draft generation. Streams result via SSE."""
    session_data = require_auth(request)

    evo_session = await evolution_service.get_session_for_generation(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )

    writer = StoryWriterAgent()
    registry = get_provider_registry()
    llm = registry.get_llm_provider()

    async def generate_stream():  # noqa: ANN202
        try:
            context = await evolution_service.build_generation_context(
                db=db, session=evo_session
            )

            system_prompt = writer.build_system_prompt(
                writing_style=context["writing_style"],
                length_preference=context["length_preference"],
                legacy_name=context["legacy_name"],
                relationship_context=context.get("relationship_context", ""),
                is_revision=False,
            )

            user_message = writer.build_user_message(
                original_story=context["original_story"],
                summary_text=context["summary_text"],
            )

            full_text = ""
            async for chunk in writer.stream_draft(
                llm_provider=llm,
                system_prompt=system_prompt,
                user_message=user_message,
                model_id=context["model_id"],
            ):
                full_text += chunk
                event = EvolutionSSEChunkEvent(text=chunk)
                yield f"data: {event.model_dump_json()}\n\n"

            # Create draft version and advance phase
            version = await evolution_service.save_draft(
                db=db,
                session=evo_session,
                title=context["story_title"],
                content=full_text,
                user_id=session_data.user_id,
            )

            done_event = EvolutionSSEDoneEvent(
                version_id=version.id,
                version_number=version.version_number,
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception:
            logger.exception("evolution.generate.error")
            from app.schemas.ai import SSEErrorEvent
            error_event = SSEErrorEvent(
                message="Draft generation failed. Please try again.",
                retryable=True,
            )
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/revise")
async def revise_draft(
    story_id: UUID,
    session_id: UUID,
    data: RevisionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Revise the current draft with feedback. Streams via SSE."""
    session_data = require_auth(request)

    evo_session = await evolution_service.get_session_for_revision(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )

    writer = StoryWriterAgent()
    registry = get_provider_registry()
    llm = registry.get_llm_provider()

    async def revise_stream():  # noqa: ANN202
        try:
            context = await evolution_service.build_generation_context(
                db=db, session=evo_session, include_draft=True
            )

            system_prompt = writer.build_system_prompt(
                writing_style=context["writing_style"],
                length_preference=context["length_preference"],
                legacy_name=context["legacy_name"],
                relationship_context=context.get("relationship_context", ""),
                is_revision=True,
            )

            user_message = writer.build_user_message(
                original_story=context["original_story"],
                summary_text=context["summary_text"],
                previous_draft=context.get("previous_draft"),
                revision_instructions=data.instructions,
            )

            full_text = ""
            async for chunk in writer.stream_draft(
                llm_provider=llm,
                system_prompt=system_prompt,
                user_message=user_message,
                model_id=context["model_id"],
            ):
                full_text += chunk
                event = EvolutionSSEChunkEvent(text=chunk)
                yield f"data: {event.model_dump_json()}\n\n"

            version = await evolution_service.update_draft(
                db=db,
                session=evo_session,
                content=full_text,
            )

            done_event = EvolutionSSEDoneEvent(
                version_id=version.id,
                version_number=version.version_number,
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception:
            logger.exception("evolution.revise.error")
            from app.schemas.ai import SSEErrorEvent
            error_event = SSEErrorEvent(
                message="Revision failed. Please try again.",
                retryable=True,
            )
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        revise_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

**Step 4: Add supporting service methods**

Add to `services/core-api/app/services/story_evolution.py`:

```python
async def get_session_for_generation(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Get session and validate it's ready for generation."""
    session = await _get_session(db, session_id, story_id, user_id)
    if session.phase != "style_selection":
        raise HTTPException(
            status_code=422,
            detail="Can only generate from style_selection phase",
        )
    if not session.writing_style or not session.length_preference:
        raise HTTPException(
            status_code=422,
            detail="Writing style and length preference must be set",
        )
    # Advance to drafting
    session.phase = "drafting"
    await db.commit()
    return session


async def get_session_for_revision(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Get session and validate it's ready for revision."""
    session = await _get_session(db, session_id, story_id, user_id)
    if session.phase != "review":
        raise HTTPException(
            status_code=422,
            detail="Can only revise from review phase",
        )
    if not session.draft_version_id:
        raise HTTPException(
            status_code=422,
            detail="No draft to revise",
        )
    return session


async def build_generation_context(
    db: AsyncSession,
    session: StoryEvolutionSession,
    include_draft: bool = False,
) -> dict:
    """Build the context package for the writing agent."""
    from app.models.legacy import Legacy

    # Load story
    story_result = await db.execute(
        select(Story).where(Story.id == session.story_id)
    )
    story = story_result.scalar_one()

    # Load active version content
    original_story = story.content
    if story.active_version_id:
        version_result = await db.execute(
            select(StoryVersion).where(StoryVersion.id == story.active_version_id)
        )
        active_version = version_result.scalar_one_or_none()
        if active_version:
            original_story = active_version.content

    # Load primary legacy
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == session.story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    legacy_name = "the person"
    if primary:
        leg = await db.execute(
            select(Legacy).where(Legacy.id == primary.legacy_id)
        )
        legacy = leg.scalar_one_or_none()
        if legacy:
            legacy_name = legacy.name

    # Get persona model_id
    from app.config.personas import get_persona
    persona = get_persona(session.conversation.persona_id if session.conversation else "biographer")
    model_id = persona.model_id if persona else "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

    context: dict = {
        "original_story": original_story,
        "summary_text": session.summary_text or "",
        "writing_style": session.writing_style or "vivid",
        "length_preference": session.length_preference or "similar",
        "legacy_name": legacy_name,
        "story_title": story.title,
        "model_id": model_id,
    }

    if include_draft and session.draft_version_id:
        draft_result = await db.execute(
            select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
        )
        draft = draft_result.scalar_one_or_none()
        if draft:
            context["previous_draft"] = draft.content

    return context


async def save_draft(
    db: AsyncSession,
    session: StoryEvolutionSession,
    title: str,
    content: str,
    user_id: uuid.UUID,
) -> StoryVersion:
    """Create or replace the draft StoryVersion for this session."""
    # Get next version number
    max_result = await db.execute(
        select(StoryVersion.version_number)
        .where(StoryVersion.story_id == session.story_id)
        .order_by(StoryVersion.version_number.desc())
        .limit(1)
    )
    max_version = max_result.scalar_one_or_none() or 0

    # Delete existing draft if any
    if session.draft_version_id:
        existing = await db.execute(
            select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
        )
        old_draft = existing.scalar_one_or_none()
        if old_draft:
            await db.delete(old_draft)
            await db.flush()

    draft = StoryVersion(
        story_id=session.story_id,
        version_number=max_version + 1,
        title=title,
        content=content,
        status="draft",
        source="story_evolution",
        created_by=user_id,
    )
    db.add(draft)
    await db.flush()

    session.draft_version_id = draft.id
    session.phase = "review"
    await db.commit()
    await db.refresh(draft)

    return draft


async def update_draft(
    db: AsyncSession,
    session: StoryEvolutionSession,
    content: str,
) -> StoryVersion:
    """Update an existing draft with revised content."""
    if not session.draft_version_id:
        raise HTTPException(status_code=422, detail="No draft to update")

    result = await db.execute(
        select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft version not found")

    draft.content = content
    session.revision_count += 1
    await db.commit()
    await db.refresh(draft)

    return draft
```

**Step 5: Run tests to verify they pass**

```bash
cd services/core-api
uv run pytest tests/routes/test_story_evolution_routes.py -v
```

**Step 6: Run validation**

```bash
just validate-backend
```

**Step 7: Commit**

```bash
git add services/core-api/app/routes/story_evolution.py services/core-api/app/services/story_evolution.py services/core-api/tests/routes/test_story_evolution_routes.py
git commit -m "feat(evolution): add SSE generate and revise endpoints with draft management"
```

---

## Phase 5: Frontend API Layer -- COMPLETED

### Task 10: Create Evolution API Client Functions -- COMPLETED

**Files:**
- Create: `apps/web/src/lib/api/evolution.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Step 1: Create API client**

Create `apps/web/src/lib/api/evolution.ts`:

```typescript
import { apiGet, apiPost, apiPatch } from './client';

// --- Types ---

export type EvolutionPhase =
  | 'elicitation'
  | 'summary'
  | 'style_selection'
  | 'drafting'
  | 'review'
  | 'completed'
  | 'discarded';

export type WritingStyle =
  | 'vivid'
  | 'emotional'
  | 'conversational'
  | 'concise'
  | 'documentary';

export type LengthPreference = 'similar' | 'shorter' | 'longer';

export interface EvolutionSession {
  id: string;
  story_id: string;
  base_version_number: number;
  conversation_id: string;
  draft_version_id: string | null;
  phase: EvolutionPhase;
  summary_text: string | null;
  writing_style: WritingStyle | null;
  length_preference: LengthPreference | null;
  revision_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PhaseAdvanceRequest {
  phase: EvolutionPhase;
  summary_text?: string;
  writing_style?: WritingStyle;
  length_preference?: LengthPreference;
}

// --- API Functions ---

export function startEvolution(
  storyId: string,
  personaId: string
): Promise<EvolutionSession> {
  return apiPost(`/api/stories/${storyId}/evolution`, {
    persona_id: personaId,
  });
}

export function getActiveEvolution(
  storyId: string
): Promise<EvolutionSession> {
  return apiGet(`/api/stories/${storyId}/evolution/active`);
}

export function advancePhase(
  storyId: string,
  sessionId: string,
  data: PhaseAdvanceRequest
): Promise<EvolutionSession> {
  return apiPatch(
    `/api/stories/${storyId}/evolution/${sessionId}/phase`,
    data
  );
}

export function discardEvolution(
  storyId: string,
  sessionId: string
): Promise<EvolutionSession> {
  return apiPost(
    `/api/stories/${storyId}/evolution/${sessionId}/discard`
  );
}

export function acceptEvolution(
  storyId: string,
  sessionId: string
): Promise<EvolutionSession> {
  return apiPost(
    `/api/stories/${storyId}/evolution/${sessionId}/accept`
  );
}

/**
 * Stream draft generation via SSE.
 * Returns AbortController for cancellation.
 */
export function streamGenerate(
  storyId: string,
  sessionId: string,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`/api/stories/${storyId}/evolution/${sessionId}/generate`, {
    method: 'POST',
    credentials: 'include',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6);
          if (!json) continue;

          try {
            const event = JSON.parse(json);
            if (event.type === 'chunk') {
              onChunk(event.text);
            } else if (event.type === 'done') {
              onDone(event.version_id, event.version_number);
            } else if (event.type === 'error') {
              onError(event.message);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Stream failed');
      }
    });

  return controller;
}

/**
 * Stream draft revision via SSE.
 */
export function streamRevise(
  storyId: string,
  sessionId: string,
  instructions: string,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`/api/stories/${storyId}/evolution/${sessionId}/revise`, {
    method: 'POST',
    credentials: 'include',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions }),
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6);
          if (!json) continue;

          try {
            const event = JSON.parse(json);
            if (event.type === 'chunk') {
              onChunk(event.text);
            } else if (event.type === 'done') {
              onDone(event.version_id, event.version_number);
            } else if (event.type === 'error') {
              onError(event.message);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Revision stream failed');
      }
    });

  return controller;
}
```

**Step 2: Update barrel export**

In `apps/web/src/lib/api/index.ts`, add:

```typescript
export * from './evolution';
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/evolution.ts apps/web/src/lib/api/index.ts
git commit -m "feat(evolution): add frontend API client for story evolution"
```

---

### Task 11: Create Evolution TanStack Query Hooks -- COMPLETED

**Files:**
- Create: `apps/web/src/lib/hooks/useEvolution.ts`

**Step 1: Create hooks file**

Create `apps/web/src/lib/hooks/useEvolution.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveEvolution,
  startEvolution,
  advancePhase,
  discardEvolution,
  acceptEvolution,
  type EvolutionSession,
  type PhaseAdvanceRequest,
} from '@/lib/api/evolution';

export const evolutionKeys = {
  all: ['evolution'] as const,
  active: (storyId: string) => [...evolutionKeys.all, 'active', storyId] as const,
};

export function useActiveEvolution(storyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: evolutionKeys.active(storyId ?? ''),
    queryFn: () => getActiveEvolution(storyId!),
    enabled: !!storyId && enabled,
    retry: false,
    staleTime: 10_000,
  });
}

export function useStartEvolution(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personaId: string) => startEvolution(storyId, personaId),
    onSuccess: (session) => {
      queryClient.setQueryData(evolutionKeys.active(storyId), session);
    },
  });
}

export function useAdvancePhase(storyId: string, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PhaseAdvanceRequest) =>
      advancePhase(storyId, sessionId, data),
    onSuccess: (session) => {
      queryClient.setQueryData(evolutionKeys.active(storyId), session);
    },
  });
}

export function useDiscardEvolution(storyId: string, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => discardEvolution(storyId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: evolutionKeys.active(storyId) });
    },
  });
}

export function useAcceptEvolution(storyId: string, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => acceptEvolution(storyId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: evolutionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['stories', 'detail', storyId] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/hooks/useEvolution.ts
git commit -m "feat(evolution): add TanStack Query hooks for evolution workflow"
```

---

## Phase 6: Frontend Components -- COMPLETED

### Task 12: Create PhaseIndicator and EvolutionBanner Components -- COMPLETED (commit 4e4ed9b)

**Files:**
- Create: `apps/web/src/features/story-evolution/PhaseIndicator.tsx`
- Create: `apps/web/src/features/story-evolution/EvolutionBanner.tsx`

These are small shared UI components used across all phases. Implement them with the phase list (`elicitation → summary → style_selection → drafting → review`) displayed as a step indicator, and a top banner showing the session status and linked story title.

Follow the patterns in the existing codebase:
- Use shadcn/ui `Badge` for phase labels
- Use Tailwind CSS for layout
- Use `lucide-react` icons (e.g., `Sparkles`, `MessageSquare`, `Check`)

**Step 1: Create the components (code omitted for brevity — follow shadcn/ui patterns from existing components like `VersionPreviewBanner.tsx`)**

**Step 2: Commit**

```bash
git add apps/web/src/features/story-evolution/
git commit -m "feat(evolution): add PhaseIndicator and EvolutionBanner components"
```

---

### Task 13: Create StyleSelector Component -- COMPLETED (commit 4e4ed9b)

**Files:**
- Create: `apps/web/src/features/story-evolution/StyleSelector.tsx`
- Create: `apps/web/src/features/story-evolution/StyleSelector.test.tsx`

Card-based selection for 5 writing styles + radio options for length preference + "Generate draft" button. Follow the card patterns from the codebase (shadcn `Card` component).

**Style cards data:**

```typescript
const WRITING_STYLES = [
  { id: 'vivid', name: 'Vivid', description: 'Sensory details, setting, atmosphere, descriptive language', icon: 'Eye' },
  { id: 'emotional', name: 'Emotional', description: 'Emotional arc, feelings, relationships, internal experience', icon: 'Heart' },
  { id: 'conversational', name: 'Conversational', description: 'Informal tone, personal, direct, matching natural voice', icon: 'MessageCircle' },
  { id: 'concise', name: 'Concise', description: 'Distilled, tight, impact per word, suitable for reading aloud', icon: 'AlignLeft' },
  { id: 'documentary', name: 'Documentary', description: 'Factual, chronological, biographical, third-person', icon: 'FileText' },
] as const;

const LENGTH_OPTIONS = [
  { id: 'similar', label: 'Keep similar length' },
  { id: 'shorter', label: 'Make it shorter' },
  { id: 'longer', label: 'Allow it to grow' },
] as const;
```

**Test pattern:** Follow `VersionPreviewBanner.test.tsx` — render, check elements, simulate clicks.

**Step 1: Create component and test**

**Step 2: Run tests**

```bash
cd apps/web && npm run test -- --run src/features/story-evolution/StyleSelector.test.tsx
```

**Step 3: Commit**

```bash
git add apps/web/src/features/story-evolution/StyleSelector.tsx apps/web/src/features/story-evolution/StyleSelector.test.tsx
git commit -m "feat(evolution): add StyleSelector component with writing style and length preference"
```

---

### Task 14: Create SummaryCheckpoint Component -- COMPLETED (commit 4e4ed9b)

**Files:**
- Create: `apps/web/src/features/story-evolution/SummaryCheckpoint.tsx`

Displays the structured summary in categorized sections. Three actions: "Looks good" (advance to style selection), "I want to add more" (return to elicitation), "Continue chatting" (return to elicitation).

Parse the markdown summary into sections. Use shadcn `Card` and `Button` components.

**Step 1: Create component**

**Step 2: Commit**

```bash
git add apps/web/src/features/story-evolution/SummaryCheckpoint.tsx
git commit -m "feat(evolution): add SummaryCheckpoint component"
```

---

### Task 15: Create ElicitationPanel Component -- COMPLETED (commit 37ab124)

**Files:**
- Create: `apps/web/src/features/story-evolution/ElicitationPanel.tsx`

Conversation UI for the elicitation phase. Reuse the chat patterns from `AIAgentChat.tsx`:
- Use the `useAIChat` hook with the evolution session's conversation ID
- Message list with auto-scroll
- Input box with send button
- "Ready to summarize" button that appears after 3+ message exchanges
- Banner at top: "Evolving: [Story Title]"

This component wraps existing chat functionality with evolution-specific controls.

**Step 1: Create component**

**Step 2: Commit**

```bash
git add apps/web/src/features/story-evolution/ElicitationPanel.tsx
git commit -m "feat(evolution): add ElicitationPanel with chat and summarize controls"
```

---

### Task 16: Create DraftStreamPanel and DraftReviewPanel Components -- COMPLETED (commit 37ab124)

**Files:**
- Create: `apps/web/src/features/story-evolution/DraftStreamPanel.tsx`
- Create: `apps/web/src/features/story-evolution/DraftReviewPanel.tsx`

**DraftStreamPanel:** Shows streaming draft text appearing in real-time during generation. Uses the `streamGenerate` function from the evolution API client. Displays a progress indicator while generating.

**DraftReviewPanel:** Displays the completed draft (scrollable). Action bar at the bottom: "Accept," "Discard," "Request changes." When "Request changes" is clicked, shows an input for revision feedback that calls `streamRevise`.

Follow the SSE streaming pattern from `useAIChat.ts` for chunk accumulation.

**Step 1: Create components**

**Step 2: Commit**

```bash
git add apps/web/src/features/story-evolution/DraftStreamPanel.tsx apps/web/src/features/story-evolution/DraftReviewPanel.tsx
git commit -m "feat(evolution): add DraftStreamPanel and DraftReviewPanel components"
```

---

### Task 17: Create StoryEvolutionWorkspace (Main Page) -- COMPLETED (commit 37ab124)

**Files:**
- Create: `apps/web/src/features/story-evolution/StoryEvolutionWorkspace.tsx`
- Create: `apps/web/src/features/story-evolution/index.ts`

Top-level page component that:
1. Loads or creates the evolution session via hooks
2. Routes to the correct panel based on `session.phase`
3. Manages the two-panel layout (original story left, phase-specific content right)
4. Handles phase transitions by calling `useAdvancePhase`

**Phase → Panel mapping:**

| Phase | Left Panel | Right Panel |
|-------|-----------|-------------|
| `elicitation` | Original story (read-only) | `ElicitationPanel` |
| `summary` | Original story | `SummaryCheckpoint` |
| `style_selection` | Original story | `StyleSelector` |
| `drafting` | Original story | `DraftStreamPanel` |
| `review` | Original story | `DraftReviewPanel` |

**Props interface:**

```typescript
interface StoryEvolutionWorkspaceProps {
  storyId: string;
  legacyId: string;
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}
```

Create `apps/web/src/features/story-evolution/index.ts`:

```typescript
export { default as StoryEvolutionWorkspace } from './StoryEvolutionWorkspace';
```

**Step 1: Create workspace component and barrel export**

**Step 2: Commit**

```bash
git add apps/web/src/features/story-evolution/
git commit -m "feat(evolution): add StoryEvolutionWorkspace main page component"
```

---

### Task 18: Add Route and Entry Points -- COMPLETED (commit 37ab124)

**Files:**
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/PageWrapper.tsx`
- Modify: `apps/web/src/components/StoryCreation.tsx`

**Step 1: Add route for evolution workspace**

In `apps/web/src/routes/index.tsx`, add inside the protected routes section:

```typescript
const StoryEvolutionWorkspace = React.lazy(() =>
  import('@/features/story-evolution/StoryEvolutionWorkspace').then((m) => ({
    default: m.default,
  }))
);

// Inside the router children array, after the story route:
{
  path: '/legacy/:legacyId/story/:storyId/evolve',
  element: (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        {React.createElement(withStoryProps(StoryEvolutionWorkspace))}
      </Suspense>
    </ProtectedRoute>
  ),
},
```

**Step 2: Add "Evolve this story" button to StoryCreation.tsx**

In `apps/web/src/components/StoryCreation.tsx`, add alongside existing action buttons in view mode:

```typescript
// Import at top
import { useActiveEvolution } from '@/lib/hooks/useEvolution';

// Inside the component, add hook:
const { data: activeEvolution } = useActiveEvolution(storyId, !!storyId);

// Add button in the HeaderSlot (view mode), after the edit button:
{storyId && isAuthor && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => onNavigate(`/legacy/${legacyId}/story/${storyId}/evolve`)}
  >
    <Sparkles className="h-4 w-4 mr-1" />
    {activeEvolution ? 'Continue Evolving' : 'Evolve Story'}
  </Button>
)}
```

If an active evolution session exists, show a resume banner:

```typescript
{activeEvolution && !activeEvolution.phase?.match(/completed|discarded/) && (
  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 flex items-center justify-between">
    <span className="text-sm text-purple-700">
      You have a story evolution in progress.
    </span>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onNavigate(`/legacy/${legacyId}/story/${storyId}/evolve`)}
    >
      Continue →
    </Button>
  </div>
)}
```

**Step 3: Run frontend lint**

```bash
cd apps/web && npm run lint
```

**Step 4: Commit**

```bash
git add apps/web/src/routes/index.tsx apps/web/src/components/StoryCreation.tsx
git commit -m "feat(evolution): add evolution route and entry points from StoryCreation"
```

---

## Phase 7: Validation & Polish -- COMPLETED

### Task 19: Run Full Backend Validation -- COMPLETED

**Step 1: Run all backend tests**

```bash
cd services/core-api
uv run pytest tests/ -v --timeout=60
```

**Step 2: Run backend validation**

```bash
just validate-backend
```

**Step 3: Fix any issues found**

**Step 4: Commit fixes if needed**

```bash
git commit -m "fix(evolution): address validation issues"
```

---

### Task 20: Run Full Frontend Validation -- COMPLETED

**Step 1: Run frontend lint and typecheck**

```bash
cd apps/web
npm run lint
npx tsc --noEmit
```

**Step 2: Run frontend tests**

```bash
cd apps/web && npm run test
```

**Step 3: Fix any issues found**

**Step 4: Commit fixes if needed**

```bash
git commit -m "fix(evolution): address frontend validation issues"
```

---

## Summary of All Files

### New Backend Files
| File | Purpose |
|------|---------|
| `app/models/story_evolution.py` | StoryEvolutionSession SQLAlchemy model |
| `app/routes/story_evolution.py` | API endpoints |
| `app/services/story_evolution.py` | Session management business logic |
| `app/services/story_writer.py` | StoryWriterAgent draft generation |
| `app/schemas/story_evolution.py` | Pydantic request/response schemas |
| `app/config/elicitation_mode.txt` | Elicitation directive prompt |
| `app/config/writing_styles/*.txt` | 5 style directive files |
| `alembic/versions/*_source_conversation_id.py` | Migration: StoryVersion column |
| `alembic/versions/*_story_evolution_sessions.py` | Migration: new table |

### Modified Backend Files
| File | Change |
|------|--------|
| `app/models/__init__.py` | Register StoryEvolutionSession |
| `app/models/story_version.py` | Add source_conversation_id column |
| `app/config/personas.py` | Add elicitation_mode parameter to build_system_prompt |
| `app/adapters/storytelling.py` | Detect evolution session, pass elicitation flag |
| `app/main.py` | Register evolution router |
| `alembic/env.py` | Import new model |

### New Frontend Files
| File | Purpose |
|------|---------|
| `src/features/story-evolution/StoryEvolutionWorkspace.tsx` | Main page |
| `src/features/story-evolution/ElicitationPanel.tsx` | Conversation UI |
| `src/features/story-evolution/SummaryCheckpoint.tsx` | Summary review |
| `src/features/story-evolution/StyleSelector.tsx` | Style + length selection |
| `src/features/story-evolution/DraftStreamPanel.tsx` | Streaming draft display |
| `src/features/story-evolution/DraftReviewPanel.tsx` | Draft review + actions |
| `src/features/story-evolution/EvolutionBanner.tsx` | Top status banner |
| `src/features/story-evolution/PhaseIndicator.tsx` | Phase step indicator |
| `src/features/story-evolution/index.ts` | Barrel export |
| `src/lib/api/evolution.ts` | API client functions |
| `src/lib/hooks/useEvolution.ts` | TanStack Query hooks |

### Modified Frontend Files
| File | Change |
|------|--------|
| `src/routes/index.tsx` | Add `/legacy/:legacyId/story/:storyId/evolve` route |
| `src/components/StoryCreation.tsx` | Add "Evolve Story" button + resume banner |
| `src/lib/api/index.ts` | Export evolution API |

### Test Files
| File | Purpose |
|------|---------|
| `tests/models/test_story_evolution.py` | Model layer tests |
| `tests/schemas/test_story_evolution_schemas.py` | Schema validation tests |
| `tests/services/test_story_evolution_service.py` | Service logic tests |
| `tests/services/test_story_writer.py` | Writer agent tests |
| `tests/adapters/test_elicitation_mode.py` | Elicitation prompt tests |
| `tests/routes/test_story_evolution_routes.py` | API endpoint tests |
| `src/features/story-evolution/StyleSelector.test.tsx` | Frontend component test |
