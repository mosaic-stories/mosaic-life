# Story Metadata & Title Image Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent, reader-facing metadata (people, places, events, dates) and title images to stories, with privacy controls and context-fact publishing.

**Architecture:** New `StoryMetadataDetail` model mirrors the `ContextFact` pattern. Two new fields on `Story` (`title_image_id`, `metadata_visible`). New route module at `/api/stories/{story_id}/metadata`. Frontend gets a collapsible metadata panel and title image header. Neptune sync deferred to a follow-up task.

**Tech Stack:** Python/FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, React/TypeScript, TanStack Query, shadcn/ui

**Design Doc:** `docs/plans/2026-03-23-story-metadata-design.md`

---

## Task 1: StoryMetadataDetail Model

**Files:**
- Create: `services/core-api/app/models/story_metadata.py`
- Modify: `services/core-api/app/models/story.py:1-109`
- Modify: `services/core-api/app/models/__init__.py:1-72`

**Step 1: Create the StoryMetadataDetail model**

Create `services/core-api/app/models/story_metadata.py`:

```python
"""SQLAlchemy model for story metadata details."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from .person import Person
    from .story import Story
    from .story_context import ContextFact


class StoryMetadataDetail(Base):
    """A reader-facing metadata detail attached to a story."""

    __tablename__ = "story_metadata_details"
    __table_args__ = (
        UniqueConstraint(
            "story_id", "category", "content",
            name="uq_story_metadata_story_category_content",
        ),
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
    category: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )  # person, place, event, date
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    person_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="manual"
    )  # 'manual' or 'context_fact'
    source_fact_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("context_facts.id", ondelete="SET NULL"),
        nullable=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    graph_synced_at: Mapped[datetime | None] = mapped_column(
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

    # Relationships
    story: Mapped["Story"] = relationship("Story", back_populates="metadata_details")
    person: Mapped["Person | None"] = relationship("Person", lazy="joined")
    source_fact: Mapped["ContextFact | None"] = relationship("ContextFact", lazy="select")
```

**Step 2: Add title_image_id, metadata_visible, and relationship to Story model**

In `services/core-api/app/models/story.py`:

- Add import: `from sqlalchemy import Boolean` to the existing import line
- Add `TYPE_CHECKING` import for `Media` and `StoryMetadataDetail`
- After `source_conversation_id` (line 88), add:

```python
    title_image_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    metadata_visible: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
```

- In the relationships section (after line 103), add:

```python
    title_image: Mapped["Media | None"] = relationship(
        "Media", foreign_keys=[title_image_id], lazy="joined"
    )
    metadata_details: Mapped[list["StoryMetadataDetail"]] = relationship(
        "StoryMetadataDetail",
        back_populates="story",
        cascade="all, delete-orphan",
        order_by="StoryMetadataDetail.position",
    )
```

**Step 3: Register in models/__init__.py**

In `services/core-api/app/models/__init__.py`:

- Add import: `from .story_metadata import StoryMetadataDetail`
- Add `"StoryMetadataDetail"` to `__all__` (alphabetically, after `"StoryLegacy"`)

**Step 4: Run model validation**

Run: `cd services/core-api && uv run python -c "from app.models import StoryMetadataDetail, Story; print('Models OK')"`
Expected: `Models OK`

**Step 5: Commit**

```bash
git add services/core-api/app/models/story_metadata.py services/core-api/app/models/story.py services/core-api/app/models/__init__.py
git commit -m "feat(story): add StoryMetadataDetail model and title_image_id to Story"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_story_metadata_details_and_title_image.py`

**Step 1: Generate migration**

Run: `cd services/core-api && uv run alembic revision --autogenerate -m "add story metadata details and title image"`

**Step 2: Review the generated migration**

Verify it contains:
- `op.create_table("story_metadata_details", ...)` with all columns
- `op.add_column("stories", sa.Column("title_image_id", ...))`
- `op.add_column("stories", sa.Column("metadata_visible", ...))`
- Foreign keys and indexes
- Unique constraint `uq_story_metadata_story_category_content`
- Proper `downgrade()` that drops the table and columns

**Step 3: Test migration against local database**

Run: `cd services/core-api && uv run alembic upgrade head`
Expected: Migration applies successfully

Run: `cd services/core-api && uv run alembic downgrade -1`
Expected: Downgrade succeeds

Run: `cd services/core-api && uv run alembic upgrade head`
Expected: Re-applies successfully

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(story): add migration for story_metadata_details and title_image"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/story_metadata.py`
- Modify: `services/core-api/app/schemas/story.py:54-71` (StoryUpdate)
- Modify: `services/core-api/app/schemas/story.py:145-168` (StoryDetail)

**Step 1: Create story metadata schemas**

Create `services/core-api/app/schemas/story_metadata.py`:

```python
"""Pydantic schemas for story metadata API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

MetadataCategory = Literal["person", "place", "event", "date"]
MetadataSource = Literal["manual", "context_fact"]


class MetadataDetailCreate(BaseModel):
    """Schema for creating a metadata detail."""

    category: MetadataCategory
    content: str = Field(..., min_length=1, max_length=500)
    detail: str | None = Field(None, max_length=1000)
    person_id: UUID | None = None
    position: int = 0


class MetadataDetailUpdate(BaseModel):
    """Schema for updating a metadata detail."""

    content: str | None = Field(None, min_length=1, max_length=500)
    detail: str | None = Field(None, max_length=1000)
    person_id: UUID | None = None
    position: int | None = None


class MetadataDetailResponse(BaseModel):
    """Schema for a single metadata detail in responses."""

    id: UUID
    story_id: UUID
    category: MetadataCategory
    content: str
    detail: str | None
    person_id: UUID | None
    person_name: str | None = None
    source: MetadataSource
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MetadataPublishRequest(BaseModel):
    """Schema for publishing context facts to metadata."""

    fact_ids: list[UUID] = Field(..., min_length=1)


class SetTitleImageRequest(BaseModel):
    """Schema for setting a story title image."""

    media_id: UUID
```

**Step 2: Add metadata_visible to StoryUpdate schema**

In `services/core-api/app/schemas/story.py`, add to `StoryUpdate` class (after the `legacies` field, line 71):

```python
    metadata_visible: bool | None = Field(
        None, description="Whether metadata panel is visible to admirer+ readers"
    )
```

**Step 3: Add title_image_url and metadata_visible to StoryDetail schema**

In `services/core-api/app/schemas/story.py`, add to `StoryDetail` class (after `favorite_count`, line 164):

```python
    title_image_url: str | None = None
    metadata_visible: bool = False
```

Also add `title_image_url` to `StorySummary` (after `favorite_count`, line 105):

```python
    title_image_url: str | None = None
```

**Step 4: Validate schemas**

Run: `cd services/core-api && uv run python -c "from app.schemas.story_metadata import MetadataDetailCreate, MetadataDetailResponse, MetadataPublishRequest; print('Schemas OK')"`
Expected: `Schemas OK`

**Step 5: Commit**

```bash
git add services/core-api/app/schemas/story_metadata.py services/core-api/app/schemas/story.py
git commit -m "feat(story): add story metadata schemas and update story schemas"
```

---

## Task 4: Story Metadata Service

**Files:**
- Create: `services/core-api/app/services/story_metadata.py`

**Step 1: Write the metadata service**

Create `services/core-api/app/services/story_metadata.py`:

```python
"""Service layer for story metadata operations."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.legacy import LegacyMember
from app.models.story import Story
from app.models.story_context import ContextFact, StoryContext
from app.models.story_metadata import StoryMetadataDetail
from app.schemas.story_metadata import MetadataDetailCreate, MetadataDetailUpdate

logger = logging.getLogger(__name__)


async def get_metadata_details(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
) -> list[StoryMetadataDetail]:
    """Get metadata details for a story, enforcing access rules."""
    story = await _load_story(db, story_id)

    is_author = story.author_id == user_id

    if not is_author:
        if not story.metadata_visible:
            return []
        if not await _is_admirer_or_higher(db, story, user_id):
            return []

    result = await db.execute(
        select(StoryMetadataDetail)
        .where(StoryMetadataDetail.story_id == story_id)
        .order_by(StoryMetadataDetail.category, StoryMetadataDetail.position)
    )
    return list(result.scalars().all())


async def create_metadata_detail(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    data: MetadataDetailCreate,
) -> StoryMetadataDetail:
    """Create a new metadata detail. Author only."""
    story = await _load_story(db, story_id)
    _require_author(story, user_id)

    detail = StoryMetadataDetail(
        story_id=story_id,
        category=data.category,
        content=data.content,
        detail=data.detail,
        person_id=data.person_id,
        source="manual",
        position=data.position,
    )
    db.add(detail)
    await db.commit()
    await db.refresh(detail)

    logger.info(
        "story_metadata.detail_created",
        extra={
            "story_id": str(story_id),
            "detail_id": str(detail.id),
            "category": data.category,
        },
    )
    return detail


async def update_metadata_detail(
    db: AsyncSession,
    story_id: UUID,
    detail_id: UUID,
    user_id: UUID,
    data: MetadataDetailUpdate,
) -> StoryMetadataDetail:
    """Update a metadata detail. Author only."""
    story = await _load_story(db, story_id)
    _require_author(story, user_id)

    detail = await _load_detail(db, story_id, detail_id)

    if data.content is not None:
        detail.content = data.content
    if data.detail is not None:
        detail.detail = data.detail
    if data.person_id is not None:
        detail.person_id = data.person_id
    if data.position is not None:
        detail.position = data.position

    await db.commit()
    await db.refresh(detail)

    logger.info(
        "story_metadata.detail_updated",
        extra={"story_id": str(story_id), "detail_id": str(detail_id)},
    )
    return detail


async def delete_metadata_detail(
    db: AsyncSession,
    story_id: UUID,
    detail_id: UUID,
    user_id: UUID,
) -> None:
    """Delete a metadata detail. Author only."""
    story = await _load_story(db, story_id)
    _require_author(story, user_id)

    detail = await _load_detail(db, story_id, detail_id)
    await db.delete(detail)
    await db.commit()

    logger.info(
        "story_metadata.detail_deleted",
        extra={"story_id": str(story_id), "detail_id": str(detail_id)},
    )


async def publish_context_facts(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    fact_ids: list[UUID],
) -> list[StoryMetadataDetail]:
    """Publish context facts as metadata details. Author only."""
    story = await _load_story(db, story_id)
    _require_author(story, user_id)

    # Load the requested facts that belong to this user's context
    result = await db.execute(
        select(ContextFact)
        .join(StoryContext)
        .where(
            ContextFact.id.in_(fact_ids),
            StoryContext.story_id == story_id,
            StoryContext.user_id == user_id,
        )
    )
    facts = list(result.scalars().all())

    if not facts:
        raise HTTPException(status_code=404, detail="No matching context facts found")

    # Only publish facts with supported categories
    supported_categories = {"person", "place", "event", "date"}
    published: list[StoryMetadataDetail] = []

    for fact in facts:
        if fact.category not in supported_categories:
            continue

        # Check for existing duplicate (unique constraint)
        existing = await db.execute(
            select(StoryMetadataDetail).where(
                StoryMetadataDetail.story_id == story_id,
                StoryMetadataDetail.category == fact.category,
                StoryMetadataDetail.content == fact.content,
            )
        )
        if existing.scalar_one_or_none():
            continue

        detail = StoryMetadataDetail(
            story_id=story_id,
            category=fact.category,
            content=fact.content,
            detail=fact.detail,
            source="context_fact",
            source_fact_id=fact.id,
        )
        db.add(detail)
        published.append(detail)

    await db.commit()
    for d in published:
        await db.refresh(d)

    logger.info(
        "story_metadata.facts_published",
        extra={
            "story_id": str(story_id),
            "published_count": len(published),
            "requested_count": len(fact_ids),
        },
    )
    return published


async def set_title_image(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    media_id: UUID,
) -> None:
    """Set the title image for a story. Author only."""
    story = await _load_story(db, story_id)
    _require_author(story, user_id)

    story.title_image_id = media_id
    await db.commit()

    logger.info(
        "story_metadata.title_image_set",
        extra={"story_id": str(story_id), "media_id": str(media_id)},
    )


async def clear_title_image(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
) -> None:
    """Clear the title image for a story. Author only."""
    story = await _load_story(db, story_id)
    _require_author(story, user_id)

    story.title_image_id = None
    await db.commit()

    logger.info(
        "story_metadata.title_image_cleared",
        extra={"story_id": str(story_id)},
    )


# ── Helpers ──────────────────────────────────────────────────────────


async def _load_story(db: AsyncSession, story_id: UUID) -> Story:
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


async def _load_detail(
    db: AsyncSession, story_id: UUID, detail_id: UUID
) -> StoryMetadataDetail:
    result = await db.execute(
        select(StoryMetadataDetail).where(
            StoryMetadataDetail.id == detail_id,
            StoryMetadataDetail.story_id == story_id,
        )
    )
    detail = result.scalar_one_or_none()
    if not detail:
        raise HTTPException(status_code=404, detail="Metadata detail not found")
    return detail


def _require_author(story: Story, user_id: UUID) -> None:
    if story.author_id != user_id:
        raise HTTPException(
            status_code=403, detail="Only the story author can manage metadata"
        )


async def _is_admirer_or_higher(
    db: AsyncSession, story: Story, user_id: UUID
) -> bool:
    """Check if user has admirer+ role on any of the story's legacies."""
    story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    if not story_legacy_ids:
        return False

    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.user_id == user_id,
            LegacyMember.legacy_id.in_(story_legacy_ids),
            LegacyMember.role.in_(["creator", "admin", "advocate", "admirer"]),
        )
    )
    return result.scalar_one_or_none() is not None
```

**Step 2: Validate**

Run: `cd services/core-api && uv run python -c "from app.services.story_metadata import get_metadata_details, publish_context_facts; print('Service OK')"`
Expected: `Service OK`

**Step 3: Commit**

```bash
git add services/core-api/app/services/story_metadata.py
git commit -m "feat(story): add story metadata service layer"
```

---

## Task 5: Story Metadata Routes

**Files:**
- Create: `services/core-api/app/routes/story_metadata.py`
- Modify: `services/core-api/app/main.py:37,140` (register router)

**Step 1: Create the route module**

Create `services/core-api/app/routes/story_metadata.py`:

```python
"""API routes for story metadata (reader-facing details and title image)."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.schemas.story_metadata import (
    MetadataDetailCreate,
    MetadataDetailResponse,
    MetadataDetailUpdate,
    MetadataPublishRequest,
    SetTitleImageRequest,
)
from app.services import story_metadata as metadata_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/stories/{story_id}/metadata",
    tags=["story-metadata"],
)


@router.get("", response_model=list[MetadataDetailResponse])
async def list_metadata_details(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[MetadataDetailResponse]:
    """List metadata details for a story.

    Returns details if user is author, or if metadata_visible=true
    and user has admirer+ role on a linked legacy.
    Returns empty list (not 403) if access denied.
    """
    session_data = require_auth(request)
    details = await metadata_service.get_metadata_details(
        db=db, story_id=story_id, user_id=session_data.user_id
    )
    return [
        MetadataDetailResponse(
            id=d.id,
            story_id=d.story_id,
            category=d.category,
            content=d.content,
            detail=d.detail,
            person_id=d.person_id,
            person_name=d.person.canonical_name if d.person else None,
            source=d.source,
            position=d.position,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in details
    ]


@router.post("", response_model=MetadataDetailResponse, status_code=201)
async def create_metadata_detail(
    story_id: UUID,
    data: MetadataDetailCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MetadataDetailResponse:
    """Create a new metadata detail manually. Author only."""
    session_data = require_auth(request)
    detail = await metadata_service.create_metadata_detail(
        db=db, story_id=story_id, user_id=session_data.user_id, data=data
    )
    return MetadataDetailResponse(
        id=detail.id,
        story_id=detail.story_id,
        category=detail.category,
        content=detail.content,
        detail=detail.detail,
        person_id=detail.person_id,
        person_name=detail.person.canonical_name if detail.person else None,
        source=detail.source,
        position=detail.position,
        created_at=detail.created_at,
        updated_at=detail.updated_at,
    )


@router.post("/publish", response_model=list[MetadataDetailResponse])
async def publish_context_facts(
    story_id: UUID,
    data: MetadataPublishRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[MetadataDetailResponse]:
    """Publish selected context facts as metadata details. Author only."""
    session_data = require_auth(request)
    details = await metadata_service.publish_context_facts(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
        fact_ids=data.fact_ids,
    )
    return [
        MetadataDetailResponse(
            id=d.id,
            story_id=d.story_id,
            category=d.category,
            content=d.content,
            detail=d.detail,
            person_id=d.person_id,
            person_name=d.person.canonical_name if d.person else None,
            source=d.source,
            position=d.position,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in details
    ]


@router.put("/{detail_id}", response_model=MetadataDetailResponse)
async def update_metadata_detail(
    story_id: UUID,
    detail_id: UUID,
    data: MetadataDetailUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MetadataDetailResponse:
    """Update a metadata detail. Author only."""
    session_data = require_auth(request)
    detail = await metadata_service.update_metadata_detail(
        db=db,
        story_id=story_id,
        detail_id=detail_id,
        user_id=session_data.user_id,
        data=data,
    )
    return MetadataDetailResponse(
        id=detail.id,
        story_id=detail.story_id,
        category=detail.category,
        content=detail.content,
        detail=detail.detail,
        person_id=detail.person_id,
        person_name=detail.person.canonical_name if detail.person else None,
        source=detail.source,
        position=detail.position,
        created_at=detail.created_at,
        updated_at=detail.updated_at,
    )


@router.delete("/{detail_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metadata_detail(
    story_id: UUID,
    detail_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a metadata detail. Author only."""
    session_data = require_auth(request)
    await metadata_service.delete_metadata_detail(
        db=db,
        story_id=story_id,
        detail_id=detail_id,
        user_id=session_data.user_id,
    )


# ── Title Image ──────────────────────────────────────────────────────


@router.patch(
    "/title-image",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set story title image",
)
async def set_title_image(
    story_id: UUID,
    data: SetTitleImageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Set the title image for a story. Author only."""
    session_data = require_auth(request)
    await metadata_service.set_title_image(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
        media_id=data.media_id,
    )


@router.delete(
    "/title-image",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear story title image",
)
async def clear_title_image(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear the title image for a story. Author only."""
    session_data = require_auth(request)
    await metadata_service.clear_title_image(
        db=db, story_id=story_id, user_id=session_data.user_id
    )
```

**Step 2: Register router in main.py**

In `services/core-api/app/main.py`:

- Add import (after story_context_router import, line 37):
```python
from .routes.story_metadata import router as story_metadata_router
```

- Add router (after story_context_router inclusion, line 140):
```python
app.include_router(story_metadata_router)
```

**Step 3: Validate**

Run: `cd services/core-api && uv run python -c "from app.main import app; print('App OK')"`
Expected: `App OK`

**Step 4: Commit**

```bash
git add services/core-api/app/routes/story_metadata.py services/core-api/app/main.py
git commit -m "feat(story): add story metadata API routes"
```

---

## Task 6: Update Story Routes for metadata_visible and title_image_url

**Files:**
- Modify: `services/core-api/app/routes/story.py` (story detail/list response building)
- Modify: `services/core-api/app/services/story.py` (include title_image_url in responses)

**Step 1: Identify where StoryDetail and StorySummary responses are built**

Read `services/core-api/app/routes/story.py` to find where `StoryDetail` and `StorySummary` are constructed. Add `title_image_url` and `metadata_visible` to those response builders.

The `title_image_url` should be computed from the `title_image` relationship:
```python
title_image_url = f"/api/media/{story.title_image_id}/content" if story.title_image_id else None
```

Follow the same pattern used for `background_image_url` in legacy responses.

**Step 2: Update StoryUpdate handling**

In the story update route handler, add handling for `metadata_visible` field:
```python
if data.metadata_visible is not None:
    story.metadata_visible = data.metadata_visible
```

**Step 3: Validate**

Run: `cd services/core-api && just validate-backend`
Expected: All checks pass

**Step 4: Commit**

```bash
git add services/core-api/app/routes/story.py services/core-api/app/services/story.py
git commit -m "feat(story): include title_image_url and metadata_visible in story responses"
```

---

## Task 7: Backend Tests

**Files:**
- Create: `services/core-api/tests/routes/test_story_metadata_route.py`

**Step 1: Write route tests**

Create `services/core-api/tests/routes/test_story_metadata_route.py`:

```python
"""Tests for story metadata routes."""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models.story import Story
from app.models.story_context import ContextFact, StoryContext
from app.models.story_metadata import StoryMetadataDetail
from app.models.user import User
from app.models.legacy import LegacyMember, Legacy
from tests.conftest import create_auth_headers_for_user


class TestListMetadataDetails:
    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        response = await client.get(f"/api/stories/{uuid4()}/metadata")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_empty_for_non_author_when_not_visible(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.get(
            f"/api/stories/{test_story.id}/metadata", headers=headers
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_author_sees_details(
        self,
        client: AsyncClient,
        test_story: Story,
        auth_headers: dict[str, str],
        db_session,
    ) -> None:
        detail = StoryMetadataDetail(
            story_id=test_story.id,
            category="person",
            content="Uncle Ray",
            source="manual",
        )
        db_session.add(detail)
        await db_session.commit()

        response = await client.get(
            f"/api/stories/{test_story.id}/metadata", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["content"] == "Uncle Ray"
        assert data[0]["category"] == "person"


class TestCreateMetadataDetail:
    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        response = await client.post(
            f"/api/stories/{uuid4()}/metadata",
            json={"category": "person", "content": "Test"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_author_can_create(
        self,
        client: AsyncClient,
        test_story: Story,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            f"/api/stories/{test_story.id}/metadata",
            headers=auth_headers,
            json={"category": "place", "content": "Chicago", "detail": "Hometown"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["category"] == "place"
        assert data["content"] == "Chicago"
        assert data["detail"] == "Hometown"
        assert data["source"] == "manual"

    @pytest.mark.asyncio
    async def test_non_author_cannot_create(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.post(
            f"/api/stories/{test_story.id}/metadata",
            headers=headers,
            json={"category": "person", "content": "Test"},
        )
        assert response.status_code == 403


class TestDeleteMetadataDetail:
    @pytest.mark.asyncio
    async def test_author_can_delete(
        self,
        client: AsyncClient,
        test_story: Story,
        auth_headers: dict[str, str],
        db_session,
    ) -> None:
        detail = StoryMetadataDetail(
            story_id=test_story.id,
            category="event",
            content="Wedding",
            source="manual",
        )
        db_session.add(detail)
        await db_session.commit()
        await db_session.refresh(detail)

        response = await client.delete(
            f"/api/stories/{test_story.id}/metadata/{detail.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204


class TestTitleImage:
    @pytest.mark.asyncio
    async def test_set_title_image(
        self,
        client: AsyncClient,
        test_story: Story,
        test_media,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.patch(
            f"/api/stories/{test_story.id}/metadata/title-image",
            headers=auth_headers,
            json={"media_id": str(test_media.id)},
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_clear_title_image(
        self,
        client: AsyncClient,
        test_story: Story,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.delete(
            f"/api/stories/{test_story.id}/metadata/title-image",
            headers=auth_headers,
        )
        assert response.status_code == 204
```

**Step 2: Run tests**

Run: `cd services/core-api && uv run pytest tests/routes/test_story_metadata_route.py -v`
Expected: All tests pass

**Step 3: Run full test suite**

Run: `cd services/core-api && uv run pytest --tb=short -q`
Expected: No regressions

**Step 4: Run backend validation**

Run: `just validate-backend`
Expected: All checks pass (ruff + mypy)

**Step 5: Commit**

```bash
git add services/core-api/tests/routes/test_story_metadata_route.py
git commit -m "test(story): add story metadata route tests"
```

---

## Task 8: Frontend Types & API Functions

**Files:**
- Create: `apps/web/src/features/story/api/storyMetadata.ts`
- Modify: `apps/web/src/features/story/api/stories.ts:34-52` (StoryDetail type)

**Step 1: Update StoryDetail and StorySummary types**

In `apps/web/src/features/story/api/stories.ts`:

Add to `StorySummary` interface (after `favorite_count`):
```typescript
  title_image_url: string | null;
```

Add to `StoryDetail` interface (after `favorite_count`):
```typescript
  title_image_url: string | null;
  metadata_visible: boolean;
```

Add to `UpdateStoryInput` interface:
```typescript
  metadata_visible?: boolean;
```

**Step 2: Create storyMetadata API module**

Create `apps/web/src/features/story/api/storyMetadata.ts`:

```typescript
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api/client';

export type MetadataCategory = 'person' | 'place' | 'event' | 'date';

export interface MetadataDetail {
  id: string;
  story_id: string;
  category: MetadataCategory;
  content: string;
  detail: string | null;
  person_id: string | null;
  person_name: string | null;
  source: 'manual' | 'context_fact';
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMetadataInput {
  category: MetadataCategory;
  content: string;
  detail?: string;
  person_id?: string;
  position?: number;
}

export interface UpdateMetadataInput {
  content?: string;
  detail?: string;
  person_id?: string;
  position?: number;
}

export async function getMetadataDetails(storyId: string): Promise<MetadataDetail[]> {
  return apiGet<MetadataDetail[]>(`/api/stories/${storyId}/metadata`);
}

export async function createMetadataDetail(
  storyId: string,
  data: CreateMetadataInput,
): Promise<MetadataDetail> {
  return apiPost<MetadataDetail>(`/api/stories/${storyId}/metadata`, data);
}

export async function publishContextFacts(
  storyId: string,
  factIds: string[],
): Promise<MetadataDetail[]> {
  return apiPost<MetadataDetail[]>(`/api/stories/${storyId}/metadata/publish`, {
    fact_ids: factIds,
  });
}

export async function updateMetadataDetail(
  storyId: string,
  detailId: string,
  data: UpdateMetadataInput,
): Promise<MetadataDetail> {
  return apiPut<MetadataDetail>(`/api/stories/${storyId}/metadata/${detailId}`, data);
}

export async function deleteMetadataDetail(
  storyId: string,
  detailId: string,
): Promise<void> {
  return apiDelete(`/api/stories/${storyId}/metadata/${detailId}`);
}

export async function setTitleImage(storyId: string, mediaId: string): Promise<void> {
  return apiPatch(`/api/stories/${storyId}/metadata/title-image`, {
    media_id: mediaId,
  });
}

export async function clearTitleImage(storyId: string): Promise<void> {
  return apiDelete(`/api/stories/${storyId}/metadata/title-image`);
}
```

**Step 3: Commit**

```bash
git add apps/web/src/features/story/api/storyMetadata.ts apps/web/src/features/story/api/stories.ts
git commit -m "feat(web): add story metadata API types and functions"
```

---

## Task 9: Frontend Hooks

**Files:**
- Create: `apps/web/src/features/story/hooks/useStoryMetadata.ts`

**Step 1: Create the hooks module**

Create `apps/web/src/features/story/hooks/useStoryMetadata.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getMetadataDetails,
  createMetadataDetail,
  updateMetadataDetail,
  deleteMetadataDetail,
  publishContextFacts,
  setTitleImage,
  clearTitleImage,
  type CreateMetadataInput,
  type UpdateMetadataInput,
} from '../api/storyMetadata';
import { storyKeys } from './useStories';

export const metadataKeys = {
  all: ['story-metadata'] as const,
  list: (storyId: string) => [...metadataKeys.all, storyId] as const,
};

export function useStoryMetadata(storyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: metadataKeys.list(storyId!),
    queryFn: () => getMetadataDetails(storyId!),
    enabled: !!storyId && enabled,
  });
}

export function useCreateMetadata(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMetadataInput) => createMetadataDetail(storyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metadataKeys.list(storyId) });
    },
  });
}

export function useUpdateMetadata(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ detailId, data }: { detailId: string; data: UpdateMetadataInput }) =>
      updateMetadataDetail(storyId, detailId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metadataKeys.list(storyId) });
    },
  });
}

export function useDeleteMetadata(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (detailId: string) => deleteMetadataDetail(storyId, detailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metadataKeys.list(storyId) });
    },
  });
}

export function usePublishContextFacts(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (factIds: string[]) => publishContextFacts(storyId, factIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metadataKeys.list(storyId) });
    },
  });
}

export function useSetTitleImage(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) => setTitleImage(storyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

export function useClearTitleImage(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearTitleImage(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/story/hooks/useStoryMetadata.ts
git commit -m "feat(web): add story metadata TanStack Query hooks"
```

---

## Task 10: Frontend — Story Metadata Panel Component

**Files:**
- Create: `apps/web/src/features/story/components/StoryMetadataPanel.tsx`

**Step 1: Create the metadata panel component**

This is a collapsible side panel that displays metadata grouped by category. For the author, it includes add/remove controls. For readers (admirer+), it's read-only.

The component should:
- Accept `storyId`, `isAuthor`, and `metadata` props
- Group details by category (person, place, event, date)
- Show category icons: Users for person, MapPin for place, Calendar for date, Flag for event (from lucide-react)
- Use Card + collapsible sections (matching SidebarSection pattern)
- Author mode: show "Add Detail" button per category, delete buttons, and "Publish from Context" button
- Use a simple form dialog for adding details (category dropdown, content input, optional detail textarea)

**Implementation notes:**
- Follow the `LegacySidebar` component pattern (`aside` with `space-y-5`)
- Use `Card` from shadcn/ui for the panel container
- Use existing `Button`, `Input`, `Select`, `Dialog` components
- Import hooks from `useStoryMetadata.ts`

**Step 2: Commit**

```bash
git add apps/web/src/features/story/components/StoryMetadataPanel.tsx
git commit -m "feat(web): add StoryMetadataPanel component"
```

---

## Task 11: Frontend — Title Image in Story Header

**Files:**
- Modify: `apps/web/src/features/story/components/StoryViewer.tsx:1-69`

**Step 1: Add title image to StoryViewHeader**

Update `StoryViewHeader` (inside StoryViewer.tsx or as a separate sub-component) to:
- Accept `titleImageUrl` prop
- When present, render a background image behind the title using the same pattern as `ProfileHeader.tsx`:
  - `absolute inset-0` positioned image with `object-cover`
  - `opacity-30` on the image
  - Gradient overlay: `bg-gradient-to-b from-theme-primary-dark/30 to-theme-primary-dark/85`
  - Title text in white when image is present
- When no title image, render current style (no changes)
- Use `rewriteBackendUrlForDev()` for the image URL

**Step 2: For the author, add image picker integration**

When `isAuthor` is true, show a small camera/image icon button on the header that opens the `ImagePicker` component (reuse from legacy). The picker allows selecting from legacy media or uploading new.

Wire up `useSetTitleImage` and `useClearTitleImage` mutations.

**Step 3: Commit**

```bash
git add apps/web/src/features/story/components/StoryViewer.tsx
git commit -m "feat(web): add title image rendering to story header"
```

---

## Task 12: Frontend — Integrate Panel into Story Page

**Files:**
- Modify: `apps/web/src/features/story/components/StoryCreation.tsx`
- Modify: `apps/web/src/features/story/components/StoryToolbar.tsx`

**Step 1: Add metadata panel to StoryCreation layout**

In `StoryCreation.tsx`:
- Import `StoryMetadataPanel` and `useStoryMetadata`
- Fetch metadata: `const { data: metadata } = useStoryMetadata(storyId, !!storyId)`
- Change the main content area to a two-column grid layout when metadata exists or user is author:
  - Left column (wider): existing story content
  - Right column (320px): `StoryMetadataPanel`
- Pass `isAuthor` and `legacyId` (for the ImagePicker's legacy media selection)

**Step 2: Add metadata visibility toggle to StoryToolbar**

In `StoryToolbar.tsx`:
- Add a toggle/switch button for `metadata_visible` (only visible to author)
- Use the existing `useUpdateStory` mutation to toggle the field
- Show an eye/eye-off icon to indicate visibility state
- Tooltip: "Show metadata to members" / "Hide metadata from members"

**Step 3: Update story cards (optional enhancement)**

In `apps/web/src/features/legacy/components/StoryCard.tsx`:
- If `title_image_url` exists, render it as a card header image
- Use a small aspect ratio container at the top of the card

**Step 4: Run frontend lint**

Run: `cd apps/web && npm run lint`
Expected: No errors

**Step 5: Run frontend tests**

Run: `cd apps/web && npm run test`
Expected: No regressions

**Step 6: Commit**

```bash
git add apps/web/src/features/story/components/StoryCreation.tsx apps/web/src/features/story/components/StoryToolbar.tsx apps/web/src/features/legacy/components/StoryCard.tsx
git commit -m "feat(web): integrate metadata panel and title image into story pages"
```

---

## Task 13: Final Validation

**Step 1: Run backend validation**

Run: `just validate-backend`
Expected: All ruff + mypy checks pass

**Step 2: Run backend tests**

Run: `cd services/core-api && uv run pytest --tb=short -q`
Expected: All tests pass, no regressions

**Step 3: Run frontend lint and tests**

Run: `cd apps/web && npm run lint && npm run test`
Expected: All pass

**Step 4: Build frontend**

Run: `cd apps/web && npm run build`
Expected: Build succeeds without errors

**Step 5: Commit any remaining fixes**

If any validation steps required fixes, commit them.
