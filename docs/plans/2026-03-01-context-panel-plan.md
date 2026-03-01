# Context Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a living Context panel in the Evolve workspace that extracts facts from story text and AI conversation, displays them as a summary + categorized fact cards, and feeds curated context into story rewrites.

**Architecture:** Server-side LLM extraction persisted to PostgreSQL. Two triggers: seed extraction from story text (on workspace open) and incremental extraction from conversation (async background task after each assistant message). Frontend uses TanStack Query for data fetching with optimistic updates for fact curation.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, React, TypeScript, TanStack Query, Zustand, Lucide icons, shadcn/ui components

**Design Doc:** `docs/plans/2026-03-01-context-panel-design.md`

---

## Task 1: Backend — SQLAlchemy Models ✅

**Files:**
- Create: `services/core-api/app/models/story_context.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Create the StoryContext and ContextFact models**

```python
# services/core-api/app/models/story_context.py
"""SQLAlchemy models for story context extraction."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StoryContext(Base):
    """Extracted context for a story evolution session."""

    __tablename__ = "story_contexts"
    __table_args__ = (
        UniqueConstraint("story_id", "user_id", name="uq_story_contexts_story_user"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    story_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracting: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    summary_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    facts: Mapped[list[ContextFact]] = relationship(
        "ContextFact",
        back_populates="story_context",
        cascade="all, delete-orphan",
        order_by="ContextFact.created_at",
    )


class ContextFact(Base):
    """An individual extracted fact from story text or conversation."""

    __tablename__ = "context_facts"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    story_context_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("story_contexts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # person, place, date, event, emotion, relationship, object
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'story' or 'conversation'
    source_message_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )  # 'active', 'pinned', 'dismissed'
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    story_context: Mapped[StoryContext] = relationship(
        "StoryContext", back_populates="facts"
    )
```

**Step 2: Register models in `__init__.py`**

Add to `services/core-api/app/models/__init__.py`:

```python
from .story_context import ContextFact, StoryContext
```

And add `"ContextFact"` and `"StoryContext"` to the `__all__` list.

**Step 3: Verify models load correctly**

Run: `cd services/core-api && uv run python -c "from app.models import StoryContext, ContextFact; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add services/core-api/app/models/story_context.py services/core-api/app/models/__init__.py
git commit -m "feat: add StoryContext and ContextFact SQLAlchemy models"
```

---

## Task 2: Backend — Alembic Migration ✅

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_story_context_tables.py`

**Step 1: Generate migration**

Run: `cd services/core-api && uv run alembic revision --autogenerate -m "add story context and context facts tables"`

**Step 2: Review migration**

Read the generated migration file and verify it creates:
- `story_contexts` table with all columns + unique constraint on (story_id, user_id)
- `context_facts` table with all columns + index on story_context_id
- Foreign keys to stories, users, ai_messages

**Step 3: Run migration**

Run: `cd services/core-api && uv run alembic upgrade head`
Expected: Migration applies successfully

**Step 4: Verify tables exist**

Run: `docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\dt story_contexts" -c "\dt context_facts"`
Expected: Both tables listed

**Step 5: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat: add migration for story_contexts and context_facts tables"
```

---

## Task 3: Backend — Pydantic Schemas ✅

**Files:**
- Create: `services/core-api/app/schemas/story_context.py`
- Modify: `services/core-api/app/schemas/rewrite.py`

**Step 1: Create story context schemas**

```python
# services/core-api/app/schemas/story_context.py
"""Schemas for the story context REST endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


FactCategory = Literal[
    "person", "place", "date", "event", "emotion", "relationship", "object"
]
FactSource = Literal["story", "conversation"]
FactStatus = Literal["active", "pinned", "dismissed"]


class ContextFactResponse(BaseModel):
    """A single extracted fact."""

    id: UUID
    category: FactCategory
    content: str
    detail: str | None
    source: FactSource
    status: FactStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryContextResponse(BaseModel):
    """Full context for a story: summary + facts."""

    id: UUID
    story_id: UUID
    summary: str | None
    summary_updated_at: datetime | None
    extracting: bool
    facts: list[ContextFactResponse]

    model_config = {"from_attributes": True}


class ExtractRequest(BaseModel):
    """Request to trigger context extraction."""

    force: bool = False


class ExtractResponse(BaseModel):
    """Response from extraction trigger."""

    status: Literal["extracting", "cached"]


class FactStatusUpdate(BaseModel):
    """Request to update a fact's status."""

    status: FactStatus


class PinnedFact(BaseModel):
    """A pinned fact sent to the rewrite endpoint."""

    category: FactCategory
    content: str
    detail: str | None = None
```

**Step 2: Extend RewriteRequest**

Modify `services/core-api/app/schemas/rewrite.py` to add `context_summary` and `pinned_facts`:

```python
# Add import at top
from app.schemas.story_context import PinnedFact

class RewriteRequest(BaseModel):
    """Request body for POST /api/stories/{story_id}/rewrite."""

    content: str
    conversation_id: str | None = None
    pinned_context_ids: list[str] = []
    writing_style: str | None = None
    length_preference: str | None = None
    persona_id: str = "biographer"
    context_summary: str | None = None
    pinned_facts: list[PinnedFact] = []
```

**Step 3: Verify schemas load**

Run: `cd services/core-api && uv run python -c "from app.schemas.story_context import StoryContextResponse, ContextFactResponse; from app.schemas.rewrite import RewriteRequest; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add services/core-api/app/schemas/story_context.py services/core-api/app/schemas/rewrite.py
git commit -m "feat: add Pydantic schemas for story context and extend RewriteRequest"
```

---

## Task 4: Backend — Context Extraction Service ✅

**Files:**
- Create: `services/core-api/app/services/context_extractor.py`

This service handles LLM-based extraction from story text and conversation messages.

**Step 1: Create the extraction service**

```python
# services/core-api/app/services/context_extractor.py
"""Service for extracting structured context from stories and conversations."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.ai import LLMProvider
from app.models.ai import AIMessage
from app.models.story_context import ContextFact, StoryContext

logger = logging.getLogger(__name__)

SEED_EXTRACTION_PROMPT = """You are extracting structured facts from a memorial story.

Given the story text below, extract:
1. A 2-3 sentence narrative summary
2. Individual facts organized by category

Categories:
- person: Named people mentioned
- place: Locations, addresses, geographic references
- date: Dates, time periods, seasons, years
- event: Specific events, occasions, milestones
- emotion: Feelings, moods, emotional themes
- relationship: How people relate to each other (e.g., "grandmother of John")
- object: Significant objects, heirlooms, items

Return ONLY valid JSON in this exact format:
{
  "summary": "2-3 sentence narrative brief",
  "facts": [
    {"category": "person", "content": "short label", "detail": "optional elaboration"},
    {"category": "place", "content": "Portland, OR", "detail": "where John grew up"}
  ]
}

Story text:
"""

CONVERSATION_EXTRACTION_PROMPT = """You are extracting NEW facts learned from a memorial story conversation.

Given the conversation exchange below and facts already known, extract ONLY new information not already captured.

Known facts:
{known_facts}

Latest conversation exchange:
User: {user_message}
Assistant: {assistant_message}

Return ONLY valid JSON:
{{
  "updated_summary": "revised 2-3 sentence brief incorporating any new information, or null if no update needed",
  "new_facts": [
    {{"category": "person|place|date|event|emotion|relationship|object", "content": "short label", "detail": "optional elaboration"}}
  ]
}}

If nothing new was learned, return: {{"updated_summary": null, "new_facts": []}}
"""

VALID_CATEGORIES = {"person", "place", "date", "event", "emotion", "relationship", "object"}


class ContextExtractor:
    """Extracts structured facts from story text and conversations using LLM."""

    def __init__(self, llm_provider: LLMProvider, model_id: str) -> None:
        self._llm = llm_provider
        self._model_id = model_id

    async def extract_from_story(
        self,
        db: AsyncSession,
        story_id: UUID,
        user_id: UUID,
        story_content: str,
    ) -> StoryContext:
        """Extract facts from story text and persist to database.

        Creates or updates the StoryContext for this story+user.
        """
        # Get or create StoryContext
        ctx = await self._get_or_create_context(db, story_id, user_id)

        # Mark as extracting
        ctx.extracting = True
        await db.commit()

        try:
            # Call LLM for extraction
            prompt = SEED_EXTRACTION_PROMPT + story_content[:8000]
            result = await self._call_llm(prompt)

            if result is None:
                ctx.extracting = False
                await db.commit()
                return ctx

            # Parse and persist
            summary = result.get("summary")
            facts_data = result.get("facts", [])

            if summary:
                ctx.summary = summary
                ctx.summary_updated_at = func.current_timestamp()

            for fact_data in facts_data:
                category = fact_data.get("category", "").lower()
                content = fact_data.get("content", "").strip()
                if not content or category not in VALID_CATEGORIES:
                    continue
                detail = fact_data.get("detail")

                # Deduplicate by category + content
                existing = await self._find_existing_fact(
                    db, ctx.id, category, content
                )
                if existing:
                    if detail and (not existing.detail or len(detail) > len(existing.detail)):
                        existing.detail = detail
                else:
                    fact = ContextFact(
                        story_context_id=ctx.id,
                        category=category,
                        content=content,
                        detail=detail,
                        source="story",
                        status="active",
                    )
                    db.add(fact)

            ctx.extracting = False
            ctx.updated_at = func.current_timestamp()
            await db.commit()
            await db.refresh(ctx)
            return ctx

        except Exception:
            logger.exception("context_extractor.story.failed")
            ctx.extracting = False
            await db.commit()
            return ctx

    async def extract_from_conversation(
        self,
        db: AsyncSession,
        story_id: UUID,
        user_id: UUID,
        user_message: str,
        assistant_message: str,
        message_id: UUID | None = None,
    ) -> StoryContext | None:
        """Extract new facts from a conversation exchange.

        Called as a background task after each assistant message.
        """
        ctx = await self._get_or_create_context(db, story_id, user_id)

        try:
            # Build known facts summary
            existing_facts = await db.execute(
                select(ContextFact)
                .where(ContextFact.story_context_id == ctx.id)
                .where(ContextFact.status != "dismissed")
            )
            known = existing_facts.scalars().all()
            known_facts_str = json.dumps(
                [{"category": f.category, "content": f.content, "detail": f.detail} for f in known],
                indent=2,
            )

            prompt = CONVERSATION_EXTRACTION_PROMPT.format(
                known_facts=known_facts_str,
                user_message=user_message,
                assistant_message=assistant_message,
            )
            result = await self._call_llm(prompt)

            if result is None:
                return ctx

            # Update summary if provided
            updated_summary = result.get("updated_summary")
            if updated_summary:
                ctx.summary = updated_summary
                ctx.summary_updated_at = func.current_timestamp()

            # Add new facts
            new_facts = result.get("new_facts", [])
            for fact_data in new_facts:
                category = fact_data.get("category", "").lower()
                content = fact_data.get("content", "").strip()
                if not content or category not in VALID_CATEGORIES:
                    continue
                detail = fact_data.get("detail")

                existing = await self._find_existing_fact(
                    db, ctx.id, category, content
                )
                if existing:
                    if detail and (not existing.detail or len(detail) > len(existing.detail)):
                        existing.detail = detail
                else:
                    fact = ContextFact(
                        story_context_id=ctx.id,
                        category=category,
                        content=content,
                        detail=detail,
                        source="conversation",
                        source_message_id=message_id,
                        status="active",
                    )
                    db.add(fact)

            ctx.updated_at = func.current_timestamp()
            await db.commit()
            await db.refresh(ctx)
            return ctx

        except Exception:
            logger.exception("context_extractor.conversation.failed")
            return ctx

    async def _get_or_create_context(
        self, db: AsyncSession, story_id: UUID, user_id: UUID
    ) -> StoryContext:
        """Get existing StoryContext or create a new one."""
        result = await db.execute(
            select(StoryContext).where(
                StoryContext.story_id == story_id,
                StoryContext.user_id == user_id,
            )
        )
        ctx = result.scalar_one_or_none()
        if ctx:
            return ctx

        ctx = StoryContext(story_id=story_id, user_id=user_id)
        db.add(ctx)
        await db.flush()
        return ctx

    async def _find_existing_fact(
        self,
        db: AsyncSession,
        context_id: UUID,
        category: str,
        content: str,
    ) -> ContextFact | None:
        """Find an existing fact by category and content (case-insensitive)."""
        result = await db.execute(
            select(ContextFact).where(
                ContextFact.story_context_id == context_id,
                ContextFact.category == category,
                func.lower(ContextFact.content) == content.lower(),
            )
        )
        return result.scalar_one_or_none()

    async def _call_llm(self, prompt: str) -> dict | None:
        """Call LLM and parse JSON response."""
        full_text = ""
        try:
            async for chunk in self._llm.stream_generate(
                messages=[{"role": "user", "content": prompt}],
                system_prompt="You are a precise fact extraction assistant. Return only valid JSON.",
                model_id=self._model_id,
                max_tokens=2048,
            ):
                full_text += chunk

            # Strip markdown code fences if present
            text = full_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            if text.startswith("json"):
                text = text[4:].strip()

            return json.loads(text)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning(
                "context_extractor.llm.parse_failed",
                extra={"error": str(exc), "raw_text": full_text[:500]},
            )
            return None
```

**Step 2: Verify service loads**

Run: `cd services/core-api && uv run python -c "from app.services.context_extractor import ContextExtractor; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/services/context_extractor.py
git commit -m "feat: add ContextExtractor service for LLM-based fact extraction"
```

---

## Task 5: Backend — Context API Endpoints ✅

**Files:**
- Create: `services/core-api/app/routes/story_context.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Create the context routes**

```python
# services/core-api/app/routes/story_context.py
"""API routes for story context (extracted facts and summary)."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.middleware import require_auth
from app.database import get_db, get_db_for_background
from app.models.story import Story
from app.models.story_context import ContextFact, StoryContext
from app.providers.registry import get_provider_registry
from app.schemas.story_context import (
    ExtractRequest,
    ExtractResponse,
    FactStatusUpdate,
    ContextFactResponse,
    StoryContextResponse,
)
from app.services.context_extractor import ContextExtractor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}/context", tags=["story-context"])


def _get_extractor() -> ContextExtractor:
    """Create a ContextExtractor with the configured LLM provider."""
    registry = get_provider_registry()
    llm = registry.get_llm_provider()
    from app.config import get_settings

    settings = get_settings()
    model_id = getattr(settings, "context_extraction_model_id", None) or "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    return ContextExtractor(llm_provider=llm, model_id=model_id)


@router.get("", response_model=StoryContextResponse)
async def get_story_context(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryContextResponse:
    """Get the extracted context (summary + facts) for a story."""
    session_data = require_auth(request)

    result = await db.execute(
        select(StoryContext)
        .options(selectinload(StoryContext.facts))
        .where(
            StoryContext.story_id == story_id,
            StoryContext.user_id == session_data.user_id,
        )
    )
    ctx = result.scalar_one_or_none()

    if not ctx:
        # Return empty context (not yet extracted)
        raise HTTPException(status_code=404, detail="No context found for this story")

    # Filter out dismissed facts from the response
    active_facts = [f for f in ctx.facts if f.status != "dismissed"]

    return StoryContextResponse(
        id=ctx.id,
        story_id=ctx.story_id,
        summary=ctx.summary,
        summary_updated_at=ctx.summary_updated_at,
        extracting=ctx.extracting,
        facts=[ContextFactResponse.model_validate(f) for f in active_facts],
    )


@router.post("/extract", response_model=ExtractResponse, status_code=202)
async def extract_context(
    story_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    data: ExtractRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> ExtractResponse:
    """Trigger context extraction from story text. Runs in background."""
    session_data = require_auth(request)
    user_id = session_data.user_id
    force = data.force if data else False

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # Check if already extracted and not forcing
    if not force:
        existing = await db.execute(
            select(StoryContext).where(
                StoryContext.story_id == story_id,
                StoryContext.user_id == user_id,
            )
        )
        ctx = existing.scalar_one_or_none()
        if ctx and ctx.summary and not ctx.extracting:
            return ExtractResponse(status="cached")

    # Run extraction in background
    story_content = story.content

    async def background_extract() -> None:
        try:
            async for bg_db in get_db_for_background():
                extractor = _get_extractor()
                await extractor.extract_from_story(
                    db=bg_db,
                    story_id=story_id,
                    user_id=user_id,
                    story_content=story_content,
                )
        except Exception:
            logger.exception(
                "story_context.extract.background_failed",
                extra={"story_id": str(story_id)},
            )

    background_tasks.add_task(background_extract)
    return ExtractResponse(status="extracting")


@router.patch(
    "/facts/{fact_id}",
    response_model=ContextFactResponse,
)
async def update_fact_status(
    story_id: UUID,
    fact_id: UUID,
    data: FactStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ContextFactResponse:
    """Update a fact's status (pin, dismiss, reactivate)."""
    session_data = require_auth(request)

    # Verify the fact belongs to this user's context for this story
    result = await db.execute(
        select(ContextFact)
        .join(StoryContext)
        .where(
            ContextFact.id == fact_id,
            StoryContext.story_id == story_id,
            StoryContext.user_id == session_data.user_id,
        )
    )
    fact = result.scalar_one_or_none()
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    fact.status = data.status
    await db.commit()
    await db.refresh(fact)

    return ContextFactResponse.model_validate(fact)
```

**Step 2: Register the router in `main.py`**

Add to `services/core-api/app/main.py`:

After the existing import block (~line 35), add:
```python
from .routes.story_context import router as story_context_router
```

After `app.include_router(graph_context_router)` (~line 128), add:
```python
app.include_router(story_context_router)
```

**Step 3: Verify routes load**

Run: `cd services/core-api && uv run python -c "from app.routes.story_context import router; print(f'{len(router.routes)} routes loaded')"`
Expected: `3 routes loaded`

**Step 4: Commit**

```bash
git add services/core-api/app/routes/story_context.py services/core-api/app/main.py
git commit -m "feat: add story context API endpoints (GET, POST extract, PATCH fact)"
```

---

## Task 6: Backend — Post-Message Extraction Hook ✅

**Files:**
- Modify: `services/core-api/app/routes/ai.py`

The AI chat `send_message` endpoint needs to trigger async context extraction after saving the assistant message. We need to find where the assistant message is saved and add a background task.

**Step 1: Study the current `send_message` flow**

Read `services/core-api/app/routes/ai.py` to understand where assistant messages are saved and where to hook in.

**Step 2: Add background extraction after message completion**

In the `send_message` endpoint, after the assistant message is saved and the SSE `done` event is emitted, add a background task that:
1. Finds the story associated with this conversation (via legacy associations)
2. Calls `ContextExtractor.extract_from_conversation()`

The key change is inside the SSE generator function, after the assistant message is saved. Since we need `BackgroundTasks` from FastAPI, we add it as a dependency and queue the task.

Find the section where the `done` event is yielded in the streaming response. After the assistant message content is accumulated and saved, add:

```python
# After assistant message is saved, trigger context extraction
async def _extract_context_background(
    conversation_id: UUID,
    user_id: UUID,
    user_content: str,
    assistant_content: str,
    message_id: UUID,
) -> None:
    """Background task to extract context from conversation."""
    try:
        async for bg_db in get_db_for_background():
            # Find story_id via conversation's legacy associations
            from app.models.associations import ConversationLegacy
            from app.models.associations import StoryLegacy

            conv_legacy_result = await bg_db.execute(
                select(ConversationLegacy.legacy_id).where(
                    ConversationLegacy.conversation_id == conversation_id,
                    ConversationLegacy.role == "primary",
                )
            )
            legacy_id = conv_legacy_result.scalar_one_or_none()
            if not legacy_id:
                return

            # Find the most recent story for this legacy
            story_legacy_result = await bg_db.execute(
                select(StoryLegacy.story_id).where(
                    StoryLegacy.legacy_id == legacy_id,
                    StoryLegacy.role == "primary",
                ).limit(1)
            )
            story_id = story_legacy_result.scalar_one_or_none()
            if not story_id:
                return

            from app.services.context_extractor import ContextExtractor
            from app.providers.registry import get_provider_registry
            from app.config import get_settings

            registry = get_provider_registry()
            llm = registry.get_llm_provider()
            settings = get_settings()
            model_id = getattr(settings, "context_extraction_model_id", None) or "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
            extractor = ContextExtractor(llm_provider=llm, model_id=model_id)

            await extractor.extract_from_conversation(
                db=bg_db,
                story_id=story_id,
                user_id=user_id,
                user_message=user_content,
                assistant_message=assistant_content,
                message_id=message_id,
            )
    except Exception:
        logger.exception(
            "context_extraction.background.failed",
            extra={"conversation_id": str(conversation_id)},
        )
```

Important: The exact modification depends on where in `ai.py` the assistant message is finalized. Read the file carefully and add the background task call at the right point. The key is calling `background_tasks.add_task(_extract_context_background, ...)` with the accumulated assistant content.

**Step 3: Commit**

```bash
git add services/core-api/app/routes/ai.py
git commit -m "feat: add background context extraction after assistant messages"
```

---

## Task 7: Backend — Extend Rewrite with Pinned Facts ✅

**Files:**
- Modify: `services/core-api/app/routes/rewrite.py`

**Step 1: Add pinned facts to the rewrite context**

In `services/core-api/app/routes/rewrite.py`, after the `conversation_summary` is loaded (~line 113), add context from pinned facts:

```python
# After conversation_summary loading, add pinned facts context
pinned_facts_context = ""
if data.context_summary:
    pinned_facts_context += f"\n\n## Story Context Summary\n{data.context_summary}"
if data.pinned_facts:
    facts_text = "\n".join(
        f"- [{f.category}] {f.content}" + (f" — {f.detail}" if f.detail else "")
        for f in data.pinned_facts
    )
    pinned_facts_context += f"\n\n## Key Details (user-curated)\n{facts_text}"
```

Then modify the `user_message` construction (~line 123-126) to include `pinned_facts_context`:

```python
user_message = writer.build_user_message(
    original_story=data.content,
    summary_text=conversation_summary + additional_context + pinned_facts_context,
)
```

**Step 2: Commit**

```bash
git add services/core-api/app/routes/rewrite.py
git commit -m "feat: include pinned facts and context summary in rewrite prompt"
```

---

## Task 8: Backend — Validate all backend changes ✅

**Step 1: Run linting and type checking**

Run: `just validate-backend`
Expected: All checks pass

**Step 2: Fix any issues found**

Address any ruff or mypy errors.

**Step 3: Commit fixes if needed**

```bash
git add -u
git commit -m "fix: address linting and type checking issues for context panel"
```

---

## Task 9: Frontend — API Client ✅

**Files:**
- Create: `apps/web/src/features/evolve-workspace/api/storyContext.ts`

**Step 1: Create the API client**

```typescript
// apps/web/src/features/evolve-workspace/api/storyContext.ts
import { apiGet, apiPost, apiPatch } from '@/lib/api/client';

// --- Types ---

export type FactCategory =
  | 'person'
  | 'place'
  | 'date'
  | 'event'
  | 'emotion'
  | 'relationship'
  | 'object';

export type FactSource = 'story' | 'conversation';
export type FactStatus = 'active' | 'pinned' | 'dismissed';

export interface ContextFact {
  id: string;
  category: FactCategory;
  content: string;
  detail: string | null;
  source: FactSource;
  status: FactStatus;
  created_at: string;
}

export interface StoryContextResponse {
  id: string;
  story_id: string;
  summary: string | null;
  summary_updated_at: string | null;
  extracting: boolean;
  facts: ContextFact[];
}

export interface ExtractResponse {
  status: 'extracting' | 'cached';
}

// --- API Functions ---

export async function getStoryContext(
  storyId: string,
): Promise<StoryContextResponse> {
  return apiGet<StoryContextResponse>(`/api/stories/${storyId}/context`);
}

export async function extractContext(
  storyId: string,
  force = false,
): Promise<ExtractResponse> {
  return apiPost<ExtractResponse>(`/api/stories/${storyId}/context/extract`, {
    force,
  });
}

export async function updateFactStatus(
  storyId: string,
  factId: string,
  status: FactStatus,
): Promise<ContextFact> {
  return apiPatch<ContextFact>(
    `/api/stories/${storyId}/context/facts/${factId}`,
    { status },
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/api/storyContext.ts
git commit -m "feat: add story context API client"
```

---

## Task 10: Frontend — TanStack Query Hooks

**Files:**
- Create: `apps/web/src/features/evolve-workspace/hooks/useStoryContext.ts`

**Step 1: Create the hooks**

```typescript
// apps/web/src/features/evolve-workspace/hooks/useStoryContext.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStoryContext,
  extractContext,
  updateFactStatus,
  type StoryContextResponse,
  type ContextFact,
  type FactStatus,
} from '../api/storyContext';

export const storyContextKeys = {
  all: ['story-context'] as const,
  detail: (storyId: string) => [...storyContextKeys.all, storyId] as const,
};

/**
 * Fetch the extracted context (summary + facts) for a story.
 * Returns null if no context exists yet (404).
 */
export function useStoryContext(storyId: string | undefined) {
  return useQuery<StoryContextResponse | null>({
    queryKey: storyContextKeys.detail(storyId!),
    queryFn: async () => {
      try {
        return await getStoryContext(storyId!);
      } catch (err: unknown) {
        // 404 means no context yet — return null instead of throwing
        if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!storyId,
    staleTime: 30_000, // 30 seconds — refetches on tab switch
    refetchOnWindowFocus: false,
  });
}

/**
 * Trigger context extraction from story text.
 * Automatically refetches context after extraction starts.
 */
export function useExtractContext(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (force = false) => extractContext(storyId, force),
    onSuccess: () => {
      // Refetch context after a short delay to pick up extraction results
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: storyContextKeys.detail(storyId),
        });
      }, 3000);
    },
  });
}

/**
 * Update a fact's status with optimistic update.
 */
export function useUpdateFactStatus(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      factId,
      status,
    }: {
      factId: string;
      status: FactStatus;
    }) => updateFactStatus(storyId, factId, status),

    onMutate: async ({ factId, status }) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({
        queryKey: storyContextKeys.detail(storyId),
      });

      // Snapshot previous value
      const previous = queryClient.getQueryData<StoryContextResponse | null>(
        storyContextKeys.detail(storyId),
      );

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<StoryContextResponse>(
          storyContextKeys.detail(storyId),
          {
            ...previous,
            facts: previous.facts.map((f: ContextFact) =>
              f.id === factId ? { ...f, status } : f,
            ),
          },
        );
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Roll back on error
      if (context?.previous) {
        queryClient.setQueryData(
          storyContextKeys.detail(storyId),
          context.previous,
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: storyContextKeys.detail(storyId),
      });
    },
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/hooks/useStoryContext.ts
git commit -m "feat: add TanStack Query hooks for story context"
```

---

## Task 11: Frontend — Zustand Store Update

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts`

**Step 1: Add contextFilter state**

Add to the `EvolveWorkspaceState` interface (after the pinned context block, ~line 41):

```typescript
  // Context panel filter
  contextFilter: FactCategory | 'all';
  setContextFilter: (filter: FactCategory | 'all') => void;
```

Add to `initialState` (~line 63):

```typescript
  contextFilter: 'all' as FactCategory | 'all',
```

Add the action in the store create (~after line 134):

```typescript
  setContextFilter: (filter) => set({ contextFilter: filter }),
```

Also add the `FactCategory` import at the top of the file:

```typescript
import type { FactCategory } from '../api/storyContext';
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts
git commit -m "feat: add contextFilter state to evolve workspace store"
```

---

## Task 12: Frontend — Refactor ContextTool Component

**Files:**
- Rewrite: `apps/web/src/features/evolve-workspace/tools/ContextTool.tsx`

This is the main UI change — replacing the simple graph context display with the full summary + facts hybrid panel.

**Step 1: Rewrite ContextTool.tsx**

```tsx
// apps/web/src/features/evolve-workspace/tools/ContextTool.tsx
import { useEffect } from 'react';
import {
  Pin,
  PinOff,
  X,
  RefreshCw,
  User,
  MapPin,
  Calendar,
  Sparkles,
  Heart,
  Link2,
  Package,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStoryContext, useExtractContext, useUpdateFactStatus } from '../hooks/useStoryContext';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import type { ContextFact, FactCategory, FactStatus } from '../api/storyContext';

interface ContextToolProps {
  storyId: string;
}

const CATEGORY_CONFIG: Record<
  FactCategory,
  { label: string; icon: typeof User }
> = {
  person: { label: 'People', icon: User },
  place: { label: 'Places', icon: MapPin },
  date: { label: 'Dates & Periods', icon: Calendar },
  event: { label: 'Events', icon: Sparkles },
  emotion: { label: 'Emotions', icon: Heart },
  relationship: { label: 'Relationships', icon: Link2 },
  object: { label: 'Objects', icon: Package },
};

const CATEGORY_ORDER: FactCategory[] = [
  'person',
  'place',
  'date',
  'event',
  'emotion',
  'relationship',
  'object',
];

const FILTER_OPTIONS: Array<{ id: FactCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  ...CATEGORY_ORDER.map((c) => ({ id: c, label: CATEGORY_CONFIG[c].label })),
];

export function ContextTool({ storyId }: ContextToolProps) {
  const { data: context, isLoading } = useStoryContext(storyId);
  const extractMutation = useExtractContext(storyId);
  const updateFact = useUpdateFactStatus(storyId);

  const contextFilter = useEvolveWorkspaceStore((s) => s.contextFilter);
  const setContextFilter = useEvolveWorkspaceStore((s) => s.setContextFilter);

  // Auto-trigger extraction on first visit if no context exists
  useEffect(() => {
    if (context === null && !extractMutation.isPending) {
      extractMutation.mutate(false);
    }
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTogglePin = (fact: ContextFact) => {
    const newStatus: FactStatus = fact.status === 'pinned' ? 'active' : 'pinned';
    updateFact.mutate({ factId: fact.id, status: newStatus });
  };

  const handleDismiss = (fact: ContextFact) => {
    updateFact.mutate({ factId: fact.id, status: 'dismissed' });
  };

  const handleRefresh = () => {
    extractMutation.mutate(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading context...
      </div>
    );
  }

  // No context yet, extracting
  if (context === null || (context?.extracting && !context.summary)) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing story...
        </div>
        <p className="text-xs text-neutral-400">
          Extracting key details from your story. This may take a moment.
        </p>
      </div>
    );
  }

  // Separate facts by source for "new from conversation" section
  const allFacts = context?.facts ?? [];
  const filteredFacts =
    contextFilter === 'all'
      ? allFacts
      : allFacts.filter((f) => f.category === contextFilter);

  const storyFacts = filteredFacts.filter((f) => f.source === 'story');
  const conversationFacts = filteredFacts.filter((f) => f.source === 'conversation');

  // Group facts by category
  const groupByCategory = (facts: ContextFact[]) => {
    const groups: Partial<Record<FactCategory, ContextFact[]>> = {};
    for (const fact of facts) {
      (groups[fact.category] ??= []).push(fact);
    }
    return groups;
  };

  const storyGroups = groupByCategory(storyFacts);
  const hasStoryFacts = storyFacts.length > 0;
  const hasConversationFacts = conversationFacts.length > 0;

  return (
    <div className="p-3 space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          Context
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={extractMutation.isPending}
          className="h-7 w-7 p-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${extractMutation.isPending ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Summary */}
      {context?.summary && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-neutral-500 uppercase tracking-wide w-full group">
            <ChevronDown className="h-3 w-3 group-data-[state=closed]:hidden" />
            <ChevronRight className="h-3 w-3 group-data-[state=open]:hidden" />
            Summary
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-2.5 rounded-md border bg-neutral-50 text-sm text-neutral-700 leading-relaxed">
              {context.summary}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Category filter */}
      {allFacts.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Details
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                {FILTER_OPTIONS.find((o) => o.id === contextFilter)?.label ?? 'All'}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  onClick={() => setContextFilter(opt.id)}
                  className={contextFilter === opt.id ? 'bg-neutral-100' : ''}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Story facts grouped by category */}
      {hasStoryFacts &&
        CATEGORY_ORDER.map((cat) => {
          const facts = storyGroups[cat];
          if (!facts || facts.length === 0) return null;
          const config = CATEGORY_CONFIG[cat];
          const Icon = config.icon;
          return (
            <div key={cat}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-500">{config.label}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {facts.map((fact) => (
                  <FactCard
                    key={fact.id}
                    fact={fact}
                    onTogglePin={handleTogglePin}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {/* New from conversation separator */}
      {hasConversationFacts && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 border-t border-dashed border-neutral-300" />
            <span className="text-[10px] font-medium text-theme-primary uppercase tracking-wider">
              New from conversation
            </span>
            <div className="flex-1 border-t border-dashed border-neutral-300" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conversationFacts.map((fact) => (
              <FactCard
                key={fact.id}
                fact={fact}
                onTogglePin={handleTogglePin}
                onDismiss={handleDismiss}
                isNew
              />
            ))}
          </div>
        </>
      )}

      {/* Extracting indicator */}
      {context?.extracting && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 pt-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Analyzing conversation...
        </div>
      )}

      {/* Empty state */}
      {!hasStoryFacts && !hasConversationFacts && !context?.summary && (
        <div className="text-sm text-neutral-400">
          No details found yet. Continue chatting to build context.
        </div>
      )}
    </div>
  );
}

// --- FactCard sub-component ---

function FactCard({
  fact,
  onTogglePin,
  onDismiss,
  isNew = false,
}: {
  fact: ContextFact;
  onTogglePin: (fact: ContextFact) => void;
  onDismiss: (fact: ContextFact) => void;
  isNew?: boolean;
}) {
  const isPinned = fact.status === 'pinned';
  const config = CATEGORY_CONFIG[fact.category];
  const Icon = config.icon;

  return (
    <div
      className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-md border text-sm transition-colors ${
        isPinned
          ? 'border-theme-primary/30 bg-theme-primary/5'
          : isNew
            ? 'border-theme-primary/20 bg-theme-primary/[0.02]'
            : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <Icon className="h-3 w-3 text-neutral-400 shrink-0" />
      <span className="truncate max-w-[140px]" title={fact.detail ?? fact.content}>
        {fact.content}
      </span>

      {/* Pin toggle */}
      <button
        onClick={() => onTogglePin(fact)}
        className={`shrink-0 transition-opacity ${
          isPinned
            ? 'text-theme-primary opacity-100'
            : 'text-neutral-300 opacity-0 group-hover:opacity-100'
        }`}
        aria-label={isPinned ? 'Unpin from context' : 'Pin to context'}
      >
        {isPinned ? (
          <PinOff className="h-3 w-3" />
        ) : (
          <Pin className="h-3 w-3" />
        )}
      </button>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(fact)}
        className="shrink-0 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
        aria-label="Dismiss fact"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/ContextTool.tsx
git commit -m "feat: refactor ContextTool with summary + categorized fact cards"
```

---

## Task 13: Frontend — Wire Pinned Facts into Rewrite

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/api/rewrite.ts`
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`

**Step 1: Extend RewriteRequest type**

In `apps/web/src/features/evolve-workspace/api/rewrite.ts`, add to the `RewriteRequest` interface:

```typescript
export interface RewriteRequest {
  content: string;
  conversation_id?: string | null;
  pinned_context_ids?: string[];
  writing_style?: WritingStyle | null;
  length_preference?: LengthPreference | null;
  persona_id?: string;
  context_summary?: string | null;     // NEW
  pinned_facts?: Array<{               // NEW
    category: string;
    content: string;
    detail: string | null;
  }>;
}
```

**Step 2: Add pinned facts to handleRewrite in EvolveWorkspace.tsx**

In `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`, modify `handleRewrite` (~line 127-134):

Add import at top:
```typescript
import { storyContextKeys } from './hooks/useStoryContext';
import type { StoryContextResponse } from './api/storyContext';
```

Modify `handleRewrite`:
```typescript
  const handleRewrite = useCallback(() => {
    // Gather pinned facts from context panel
    const context = queryClient.getQueryData<StoryContextResponse | null>(
      storyContextKeys.detail(storyId),
    );
    const pinnedFacts = context?.facts
      ?.filter((f) => f.status === 'pinned')
      .map(({ category, content, detail }) => ({ category, content, detail }));

    triggerRewrite(content, {
      conversation_id: conversationId,
      pinned_context_ids: pinnedContextIds,
      writing_style: writingStyle,
      length_preference: lengthPreference,
      context_summary: context?.summary ?? undefined,
      pinned_facts: pinnedFacts,
    });
  }, [content, conversationId, pinnedContextIds, writingStyle, lengthPreference, triggerRewrite, queryClient, storyId]);
```

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/api/rewrite.ts apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx
git commit -m "feat: wire pinned facts and context summary into rewrite trigger"
```

---

## Task 14: Frontend — Lint and Type Check

**Step 1: Run TypeScript type checking**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 2: Run ESLint**

Run: `cd apps/web && npm run lint`
Expected: No errors

**Step 3: Fix any issues**

Address TypeScript or ESLint errors.

**Step 4: Commit fixes if needed**

```bash
git add -u
git commit -m "fix: address frontend lint and type issues for context panel"
```

---

## Task 15: Full Stack Validation

**Step 1: Validate backend**

Run: `just validate-backend`
Expected: All checks pass (ruff + mypy)

**Step 2: Build frontend**

Run: `cd apps/web && npm run build`
Expected: Build succeeds

**Step 3: Run frontend tests**

Run: `cd apps/web && npm run test -- --run`
Expected: All tests pass

**Step 4: Run backend tests**

Run: `cd services/core-api && uv run pytest -x -q`
Expected: All tests pass

**Step 5: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: final validation fixes for context panel feature"
```

---

## Summary of Files

### Created
| File | Purpose |
|------|---------|
| `services/core-api/app/models/story_context.py` | StoryContext + ContextFact SQLAlchemy models |
| `services/core-api/alembic/versions/xxx_add_story_context_tables.py` | Database migration |
| `services/core-api/app/schemas/story_context.py` | Pydantic request/response schemas |
| `services/core-api/app/services/context_extractor.py` | LLM extraction service |
| `services/core-api/app/routes/story_context.py` | API endpoints (GET, POST, PATCH) |
| `apps/web/src/features/evolve-workspace/api/storyContext.ts` | Frontend API client |
| `apps/web/src/features/evolve-workspace/hooks/useStoryContext.ts` | TanStack Query hooks |

### Modified
| File | Change |
|------|--------|
| `services/core-api/app/models/__init__.py` | Register new models |
| `services/core-api/app/main.py` | Register new router |
| `services/core-api/app/schemas/rewrite.py` | Add context_summary + pinned_facts fields |
| `services/core-api/app/routes/rewrite.py` | Include pinned facts in rewrite prompt |
| `services/core-api/app/routes/ai.py` | Add background extraction after messages |
| `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts` | Add contextFilter |
| `apps/web/src/features/evolve-workspace/tools/ContextTool.tsx` | Full rewrite with summary + facts UI |
| `apps/web/src/features/evolve-workspace/api/rewrite.ts` | Add context fields to RewriteRequest |
| `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx` | Wire pinned facts into rewrite |
