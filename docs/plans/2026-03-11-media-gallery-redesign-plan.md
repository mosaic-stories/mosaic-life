# Media Gallery Redesign — Implementation Plan

> **Status:** READY
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic photo grid + modal in the Media Gallery tab with a persistent side detail panel, rich metadata editing, people tagging, tags, and AI insight stubs. Full backend support for new fields, person tagging, and tag management.

**Architecture:** In-place refactor of `MediaSection`, `MediaGalleryInline`, and `MediaUploader`. New `Tag` and association models in the backend. `LegacyProfile` conditionally hides `LegacySidebar` when the media tab is active. The detail panel replaces the old modal dialog. Mobile uses shadcn `Sheet` for the panel.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, TanStack Query, FastAPI, SQLAlchemy, Alembic, Pydantic v2.

**Design doc:** `docs/plans/2026-03-11-media-gallery-redesign-design.md`
**Reference mockup:** `mosaic-media-gallery-redesign.jsx` (root directory)

---

## Task 1: Backend — Alembic Migration for New Columns and Tables

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_media_metadata_tags_and_people.py`

**Step 1: Generate migration**

Run:
```bash
cd services/core-api && uv run alembic revision --autogenerate -m "add media metadata tags and people"
```

The migration should detect changes from Tasks 1-3 models. But since we're creating the migration before the models, we'll write it manually.

**Step 2: Write the migration**

Create the migration file with this content (after generating the empty file to get the correct revision ID):

```python
"""Add media metadata, tags, and people tables.

Revision ID: <auto>
Revises: e04738d48e96
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers
revision: str = "<auto>"
down_revision: str | None = "e04738d48e96"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- New nullable columns on media table --
    op.add_column("media", sa.Column("caption", sa.Text(), nullable=True))
    op.add_column("media", sa.Column("date_taken", sa.String(100), nullable=True))
    op.add_column("media", sa.Column("location", sa.String(255), nullable=True))
    op.add_column("media", sa.Column("era", sa.String(50), nullable=True))
    op.add_column("media", sa.Column("ai_description", sa.Text(), nullable=True))
    op.add_column(
        "media",
        sa.Column("ai_insights", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )

    # -- Tags table --
    op.create_table(
        "tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("legacy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("name", "legacy_id", name="uq_tag_name_legacy"),
    )
    op.create_index("ix_tags_legacy_id", "tags", ["legacy_id"])

    # -- Media-Tags association --
    op.create_table(
        "media_tags",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("media_id", "tag_id"),
        sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("media_id", "tag_id", name="uq_media_tag"),
    )

    # -- Media-Persons association --
    op.create_table(
        "media_persons",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="subject"),
        sa.PrimaryKeyConstraint("media_id", "person_id"),
        sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("media_id", "person_id", name="uq_media_person"),
    )


def downgrade() -> None:
    op.drop_table("media_persons")
    op.drop_table("media_tags")
    op.drop_index("ix_tags_legacy_id", table_name="tags")
    op.drop_table("tags")
    op.drop_column("media", "ai_insights")
    op.drop_column("media", "ai_description")
    op.drop_column("media", "era")
    op.drop_column("media", "location")
    op.drop_column("media", "date_taken")
    op.drop_column("media", "caption")
```

**Step 3: Run the migration**

Run: `cd services/core-api && uv run alembic upgrade head`
Expected: Migration applies successfully.

**Step 4: Verify**

Run: `cd services/core-api && uv run alembic current`
Expected: Shows the new revision as head.

**Step 5: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(media): add migration for metadata columns, tags, and people tables"
```

---

## Task 2: Backend — Tag Model and Media Model Updates

**Files:**
- Create: `services/core-api/app/models/tag.py`
- Modify: `services/core-api/app/models/media.py`
- Modify: `services/core-api/app/models/associations.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Create Tag model**

Create `services/core-api/app/models/tag.py`:

```python
"""Tag model for categorizing media within a legacy."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .legacy import Legacy
    from .user import User


class Tag(Base):
    """Tag for categorizing media within a legacy."""

    __tablename__ = "tags"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    legacy: Mapped["Legacy"] = relationship("Legacy", foreign_keys=[legacy_id])
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint("name", "legacy_id", name="uq_tag_name_legacy"),
    )

    def __repr__(self) -> str:
        return f"<Tag(id={self.id}, name={self.name}, legacy_id={self.legacy_id})>"
```

**Step 2: Add MediaTag and MediaPerson to associations.py**

Append to `services/core-api/app/models/associations.py` after the `ConversationLegacy` class:

```python


class MediaTag(Base):
    """Association between media and tags."""

    __tablename__ = "media_tags"

    media_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    __table_args__ = (
        UniqueConstraint("media_id", "tag_id", name="uq_media_tag"),
    )

    def __repr__(self) -> str:
        return f"<MediaTag(media_id={self.media_id}, tag_id={self.tag_id})>"


class MediaPerson(Base):
    """Association between media and persons (people tagged in photos)."""

    __tablename__ = "media_persons"

    media_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        primary_key=True,
    )
    person_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="subject",
    )

    __table_args__ = (
        UniqueConstraint("media_id", "person_id", name="uq_media_person"),
    )

    def __repr__(self) -> str:
        return f"<MediaPerson(media_id={self.media_id}, person_id={self.person_id}, role={self.role})>"
```

**Step 3: Add new columns to Media model**

In `services/core-api/app/models/media.py`, add imports and columns. After `from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String` add `Text`. After `from sqlalchemy.dialects.postgresql import UUID as PG_UUID` add `from sqlalchemy.dialects.postgresql import JSON`.

Add these columns after `favorite_count` and before `created_at`:

```python
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_taken: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    era: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_insights: Mapped[list | None] = mapped_column(JSON, nullable=True)
```

Add to `TYPE_CHECKING` block:
```python
    from .associations import MediaLegacy, MediaPerson, MediaTag
    from .tag import Tag
```

Add new relationships after `legacy_associations`:

```python
    tag_associations: Mapped[list["MediaTag"]] = relationship(
        "MediaTag",
        cascade="all, delete-orphan",
    )
    person_associations: Mapped[list["MediaPerson"]] = relationship(
        "MediaPerson",
        cascade="all, delete-orphan",
    )
```

**Step 4: Update models/__init__.py**

Add imports for new models:

```python
from .tag import Tag
```

And in the imports from `.associations`, add `MediaPerson, MediaTag`.

Add to `__all__`:
```python
    "MediaPerson",
    "MediaTag",
    "Tag",
```

**Step 5: Verify**

Run: `cd services/core-api && uv run python -c "from app.models import Tag, MediaTag, MediaPerson; print('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add services/core-api/app/models/
git commit -m "feat(media): add Tag model, MediaTag, MediaPerson associations, metadata columns"
```

---

## Task 3: Backend — Media Schemas Update

**Files:**
- Modify: `services/core-api/app/schemas/media.py`
- Create: `services/core-api/app/schemas/tag.py`

**Step 1: Create tag schemas**

Create `services/core-api/app/schemas/tag.py`:

```python
"""Pydantic schemas for Tag API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TagResponse(BaseModel):
    """Tag in API responses."""

    id: UUID
    name: str

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    """Request to add a tag to media."""

    name: str = Field(..., min_length=1, max_length=100)


class TagListResponse(BaseModel):
    """List of tags for a legacy."""

    tags: list[TagResponse]
```

**Step 2: Update media schemas**

In `services/core-api/app/schemas/media.py`, add the update schema and response types for people/tags.

Add after existing imports:

```python
from typing import Literal
```

Add new schemas after `SetProfileImageRequest`:

```python


class MediaUpdate(BaseModel):
    """Schema for updating media metadata."""

    caption: str | None = Field(None, max_length=2000)
    date_taken: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=255)
    era: str | None = Field(None, max_length=50)


class MediaPersonResponse(BaseModel):
    """Person tagged in media."""

    person_id: UUID
    person_name: str
    role: str

    model_config = {"from_attributes": True}


class MediaPersonCreate(BaseModel):
    """Request to tag a person in media."""

    person_id: UUID | None = Field(None, description="Existing person ID")
    name: str | None = Field(None, min_length=1, max_length=200, description="Name for new person")
    role: Literal["subject", "family", "friend", "other"] = Field(default="subject")
```

Update `MediaSummary` to include the new fields. Add these fields after `favorite_count`:

```python
    caption: str | None = None
    date_taken: str | None = None
    location: str | None = None
    era: str | None = None
    tags: list["TagResponse"] = Field(default_factory=list)
    people: list[MediaPersonResponse] = Field(default_factory=list)
```

Add the `TagResponse` import at the top:

```python
from .tag import TagResponse
```

Do the same for `MediaDetail` — add the same fields after `favorite_count`.

**Step 3: Verify**

Run: `cd services/core-api && uv run python -c "from app.schemas.media import MediaUpdate, MediaPersonCreate, MediaPersonResponse; from app.schemas.tag import TagResponse, TagCreate; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add services/core-api/app/schemas/
git commit -m "feat(media): add schemas for media update, person tagging, and tags"
```

---

## Task 4: Backend — Media Service Layer Updates

**Files:**
- Modify: `services/core-api/app/services/media.py`

**Step 1: Add update_media service function**

Add imports at the top of `services/core-api/app/services/media.py`:

```python
from ..models.associations import MediaLegacy, MediaPerson, MediaTag
from ..models.person import Person
from ..models.tag import Tag
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaPersonCreate,
    MediaPersonResponse,
    MediaSummary,
    MediaUpdate,
    UploadUrlRequest,
    UploadUrlResponse,
)
from ..schemas.tag import TagResponse
```

(Replace the existing import block from `..schemas.media` and add the new ones.)

Add these service functions at the end of the file:

```python


async def update_media(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    data: MediaUpdate,
) -> MediaDetail:
    """Update media metadata.

    Only the owner or a member of an associated legacy can update.
    """
    result = await db.execute(
        select(Media)
        .options(
            selectinload(Media.owner),
            selectinload(Media.legacy_associations),
            selectinload(Media.tag_associations),
            selectinload(Media.person_associations),
        )
        .where(Media.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check access: owner or member of associated legacy
    has_access = media.owner_id == user_id
    if not has_access and media.legacy_associations:
        legacy_ids = [a.legacy_id for a in media.legacy_associations]
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        has_access = member_result.scalar_one_or_none() is not None

    if not has_access:
        raise HTTPException(status_code=403, detail="Not authorized to update this media")

    # Apply updates (only non-None fields)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(media, field, value)

    await db.commit()
    await db.refresh(media)

    return await _build_media_detail(db, media)


async def list_media_people(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> list[MediaPersonResponse]:
    """List people tagged in media."""
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(MediaPerson, Person.canonical_name)
        .join(Person, MediaPerson.person_id == Person.id)
        .where(MediaPerson.media_id == media_id)
    )
    rows = result.all()

    return [
        MediaPersonResponse(
            person_id=row[0].person_id,
            person_name=row[1],
            role=row[0].role,
        )
        for row in rows
    ]


async def tag_person(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    data: MediaPersonCreate,
) -> MediaPersonResponse:
    """Tag a person in media. Creates person if name is provided instead of person_id."""
    await _check_media_access(db, user_id, media_id)

    if data.person_id:
        person_id = data.person_id
        # Verify person exists
        person_result = await db.execute(select(Person).where(Person.id == person_id))
        person = person_result.scalar_one_or_none()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
    elif data.name:
        # Create new person
        person = Person(canonical_name=data.name)
        db.add(person)
        await db.flush()
        person_id = person.id
    else:
        raise HTTPException(
            status_code=400, detail="Either person_id or name must be provided"
        )

    # Check if already tagged
    existing = await db.execute(
        select(MediaPerson).where(
            MediaPerson.media_id == media_id,
            MediaPerson.person_id == person_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Person already tagged in this media")

    association = MediaPerson(
        media_id=media_id,
        person_id=person_id,
        role=data.role,
    )
    db.add(association)
    await db.commit()

    # Get person name for response
    person_result = await db.execute(select(Person).where(Person.id == person_id))
    person = person_result.scalar_one()

    logger.info(
        "media.person_tagged",
        extra={
            "media_id": str(media_id),
            "person_id": str(person_id),
            "user_id": str(user_id),
        },
    )

    return MediaPersonResponse(
        person_id=person_id,
        person_name=person.canonical_name,
        role=data.role,
    )


async def untag_person(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    person_id: UUID,
) -> None:
    """Remove a person tag from media."""
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(MediaPerson).where(
            MediaPerson.media_id == media_id,
            MediaPerson.person_id == person_id,
        )
    )
    association = result.scalar_one_or_none()
    if not association:
        raise HTTPException(status_code=404, detail="Person not tagged in this media")

    await db.delete(association)
    await db.commit()

    logger.info(
        "media.person_untagged",
        extra={
            "media_id": str(media_id),
            "person_id": str(person_id),
            "user_id": str(user_id),
        },
    )


async def list_media_tags(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> list[TagResponse]:
    """List tags on media."""
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(Tag)
        .join(MediaTag, Tag.id == MediaTag.tag_id)
        .where(MediaTag.media_id == media_id)
    )
    tags = result.scalars().all()

    return [TagResponse(id=t.id, name=t.name) for t in tags]


async def add_media_tag(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    legacy_id: UUID,
    tag_name: str,
) -> TagResponse:
    """Add a tag to media. Creates tag if it doesn't exist in this legacy."""
    await _check_media_access(db, user_id, media_id)

    # Find or create tag for this legacy
    result = await db.execute(
        select(Tag).where(Tag.name == tag_name, Tag.legacy_id == legacy_id)
    )
    tag = result.scalar_one_or_none()

    if not tag:
        tag = Tag(name=tag_name, legacy_id=legacy_id, created_by=user_id)
        db.add(tag)
        await db.flush()

    # Check if already associated
    existing = await db.execute(
        select(MediaTag).where(
            MediaTag.media_id == media_id,
            MediaTag.tag_id == tag.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tag already on this media")

    association = MediaTag(media_id=media_id, tag_id=tag.id)
    db.add(association)
    await db.commit()

    logger.info(
        "media.tag_added",
        extra={
            "media_id": str(media_id),
            "tag_id": str(tag.id),
            "tag_name": tag_name,
            "user_id": str(user_id),
        },
    )

    return TagResponse(id=tag.id, name=tag.name)


async def remove_media_tag(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    tag_id: UUID,
) -> None:
    """Remove a tag from media."""
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(MediaTag).where(
            MediaTag.media_id == media_id,
            MediaTag.tag_id == tag_id,
        )
    )
    association = result.scalar_one_or_none()
    if not association:
        raise HTTPException(status_code=404, detail="Tag not on this media")

    await db.delete(association)
    await db.commit()

    logger.info(
        "media.tag_removed",
        extra={
            "media_id": str(media_id),
            "tag_id": str(tag_id),
            "user_id": str(user_id),
        },
    )


async def list_legacy_tags(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> list[TagResponse]:
    """List all tags for a legacy (for autocomplete)."""
    # Verify membership
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Must be a member of the legacy")

    result = await db.execute(
        select(Tag)
        .where(Tag.legacy_id == legacy_id)
        .order_by(Tag.name)
    )
    tags = result.scalars().all()

    return [TagResponse(id=t.id, name=t.name) for t in tags]


async def _check_media_access(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> Media:
    """Check user has access to media. Returns the media object."""
    result = await db.execute(
        select(Media)
        .options(selectinload(Media.legacy_associations))
        .where(Media.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    has_access = media.owner_id == user_id
    if not has_access and media.legacy_associations:
        legacy_ids = [a.legacy_id for a in media.legacy_associations]
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        has_access = member_result.scalar_one_or_none() is not None

    if not has_access:
        raise HTTPException(status_code=403, detail="Not authorized")

    return media


async def _build_media_detail(
    db: AsyncSession,
    media: Media,
) -> MediaDetail:
    """Build MediaDetail response from a loaded Media object."""
    legacy_ids = [a.legacy_id for a in media.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)
    storage = get_storage_adapter()

    # Get tags
    tag_result = await db.execute(
        select(Tag)
        .join(MediaTag, Tag.id == MediaTag.tag_id)
        .where(MediaTag.media_id == media.id)
    )
    tags = tag_result.scalars().all()

    # Get people
    people_result = await db.execute(
        select(MediaPerson, Person.canonical_name)
        .join(Person, MediaPerson.person_id == Person.id)
        .where(MediaPerson.media_id == media.id)
    )
    people_rows = people_result.all()

    return MediaDetail(
        id=media.id,
        filename=media.filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        storage_path=media.storage_path,
        download_url=storage.generate_download_url(media.storage_path),
        uploaded_by=media.owner_id,
        uploader_name=media.owner.name,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=assoc.legacy_id,
                legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                role=assoc.role,
                position=assoc.position,
            )
            for assoc in sorted(media.legacy_associations, key=lambda a: a.position)
        ],
        created_at=media.created_at,
        favorite_count=media.favorite_count or 0,
        caption=media.caption,
        date_taken=media.date_taken,
        location=media.location,
        era=media.era,
        tags=[TagResponse(id=t.id, name=t.name) for t in tags],
        people=[
            MediaPersonResponse(
                person_id=row[0].person_id,
                person_name=row[1],
                role=row[0].role,
            )
            for row in people_rows
        ],
    )
```

**Step 2: Update list_legacy_media to include new fields**

In the `list_legacy_media` function, update the query to also load tag and person associations, and update the response construction to include the new fields. Add `selectinload(Media.tag_associations)` and `selectinload(Media.person_associations)` to the query options. Then for each media item in the response, fetch tags and people.

Replace the return block in `list_legacy_media` with a loop that builds `MediaSummary` objects including `caption`, `date_taken`, `location`, `era`, `tags`, and `people`. Use bulk queries for tags and people to avoid N+1:

```python
    # Bulk fetch tags and people for all media
    media_ids = [m.id for m in media_list]

    tag_result = await db.execute(
        select(MediaTag.media_id, Tag.id, Tag.name)
        .join(Tag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id.in_(media_ids))
    )
    tags_by_media: dict[UUID, list[TagResponse]] = {}
    for row in tag_result.all():
        tags_by_media.setdefault(row[0], []).append(
            TagResponse(id=row[1], name=row[2])
        )

    people_result = await db.execute(
        select(MediaPerson.media_id, MediaPerson.person_id, Person.canonical_name, MediaPerson.role)
        .join(Person, MediaPerson.person_id == Person.id)
        .where(MediaPerson.media_id.in_(media_ids))
    )
    people_by_media: dict[UUID, list[MediaPersonResponse]] = {}
    for row in people_result.all():
        people_by_media.setdefault(row[0], []).append(
            MediaPersonResponse(person_id=row[1], person_name=row[2], role=row[3])
        )

    return [
        MediaSummary(
            id=m.id,
            filename=m.filename,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            download_url=storage.generate_download_url(m.storage_path),
            uploaded_by=m.owner_id,
            uploader_name=m.owner.name,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(m.legacy_associations, key=lambda a: a.position)
            ],
            created_at=m.created_at,
            favorite_count=m.favorite_count or 0,
            caption=m.caption,
            date_taken=m.date_taken,
            location=m.location,
            era=m.era,
            tags=tags_by_media.get(m.id, []),
            people=people_by_media.get(m.id, []),
        )
        for m in media_list
    ]
```

**Step 3: Validate**

Run: `cd services/core-api && just validate-backend`
Expected: No ruff or mypy errors.

**Step 4: Commit**

```bash
git add services/core-api/app/services/media.py
git commit -m "feat(media): add service functions for metadata update, people tagging, and tags"
```

---

## Task 5: Backend — API Routes for Media Update, People, Tags

**Files:**
- Modify: `services/core-api/app/routes/media.py`
- Create: `services/core-api/app/routes/tag.py`
- Modify: `services/core-api/app/routes/person.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Add new endpoints to media routes**

In `services/core-api/app/routes/media.py`, add imports:

```python
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaPersonCreate,
    MediaPersonResponse,
    MediaSummary,
    MediaUpdate,
    UploadUrlRequest,
    UploadUrlResponse,
)
from ..schemas.tag import TagCreate, TagResponse
```

Add these route handlers after the `delete_media` endpoint (before the local_router section):

```python


@router.put(
    "/{media_id}",
    response_model=MediaDetail,
    summary="Update media metadata",
)
async def update_media(
    media_id: UUID,
    data: MediaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaDetail:
    """Update media metadata (caption, date_taken, location, era)."""
    session = require_auth(request)
    result = await media_service.update_media(
        db=db,
        user_id=session.user_id,
        media_id=media_id,
        data=data,
    )
    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="updated",
        entity_type="media",
        entity_id=media_id,
        metadata={"fields": list(data.model_dump(exclude_unset=True).keys())},
    )
    return result


@router.get(
    "/{media_id}/people",
    response_model=list[MediaPersonResponse],
    summary="List people tagged in media",
)
async def list_media_people(
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[MediaPersonResponse]:
    """List people tagged in a media item."""
    session = require_auth(request)
    return await media_service.list_media_people(
        db=db, user_id=session.user_id, media_id=media_id
    )


@router.post(
    "/{media_id}/people",
    response_model=MediaPersonResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tag a person in media",
)
async def tag_person(
    media_id: UUID,
    data: MediaPersonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaPersonResponse:
    """Tag a person in a media item. Provide person_id for existing, or name for new."""
    session = require_auth(request)
    return await media_service.tag_person(
        db=db, user_id=session.user_id, media_id=media_id, data=data
    )


@router.delete(
    "/{media_id}/people/{person_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove person tag from media",
)
async def untag_person(
    media_id: UUID,
    person_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a person tag from media."""
    session = require_auth(request)
    await media_service.untag_person(
        db=db, user_id=session.user_id, media_id=media_id, person_id=person_id
    )


@router.get(
    "/{media_id}/tags",
    response_model=list[TagResponse],
    summary="List tags on media",
)
async def list_media_tags(
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[TagResponse]:
    """List tags on a media item."""
    session = require_auth(request)
    return await media_service.list_media_tags(
        db=db, user_id=session.user_id, media_id=media_id
    )


@router.post(
    "/{media_id}/tags",
    response_model=TagResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add tag to media",
)
async def add_media_tag(
    media_id: UUID,
    data: TagCreate,
    request: Request,
    legacy_id: UUID = Query(..., description="Legacy ID for tag scope"),
    db: AsyncSession = Depends(get_db),
) -> TagResponse:
    """Add a tag to media. Creates the tag if new to this legacy."""
    session = require_auth(request)
    return await media_service.add_media_tag(
        db=db,
        user_id=session.user_id,
        media_id=media_id,
        legacy_id=legacy_id,
        tag_name=data.name,
    )


@router.delete(
    "/{media_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove tag from media",
)
async def remove_media_tag(
    media_id: UUID,
    tag_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a tag from media."""
    session = require_auth(request)
    await media_service.remove_media_tag(
        db=db, user_id=session.user_id, media_id=media_id, tag_id=tag_id
    )
```

**Step 2: Create tag routes file**

Create `services/core-api/app/routes/tag.py`:

```python
"""API routes for tags."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.tag import TagResponse
from ..services import media as media_service

router = APIRouter(prefix="/api/tags", tags=["tags"])
logger = logging.getLogger(__name__)


@router.get(
    "/",
    response_model=list[TagResponse],
    summary="List tags for a legacy",
)
async def list_legacy_tags(
    request: Request,
    legacy_id: UUID = Query(..., description="Legacy ID"),
    db: AsyncSession = Depends(get_db),
) -> list[TagResponse]:
    """List all tags for a legacy (for autocomplete)."""
    session = require_auth(request)
    return await media_service.list_legacy_tags(
        db=db, user_id=session.user_id, legacy_id=legacy_id
    )
```

**Step 3: Add person search endpoint**

In `services/core-api/app/routes/person.py`, add a search endpoint after the existing `get_match_candidates`:

```python


@router.get(
    "/search",
    response_model=list[PersonSearchResult],
    summary="Search persons by name",
)
async def search_persons(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    legacy_id: UUID | None = Query(None, description="Scope to persons linked to this legacy"),
    db: AsyncSession = Depends(get_db),
) -> list[PersonSearchResult]:
    """Search persons by name. Optionally scoped to a legacy's person pool."""
    session = require_auth(request)

    logger.info(
        "person.search",
        extra={"user_id": str(session.user_id), "query": q},
    )

    from ..services.person import search_persons as search_persons_svc

    return await search_persons_svc(db=db, query=q, legacy_id=legacy_id)
```

Add the `PersonSearchResult` schema to `services/core-api/app/schemas/person.py`:

```python


class PersonSearchResult(BaseModel):
    """Person search result for tagging."""

    id: UUID
    canonical_name: str

    model_config = {"from_attributes": True}
```

Add the `search_persons` function to `services/core-api/app/services/person.py`:

```python
from ..models.legacy import Legacy


async def search_persons(
    db: AsyncSession,
    query: str,
    legacy_id: UUID | None = None,
    limit: int = 10,
) -> list["PersonSearchResult"]:
    """Search persons by name, optionally scoped to a legacy."""
    from ..schemas.person import PersonSearchResult

    stmt = select(Person).where(
        Person.canonical_name.ilike(f"%{query}%")
    )

    if legacy_id:
        # Only persons linked to legacies that share the same person_id as this legacy
        # OR persons that are tagged in media of this legacy
        from ..models.associations import MediaPerson, MediaLegacy

        # Get persons directly linked via legacy.person_id
        legacy_persons = select(Legacy.person_id).where(
            Legacy.id == legacy_id, Legacy.person_id.is_not(None)
        ).scalar_subquery()

        # Get persons tagged in media of this legacy
        media_persons = (
            select(MediaPerson.person_id)
            .join(MediaLegacy, MediaPerson.media_id == MediaLegacy.media_id)
            .where(MediaLegacy.legacy_id == legacy_id)
        ).scalar_subquery()

        stmt = stmt.where(
            (Person.id == legacy_persons) | (Person.id.in_(media_persons))
        )

    stmt = stmt.order_by(Person.canonical_name).limit(limit)

    result = await db.execute(stmt)
    persons = result.scalars().all()

    return [
        PersonSearchResult(id=p.id, canonical_name=p.canonical_name)
        for p in persons
    ]
```

Add the UUID import to person.py if not already there.

**Step 4: Register tag router in main.py**

In `services/core-api/app/main.py`, add:

```python
from .routes.tag import router as tag_router
```

And register it:
```python
app.include_router(tag_router)
```

**Step 5: Validate**

Run: `cd services/core-api && just validate-backend`
Expected: No ruff or mypy errors.

**Step 6: Commit**

```bash
git add services/core-api/app/routes/ services/core-api/app/services/person.py services/core-api/app/schemas/person.py services/core-api/app/main.py
git commit -m "feat(media): add API routes for media update, people tagging, tags, and person search"
```

---

## Task 6: Frontend — API Client and Hooks

**Files:**
- Modify: `apps/web/src/features/media/api/media.ts`
- Modify: `apps/web/src/features/media/hooks/useMedia.ts`

**Step 1: Update MediaItem interface and add new API functions**

In `apps/web/src/features/media/api/media.ts`, update the `MediaItem` interface to add new fields after `favorite_count`:

```typescript
  caption?: string | null;
  date_taken?: string | null;
  location?: string | null;
  era?: string | null;
  tags: TagItem[];
  people: MediaPersonItem[];
```

Add new interfaces and API functions:

```typescript
export interface TagItem {
  id: string;
  name: string;
}

export interface MediaPersonItem {
  person_id: string;
  person_name: string;
  role: string;
}

export interface PersonSearchResult {
  id: string;
  canonical_name: string;
}

export interface MediaUpdateData {
  caption?: string | null;
  date_taken?: string | null;
  location?: string | null;
  era?: string | null;
}

export async function updateMedia(
  mediaId: string,
  data: MediaUpdateData
): Promise<MediaDetail> {
  return apiPut<MediaDetail>(`/api/media/${mediaId}`, data);
}

export async function listMediaPeople(
  mediaId: string
): Promise<MediaPersonItem[]> {
  return apiGet<MediaPersonItem[]>(`/api/media/${mediaId}/people`);
}

export async function tagPerson(
  mediaId: string,
  data: { person_id?: string; name?: string; role: string }
): Promise<MediaPersonItem> {
  return apiPost<MediaPersonItem>(`/api/media/${mediaId}/people`, data);
}

export async function untagPerson(
  mediaId: string,
  personId: string
): Promise<void> {
  return apiDelete(`/api/media/${mediaId}/people/${personId}`);
}

export async function listMediaTags(
  mediaId: string
): Promise<TagItem[]> {
  return apiGet<TagItem[]>(`/api/media/${mediaId}/tags`);
}

export async function addMediaTag(
  mediaId: string,
  name: string,
  legacyId: string
): Promise<TagItem> {
  return apiPost<TagItem>(
    `/api/media/${mediaId}/tags?legacy_id=${legacyId}`,
    { name }
  );
}

export async function removeMediaTag(
  mediaId: string,
  tagId: string
): Promise<void> {
  return apiDelete(`/api/media/${mediaId}/tags/${tagId}`);
}

export async function listLegacyTags(
  legacyId: string
): Promise<TagItem[]> {
  return apiGet<TagItem[]>(`/api/tags/?legacy_id=${legacyId}`);
}

export async function searchPersons(
  query: string,
  legacyId?: string
): Promise<PersonSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (legacyId) params.append('legacy_id', legacyId);
  return apiGet<PersonSearchResult[]>(`/api/persons/search?${params}`);
}
```

Add `apiPut` to the import from `@/lib/api/client` (check if it exists; if not, add it — it follows the same pattern as `apiPatch`).

**Step 2: Add new hooks**

In `apps/web/src/features/media/hooks/useMedia.ts`, add the new hooks after the existing exports:

```typescript
import {
  listMedia,
  requestUploadUrl,
  uploadFile,
  confirmUpload,
  deleteMedia,
  setProfileImage,
  validateFile,
  updateMedia,
  listMediaPeople,
  tagPerson,
  untagPerson,
  listMediaTags,
  addMediaTag,
  removeMediaTag,
  listLegacyTags,
  searchPersons,
  type MediaItem,
  type MediaDetail,
  type MediaUpdateData,
  type MediaPersonItem,
  type TagItem,
  type PersonSearchResult,
  type LegacyAssociationInput,
} from '@/features/media/api/media';


export function useUpdateMedia(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mediaId, data }: { mediaId: string; data: MediaUpdateData }) =>
      updateMedia(mediaId, data),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}

export function useTagPerson(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mediaId, data }: { mediaId: string; data: { person_id?: string; name?: string; role: string } }) =>
      tagPerson(mediaId, data),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useUntagPerson(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mediaId, personId }: { mediaId: string; personId: string }) =>
      untagPerson(mediaId, personId),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useAddTag(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mediaId, name, legacyId: lid }: { mediaId: string; name: string; legacyId: string }) =>
      addMediaTag(mediaId, name, lid),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useRemoveTag(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mediaId, tagId }: { mediaId: string; tagId: string }) =>
      removeMediaTag(mediaId, tagId),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useLegacyTags(legacyId?: string) {
  return useQuery({
    queryKey: [...mediaKeys.all, 'tags', legacyId] as const,
    queryFn: () => listLegacyTags(legacyId!),
    enabled: !!legacyId,
  });
}

export function useSearchPersons(query: string, legacyId?: string) {
  return useQuery({
    queryKey: [...mediaKeys.all, 'person-search', query, legacyId] as const,
    queryFn: () => searchPersons(query, legacyId),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}
```

**Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones).

**Step 4: Commit**

```bash
git add apps/web/src/features/media/
git commit -m "feat(media): add API client functions and hooks for metadata, people, and tags"
```

---

## Task 7: Frontend — Reusable Detail Panel Components

**Files:**
- Create: `apps/web/src/features/media/components/DetailSection.tsx`
- Create: `apps/web/src/features/media/components/MetadataRow.tsx`
- Create: `apps/web/src/features/media/components/TagPill.tsx`

**Step 1: Create DetailSection**

Create `apps/web/src/features/media/components/DetailSection.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface DetailSectionProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
}

export default function DetailSection({
  title,
  icon: Icon,
  children,
  action,
  defaultOpen = true,
}: DetailSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full pb-2 border-b border-stone-200 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Icon size={13} className="text-neutral-400" />
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {action && open && action}
          <ChevronRight
            size={13}
            className={`text-neutral-300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />
        </div>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
```

**Step 2: Create MetadataRow**

Create `apps/web/src/features/media/components/MetadataRow.tsx`:

```tsx
import { useState } from 'react';
import { PenLine, type LucideIcon } from 'lucide-react';

interface MetadataRowProps {
  label: string;
  value: string | null | undefined;
  icon?: LucideIcon;
  editable?: boolean;
  placeholder?: string;
  onSave?: (value: string) => void;
}

export default function MetadataRow({
  label,
  value,
  icon: Icon,
  editable = false,
  placeholder,
  onSave,
}: MetadataRowProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const isEmpty = !value;

  const handleBlur = () => {
    setEditing(false);
    if (localValue !== (value || '')) {
      onSave?.(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setLocalValue(value || '');
      setEditing(false);
    }
  };

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {Icon && <Icon size={14} className="text-neutral-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-neutral-400 mb-0.5">{label}</div>
        {editing ? (
          <input
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="text-sm text-neutral-900 border border-stone-300 rounded-md px-2 py-1 w-full outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50"
          />
        ) : (
          <div
            onClick={() => editable && setEditing(true)}
            className={`text-sm leading-relaxed ${
              isEmpty ? 'text-neutral-400 italic' : 'text-neutral-900'
            } ${editable ? 'cursor-pointer hover:text-neutral-700' : ''}`}
          >
            {value || placeholder || 'Add...'}
            {editable && !isEmpty && (
              <PenLine size={10} className="inline ml-1.5 text-neutral-300" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Create TagPill**

Create `apps/web/src/features/media/components/TagPill.tsx`:

```tsx
import { X } from 'lucide-react';

interface TagPillProps {
  label: string;
  onRemove?: () => void;
}

export default function TagPill({ label, onRemove }: TagPillProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full">
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
```

**Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add apps/web/src/features/media/components/DetailSection.tsx apps/web/src/features/media/components/MetadataRow.tsx apps/web/src/features/media/components/TagPill.tsx
git commit -m "feat(media): add DetailSection, MetadataRow, and TagPill reusable components"
```

---

## Task 8: Frontend — MediaDetailPanel Component

**Files:**
- Create: `apps/web/src/features/media/components/MediaDetailPanel.tsx`

This is the main detail panel that appears when a photo is selected. It contains the image preview and all collapsible sections.

**Step 1: Create the component**

Create `apps/web/src/features/media/components/MediaDetailPanel.tsx`. This is a large component — it renders the image preview with navigation/action bar and all six detail sections (Caption, AI Insights, Details, People, Tags, Linked Stories).

The component accepts:
```typescript
interface MediaDetailPanelProps {
  media: MediaItem;
  allMedia: MediaItem[];
  legacyId: string;
  profileImageId?: string | null;
  onClose: () => void;
  onNavigate: (mediaId: string) => void;
  isAuthenticated: boolean;
}
```

Key sections to implement:
- **Image preview** with `bg-neutral-900`, nav arrows, action bar (FavoriteButton, download, set as profile)
- **CaptionSection** — click-to-edit using local state + `useUpdateMedia`
- **AIInsightsSection** — stubbed "Coming soon" with gradient card
- **MediaDetailsSection** — MetadataRow for date_taken, location, era + file info
- **PeopleSection** — lists `media.people`, inline search/create with `useSearchPersons` + `useTagPerson`
- **TagsSection** — lists `media.tags` with TagPill, inline add with `useAddTag` + `useLegacyTags`
- **LinkedStoriesSection** — stubbed empty state

Use existing `FavoriteButton`, `useSetProfileImage`, `useDeleteMedia`, etc. from the current implementation.

The full component code should follow the patterns from the reference mockup (translated to Tailwind) and the design doc.

**Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/features/media/components/MediaDetailPanel.tsx
git commit -m "feat(media): add MediaDetailPanel with image preview, metadata editing, people, tags"
```

---

## Task 9: Frontend — MediaGrid and MediaThumbnail Components

**Files:**
- Create: `apps/web/src/features/media/components/MediaThumbnail.tsx`

**Step 1: Create MediaThumbnail**

Create `apps/web/src/features/media/components/MediaThumbnail.tsx`:

```tsx
import { Heart } from 'lucide-react';
import { getMediaContentUrl, type MediaItem } from '@/features/media/api/media';
import { rewriteBackendUrlForDev } from '@/lib/url';

interface MediaThumbnailProps {
  media: MediaItem;
  isSelected: boolean;
  isProfile: boolean;
  isFavorited: boolean;
  onClick: () => void;
}

export default function MediaThumbnail({
  media,
  isSelected,
  isProfile,
  isFavorited,
  onClick,
}: MediaThumbnailProps) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden cursor-pointer aspect-square transition-all duration-200 ${
        isSelected
          ? 'ring-[3px] ring-stone-700 shadow-lg shadow-stone-300/40'
          : 'ring-[3px] ring-transparent shadow-sm hover:shadow-md'
      }`}
    >
      <img
        src={rewriteBackendUrlForDev(getMediaContentUrl(media.id))}
        alt={media.caption || media.filename}
        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
      />

      {/* Caption overlay on selected */}
      {isSelected && media.caption && (
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 to-transparent flex flex-col justify-end p-3">
          <p className="text-white text-xs leading-relaxed line-clamp-2">
            {media.caption}
          </p>
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-2 right-2 flex gap-1.5">
        {isProfile && (
          <span className="bg-stone-700/85 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Profile
          </span>
        )}
        {isFavorited && (
          <div className="bg-white/90 backdrop-blur-sm rounded-full size-6 flex items-center justify-center">
            <Heart size={12} fill="#C85A5A" className="text-red-400" />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/features/media/components/MediaThumbnail.tsx
git commit -m "feat(media): add MediaThumbnail with selection state, badges, and hover overlay"
```

---

## Task 10: Frontend — MediaGalleryHeader Component

**Files:**
- Create: `apps/web/src/features/media/components/MediaGalleryHeader.tsx`

**Step 1: Create the header component**

Create `apps/web/src/features/media/components/MediaGalleryHeader.tsx`:

```tsx
import { Upload, Grid, Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MediaGalleryHeaderProps {
  photoCount: number;
  contributorCount: number;
  onUploadClick: () => void;
}

export default function MediaGalleryHeader({
  photoCount,
  contributorCount,
  onUploadClick,
}: MediaGalleryHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="font-serif text-xl sm:text-[22px] font-semibold text-neutral-900">
          Media Gallery
        </h2>
        <p className="text-[13px] text-neutral-400 mt-0.5">
          {photoCount} {photoCount === 1 ? 'photo' : 'photos'} · Uploaded by{' '}
          {contributorCount} {contributorCount === 1 ? 'contributor' : 'contributors'}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        {/* View toggle */}
        <div className="flex bg-white border border-stone-200 rounded-lg overflow-hidden">
          <button className="px-2.5 py-1.5 bg-stone-100">
            <Grid size={15} className="text-stone-700" />
          </button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="px-2.5 py-1.5" disabled>
                  <Clock size={15} className="text-neutral-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add dates to photos to unlock timeline view</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {/* Upload button */}
        <button
          onClick={onUploadClick}
          className="flex items-center gap-1.5 px-4 py-2 bg-stone-700 text-white rounded-lg text-[13px] font-semibold hover:bg-stone-800 transition-colors"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`

```bash
git add apps/web/src/features/media/components/MediaGalleryHeader.tsx
git commit -m "feat(media): add MediaGalleryHeader with view toggle and upload button"
```

---

## Task 11: Frontend — Rewrite MediaSection as Layout Owner

**Files:**
- Modify: `apps/web/src/features/legacy/components/MediaSection.tsx`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`

**Step 1: Update LegacyProfile to hide sidebar for media tab**

In `apps/web/src/features/legacy/components/LegacyProfile.tsx`, change the grid container (line 200) to be conditional on the active section:

Replace:
```tsx
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-9">
```

With:
```tsx
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 ${
        activeSection === 'media' ? '' : 'lg:grid-cols-[1fr_320px]'
      } gap-9`}>
```

And wrap the sidebar in a condition:

Replace:
```tsx
        {/* Sidebar */}
        <LegacySidebar
```

With:
```tsx
        {/* Sidebar — hidden on media tab */}
        {activeSection !== 'media' && <LegacySidebar
```

And close the condition after the sidebar closing tag.

**Step 2: Rewrite MediaSection**

Replace the entire content of `apps/web/src/features/legacy/components/MediaSection.tsx`:

```tsx
import { useState, useMemo, useRef } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { useMedia, useDeleteMedia, useSetProfileImage } from '@/features/media/hooks/useMedia';
import { type MediaItem } from '@/features/media/api/media';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import MediaUploader from '@/features/media/components/MediaUploader';
import MediaGalleryHeader from '@/features/media/components/MediaGalleryHeader';
import MediaThumbnail from '@/features/media/components/MediaThumbnail';
import MediaDetailPanel from '@/features/media/components/MediaDetailPanel';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface MediaSectionProps {
  legacyId: string;
  profileImageId: string | null | undefined;
  isAuthenticated: boolean;
}

export default function MediaSection({
  legacyId,
  profileImageId,
  isAuthenticated,
}: MediaSectionProps) {
  const { data: media, isLoading, error } = useMedia(legacyId, { enabled: isAuthenticated });
  const deleteMedia = useDeleteMedia(legacyId);

  const mediaIds = media?.map(m => m.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('media', isAuthenticated ? mediaIds : []);

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const uploaderRef = useRef<HTMLDivElement>(null);

  const selectedMedia = useMemo(
    () => media?.find(m => m.id === selectedMediaId) ?? null,
    [media, selectedMediaId]
  );

  // Count unique uploaders
  const contributorCount = useMemo(() => {
    if (!media) return 0;
    return new Set(media.map(m => m.uploaded_by)).size;
  }, [media]);

  const handlePhotoClick = (mediaId: string) => {
    setSelectedMediaId(mediaId === selectedMediaId ? null : mediaId);
  };

  const handleNavigate = (mediaId: string) => {
    setSelectedMediaId(mediaId);
  };

  const handleUploadClick = () => {
    setShowUploader(true);
    setTimeout(() => uploaderRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === selectedMediaId) setSelectedMediaId(null);
    await deleteMedia.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Auth gate
  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <ImageIcon className="size-12 mx-auto text-neutral-300 mb-4" />
        <p>Sign in to view photos</p>
        <p className="text-sm">Photos are only visible to authenticated users</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-stone-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        Failed to load media gallery
      </div>
    );
  }

  return (
    <>
      <MediaGalleryHeader
        photoCount={media?.length ?? 0}
        contributorCount={contributorCount}
        onUploadClick={handleUploadClick}
      />

      {/* Upload zone */}
      {showUploader && (
        <div ref={uploaderRef} className="mb-6">
          <MediaUploader legacyId={legacyId} />
        </div>
      )}

      {/* Main grid: gallery + optional detail panel */}
      <div
        className={`grid gap-7 transition-all duration-300 ${
          selectedMedia
            ? 'grid-cols-1 lg:grid-cols-[1fr_400px]'
            : 'grid-cols-1'
        }`}
      >
        {/* Photo grid */}
        <div
          className={`grid gap-3 ${
            selectedMedia
              ? 'grid-cols-2 md:grid-cols-3'
              : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          }`}
        >
          {media && media.length > 0 ? (
            media.map((item) => (
              <MediaThumbnail
                key={item.id}
                media={item}
                isSelected={item.id === selectedMediaId}
                isProfile={item.id === profileImageId}
                isFavorited={favoriteData?.favorites[item.id] ?? false}
                onClick={() => handlePhotoClick(item.id)}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-neutral-500">
              <ImageIcon className="size-12 mx-auto text-neutral-300 mb-4" />
              <p>No photos yet</p>
              <p className="text-sm">Upload photos to get started</p>
            </div>
          )}
        </div>

        {/* Desktop detail panel */}
        {selectedMedia && (
          <div className="hidden lg:block">
            <MediaDetailPanel
              media={selectedMedia}
              allMedia={media ?? []}
              legacyId={legacyId}
              profileImageId={profileImageId}
              onClose={() => setSelectedMediaId(null)}
              onNavigate={handleNavigate}
              isAuthenticated={isAuthenticated}
            />
          </div>
        )}
      </div>

      {/* Mobile detail panel (Sheet) */}
      <Sheet open={!!selectedMedia} onOpenChange={(open) => { if (!open) setSelectedMediaId(null); }}>
        <SheetContent side="bottom" className="lg:hidden h-[85vh] overflow-y-auto p-0">
          {selectedMedia && (
            <MediaDetailPanel
              media={selectedMedia}
              allMedia={media ?? []}
              legacyId={legacyId}
              profileImageId={profileImageId}
              onClose={() => setSelectedMediaId(null)}
              onNavigate={handleNavigate}
              isAuthenticated={isAuthenticated}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog (preserved from original) */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Photo</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.filename}&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMedia.isPending}
            >
              {deleteMedia.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/MediaSection.tsx apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "feat(media): rewrite MediaSection with grid+panel layout, hide sidebar on media tab"
```

---

## Task 12: Frontend — Restyle MediaUploader

**Files:**
- Modify: `apps/web/src/features/media/components/MediaUploader.tsx`

**Step 1: Update styling**

Update the uploader's styling to use the warm earth-tone palette:

- Change `border-blue-500 bg-blue-50` (drag active) to `border-stone-500 bg-stone-50`
- Change `border-neutral-300 hover:border-neutral-400` to `border-stone-300 hover:border-stone-400`
- Change spinner from `text-blue-500` to `text-stone-600`
- Change the upload icon and text styling to match

**Step 2: Verify and commit**

```bash
git add apps/web/src/features/media/components/MediaUploader.tsx
git commit -m "feat(media): restyle MediaUploader with warm earth-tone palette"
```

---

## Task 13: Backend Validation and Full Test

**Files:** None (verification only)

**Step 1: Validate backend**

Run: `cd services/core-api && just validate-backend`
Expected: No ruff or mypy errors.

**Step 2: Run backend tests**

Run: `cd services/core-api && uv run pytest`
Expected: All tests pass. Note any pre-existing failures.

**Step 3: Verify frontend build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Run frontend tests**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass. Note any pre-existing failures.

**Step 5: Production build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

**Step 6: Commit any fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "fix(media): address type/lint issues from media gallery redesign"
```
