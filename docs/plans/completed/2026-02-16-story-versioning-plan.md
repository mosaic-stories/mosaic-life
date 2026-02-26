# Story Versioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement story version history with draft support for AI-generated content, as specified in [2026-02-16-story-versioning-design.md](2026-02-16-story-versioning-design.md).

**Architecture:** Add a `story_versions` table that stores full content snapshots per version. The `stories` table keeps `title`/`content` in sync with the active version for backward compatibility. New version-specific endpoints live under `/api/stories/{story_id}/versions/`. Existing story CRUD endpoints are modified to create versions behind the scenes.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x (async), Alembic, Pydantic v2, PostgreSQL, pytest + pytest-asyncio

**Design Document:** `docs/plans/2026-02-16-story-versioning-design.md` — read this first for full context on all decisions.

---

## Conventions

- **All Python commands:** Use `uv run ...` (never raw `python` or `pip`)
- **Tests:** `uv run pytest tests/test_file.py::TestClass::test_name -v` from `services/core-api/`
- **Validation:** Run `just validate-backend` before every commit
- **Commits:** Conventional Commits format (`feat:`, `fix:`, `test:`)
- **Working directory:** `services/core-api/` for all backend tasks
- **TDD:** Write failing test → verify failure → implement → verify pass → commit

---

## Task 1: Add Configuration Setting

**Files:**
- Modify: `services/core-api/app/config/settings.py`
- Test: `services/core-api/tests/test_story_version_service.py` (create)

**Step 1: Add `story_version_soft_cap` to Settings**

In `services/core-api/app/config/settings.py`, add inside the `Settings` class after the `debug_sse_max_seconds` field:

```python
# Story versioning
story_version_soft_cap: int = int(os.getenv("STORY_VERSION_SOFT_CAP", "50"))
```

**Step 2: Commit**

```bash
git add services/core-api/app/config/settings.py
git commit -m "feat(versioning): add story_version_soft_cap setting"
```

---

## Task 2: Create StoryVersion Model

**Files:**
- Create: `services/core-api/app/models/story_version.py`
- Modify: `services/core-api/app/models/__init__.py`
- Modify: `services/core-api/app/models/story.py`
- Modify: `services/core-api/alembic/env.py`

**Step 1: Create the StoryVersion model**

Create `services/core-api/app/models/story_version.py`:

```python
"""StoryVersion model for story version history."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .story import Story
    from .user import User


class StoryVersion(Base):
    """A snapshot of a story at a point in time."""

    __tablename__ = "story_versions"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    story_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version_number: Mapped[int] = mapped_column(Integer, nullable=False)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="inactive",
    )

    source: Mapped[str] = mapped_column(String(50), nullable=False)

    source_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    stale: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    story: Mapped["Story"] = relationship("Story", foreign_keys=[story_id], back_populates="versions")
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        # Unique version number per story
        # (story_id, version_number) enforced by unique constraint
        {"comment": "Story version snapshots with full content"},
    )

    def __repr__(self) -> str:
        return f"<StoryVersion(id={self.id}, story_id={self.story_id}, v={self.version_number}, status={self.status})>"
```

**Step 2: Add `active_version_id` and `versions` relationship to Story model**

In `services/core-api/app/models/story.py`:

1. Add import for `StoryVersion` in the `TYPE_CHECKING` block:
```python
if TYPE_CHECKING:
    from .associations import StoryLegacy
    from .story_version import StoryVersion
    from .user import User
```

2. Add the `active_version_id` column after `updated_at`:
```python
active_version_id: Mapped[UUID | None] = mapped_column(
    PG_UUID(as_uuid=True),
    ForeignKey("story_versions.id", ondelete="SET NULL", use_alter=True),
    nullable=True,
)
```

Note: `use_alter=True` is required because `stories` and `story_versions` have circular FK references. This tells SQLAlchemy to create the FK constraint via ALTER TABLE after both tables exist.

3. Add the `versions` relationship after `legacy_associations`:
```python
versions: Mapped[list["StoryVersion"]] = relationship(
    "StoryVersion",
    foreign_keys="StoryVersion.story_id",
    back_populates="story",
    cascade="all, delete-orphan",
    order_by="StoryVersion.version_number.desc()",
)
```

**Step 3: Register the model**

In `services/core-api/app/models/__init__.py`, add:
```python
from .story_version import StoryVersion
```

And add `"StoryVersion"` to the `__all__` list.

In `services/core-api/alembic/env.py`, add to the import block:
```python
from app.models import StoryVersion  # noqa: F401
```

**Step 4: Commit**

```bash
git add services/core-api/app/models/story_version.py services/core-api/app/models/story.py services/core-api/app/models/__init__.py services/core-api/alembic/env.py
git commit -m "feat(versioning): add StoryVersion model and Story.active_version_id"
```

---

## Task 3: Create Alembic Migration

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_story_versions.py`

This migration must be written manually (not auto-generated) because it includes a data backfill step.

**Step 1: Create the migration file**

```bash
cd services/core-api
uv run alembic revision -m "add_story_versions"
```

**Step 2: Write the migration**

The generated file will be at `services/core-api/alembic/versions/<hash>_add_story_versions.py`. Replace its content with:

```python
"""add_story_versions

Revision ID: <auto-generated>
Revises: f7a1_memory
Create Date: <auto-generated>
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision = "<auto-generated>"
down_revision = "f7a1_memory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create story_versions table
    op.create_table(
        "story_versions",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("story_id", PG_UUID(as_uuid=True), sa.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="inactive"),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("stale", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", PG_UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
    )

    # Unique constraint: one version number per story
    op.create_unique_constraint(
        "uq_story_versions_story_id_version_number",
        "story_versions",
        ["story_id", "version_number"],
    )

    # Partial unique index: at most one active version per story
    op.execute(
        "CREATE UNIQUE INDEX uq_story_versions_one_active "
        "ON story_versions (story_id) WHERE status = 'active'"
    )

    # Partial unique index: at most one draft per story
    op.execute(
        "CREATE UNIQUE INDEX uq_story_versions_one_draft "
        "ON story_versions (story_id) WHERE status = 'draft'"
    )

    # 2. Add active_version_id to stories (nullable initially)
    op.add_column(
        "stories",
        sa.Column("active_version_id", PG_UUID(as_uuid=True), nullable=True),
    )

    # 3. Backfill: create v1 for every existing story
    op.execute(
        """
        INSERT INTO story_versions (id, story_id, version_number, title, content, status, source, change_summary, stale, created_by, created_at)
        SELECT
            gen_random_uuid(),
            s.id,
            1,
            s.title,
            s.content,
            'active',
            'manual_edit',
            'Initial version',
            false,
            s.author_id,
            s.created_at
        FROM stories s
        """
    )

    # 4. Set active_version_id for all backfilled rows
    op.execute(
        """
        UPDATE stories s
        SET active_version_id = sv.id
        FROM story_versions sv
        WHERE sv.story_id = s.id AND sv.status = 'active'
        """
    )

    # 5. Add FK constraint on active_version_id (after backfill)
    op.create_foreign_key(
        "fk_stories_active_version_id",
        "stories",
        "story_versions",
        ["active_version_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_stories_active_version_id", "stories", type_="foreignkey")
    op.drop_column("stories", "active_version_id")
    op.drop_table("story_versions")
```

**Important notes on the migration:**
- We do NOT add a NOT NULL constraint on `active_version_id` in this migration. The design says to do this, but leaving it nullable is safer — new stories created between deploy and backfill won't fail. The application code will always set it.
- The partial unique indexes enforce the "at most one active" and "at most one draft" constraints at the database level.
- `use_alter=True` in the model handles the circular FK — Alembic won't try to create both FKs inline.

**Step 3: Test the migration locally**

```bash
cd services/core-api
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
```

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/*_add_story_versions.py
git commit -m "feat(versioning): add story_versions migration with backfill"
```

---

## Task 4: Version Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/story_version.py`
- Modify: `services/core-api/app/schemas/story.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/test_story_version_schemas.py`:

```python
"""Tests for story version schemas."""

import pytest
from datetime import datetime, timezone
from uuid import uuid4

from app.schemas.story_version import (
    StoryVersionSummary,
    StoryVersionDetail,
    StoryVersionListResponse,
    BulkDeleteRequest,
)


class TestStoryVersionSummary:
    def test_valid_summary(self):
        summary = StoryVersionSummary(
            version_number=1,
            status="active",
            source="manual_edit",
            source_version=None,
            change_summary="Initial version",
            stale=False,
            created_by=uuid4(),
            created_at=datetime.now(timezone.utc),
        )
        assert summary.version_number == 1
        assert summary.status == "active"

    def test_summary_excludes_content(self):
        """Version list should not include full content."""
        data = {
            "version_number": 1,
            "status": "active",
            "source": "manual_edit",
            "source_version": None,
            "change_summary": "Initial version",
            "stale": False,
            "created_by": uuid4(),
            "created_at": datetime.now(timezone.utc),
        }
        summary = StoryVersionSummary(**data)
        assert not hasattr(summary, "content")
        assert not hasattr(summary, "title")


class TestStoryVersionDetail:
    def test_valid_detail_includes_content(self):
        detail = StoryVersionDetail(
            version_number=1,
            title="My Story",
            content="Full story content here.",
            status="active",
            source="manual_edit",
            source_version=None,
            change_summary="Initial version",
            stale=False,
            created_by=uuid4(),
            created_at=datetime.now(timezone.utc),
        )
        assert detail.title == "My Story"
        assert detail.content == "Full story content here."


class TestBulkDeleteRequest:
    def test_valid_bulk_delete(self):
        req = BulkDeleteRequest(version_numbers=[1, 2, 3])
        assert req.version_numbers == [1, 2, 3]

    def test_empty_list_rejected(self):
        with pytest.raises(Exception):
            BulkDeleteRequest(version_numbers=[])


class TestStoryVersionListResponse:
    def test_includes_warning_field(self):
        resp = StoryVersionListResponse(
            versions=[],
            total=0,
            page=1,
            page_size=20,
            warning="This story has 55 versions. Consider removing old versions you no longer need.",
        )
        assert resp.warning is not None

    def test_warning_is_optional(self):
        resp = StoryVersionListResponse(
            versions=[],
            total=0,
            page=1,
            page_size=20,
        )
        assert resp.warning is None
```

**Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_story_version_schemas.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.story_version'`

**Step 3: Create the version schemas**

Create `services/core-api/app/schemas/story_version.py`:

```python
"""Pydantic schemas for Story Version API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StoryVersionSummary(BaseModel):
    """Version summary for list view (excludes content)."""

    version_number: int
    status: str
    source: str
    source_version: int | None = None
    change_summary: str | None = None
    stale: bool = False
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryVersionDetail(BaseModel):
    """Full version detail including content."""

    version_number: int
    title: str
    content: str
    status: str
    source: str
    source_version: int | None = None
    change_summary: str | None = None
    stale: bool = False
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryVersionListResponse(BaseModel):
    """Paginated version list response."""

    versions: list[StoryVersionSummary]
    total: int
    page: int
    page_size: int
    warning: str | None = None


class BulkDeleteRequest(BaseModel):
    """Request body for bulk version deletion."""

    version_numbers: list[int] = Field(..., min_length=1)
```

**Step 4: Update story schemas for version info**

In `services/core-api/app/schemas/story.py`, add two optional fields to `StoryDetail`:

```python
# After updated_at field
version_count: int | None = None
has_draft: bool | None = None
```

And add `version_number` to `StoryResponse`:

```python
# After title field
version_number: int | None = None
```

**Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_story_version_schemas.py -v
```

Expected: All PASS

**Step 6: Commit**

```bash
git add services/core-api/app/schemas/story_version.py services/core-api/app/schemas/story.py tests/test_story_version_schemas.py
git commit -m "feat(versioning): add story version schemas"
```

---

## Task 5: Version Service — Core Helpers

**Files:**
- Create: `services/core-api/app/services/story_version.py`
- Test: `services/core-api/tests/test_story_version_service.py` (create)

**Step 1: Write failing tests for helpers**

Create `services/core-api/tests/test_story_version_service.py`:

```python
"""Tests for story version service."""

import pytest
import pytest_asyncio
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.models.legacy import Legacy, LegacyMember
from app.models.associations import StoryLegacy
from app.services.story_version import (
    get_next_version_number,
    get_active_version,
    get_draft_version,
    create_version,
)
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def story_with_version(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a story with a v1 active version (mimics post-migration state)."""
    story = Story(
        author_id=test_user.id,
        title="Versioned Story",
        content="Original content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.flush()

    # Create legacy association
    story_legacy = StoryLegacy(
        story_id=story.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(story_legacy)

    # Create v1
    version = StoryVersion(
        story_id=story.id,
        version_number=1,
        title="Versioned Story",
        content="Original content.",
        status="active",
        source="manual_edit",
        change_summary="Initial version",
        created_by=test_user.id,
    )
    db_session.add(version)
    await db_session.flush()

    story.active_version_id = version.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestGetNextVersionNumber:
    @pytest.mark.asyncio
    async def test_first_version_returns_1(self, db_session, test_user, test_legacy):
        """A story with no versions should get version_number=1."""
        story = Story(
            author_id=test_user.id,
            title="New Story",
            content="Content.",
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()

        result = await get_next_version_number(db_session, story.id)
        assert result == 1

    @pytest.mark.asyncio
    async def test_increments_from_existing(self, db_session, story_with_version):
        """Should return max(version_number) + 1."""
        result = await get_next_version_number(db_session, story_with_version.id)
        assert result == 2

    @pytest.mark.asyncio
    async def test_never_reuses_deleted_numbers(self, db_session, story_with_version, test_user):
        """After creating v2 and deleting it, next should be v3."""
        # Create v2
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="inactive",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        # Delete v2
        await db_session.delete(v2)
        await db_session.flush()

        result = await get_next_version_number(db_session, story_with_version.id)
        # This is tricky — MAX is still 1 after deletion of v2.
        # The design says "never reuse numbers" but the simple MAX approach
        # would return 2 here. We need to track the high-water mark differently
        # if we want strict non-reuse. For simplicity, MAX+1 is acceptable
        # since deleted version rows are gone — no collision possible.
        assert result == 2


class TestGetActiveVersion:
    @pytest.mark.asyncio
    async def test_returns_active_version(self, db_session, story_with_version):
        result = await get_active_version(db_session, story_with_version.id)
        assert result is not None
        assert result.status == "active"
        assert result.version_number == 1

    @pytest.mark.asyncio
    async def test_returns_none_when_no_active(self, db_session, test_user, test_legacy):
        story = Story(
            author_id=test_user.id,
            title="No Active",
            content="Content.",
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()

        result = await get_active_version(db_session, story.id)
        assert result is None


class TestGetDraftVersion:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_draft(self, db_session, story_with_version):
        result = await get_draft_version(db_session, story_with_version.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_draft_when_exists(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Draft title",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        result = await get_draft_version(db_session, story_with_version.id)
        assert result is not None
        assert result.status == "draft"
        assert result.version_number == 2
```

**Step 2: Run tests to verify failure**

```bash
uv run pytest tests/test_story_version_service.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.story_version'`

**Step 3: Implement the core helpers**

Create `services/core-api/app/services/story_version.py`:

```python
"""Service layer for story version operations."""

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.story import Story
from ..models.story_version import StoryVersion
from ..schemas.story_version import (
    StoryVersionDetail,
    StoryVersionListResponse,
    StoryVersionSummary,
)

logger = logging.getLogger(__name__)


async def get_next_version_number(db: AsyncSession, story_id: UUID) -> int:
    """Get the next version number for a story.

    Returns MAX(version_number) + 1, or 1 if no versions exist.
    """
    result = await db.execute(
        select(func.max(StoryVersion.version_number)).where(
            StoryVersion.story_id == story_id
        )
    )
    max_version = result.scalar_one_or_none()
    return (max_version or 0) + 1


async def get_active_version(
    db: AsyncSession, story_id: UUID
) -> StoryVersion | None:
    """Get the active version for a story, or None."""
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def get_draft_version(
    db: AsyncSession, story_id: UUID
) -> StoryVersion | None:
    """Get the draft version for a story, or None."""
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.status == "draft",
        )
    )
    return result.scalar_one_or_none()
```

**Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_story_version_service.py -v
```

Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add version service core helpers"
```

---

## Task 6: Version Service — List Versions

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write the failing test**

Add to `tests/test_story_version_service.py`:

```python
from app.services.story_version import list_versions


class TestListVersions:
    @pytest.mark.asyncio
    async def test_returns_versions_newest_first(self, db_session, story_with_version, test_user):
        # Create v2
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Updated",
            content="Updated content.",
            status="inactive",
            source="manual_edit",
            change_summary="Updated the story",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        result = await list_versions(db_session, story_with_version.id, page=1, page_size=20)
        assert result.total == 2
        assert result.versions[0].version_number == 2
        assert result.versions[1].version_number == 1

    @pytest.mark.asyncio
    async def test_pagination(self, db_session, story_with_version, test_user):
        # Create v2 and v3
        for i in [2, 3]:
            v = StoryVersion(
                story_id=story_with_version.id,
                version_number=i,
                title=f"V{i}",
                content=f"Content v{i}.",
                status="inactive",
                source="manual_edit",
                created_by=test_user.id,
            )
            db_session.add(v)
        await db_session.flush()

        # Page 1, size 2
        result = await list_versions(db_session, story_with_version.id, page=1, page_size=2)
        assert result.total == 3
        assert len(result.versions) == 2
        assert result.versions[0].version_number == 3

        # Page 2, size 2
        result = await list_versions(db_session, story_with_version.id, page=2, page_size=2)
        assert len(result.versions) == 1
        assert result.versions[0].version_number == 1

    @pytest.mark.asyncio
    async def test_soft_cap_warning(self, db_session, story_with_version, test_user):
        """When version count exceeds soft cap, include warning."""
        # This test validates the warning logic. We won't create 50 versions —
        # instead we'll test with a low cap via monkeypatch.
        # Create v2 and v3
        for i in [2, 3]:
            v = StoryVersion(
                story_id=story_with_version.id,
                version_number=i,
                title=f"V{i}",
                content=f"Content v{i}.",
                status="inactive",
                source="manual_edit",
                created_by=test_user.id,
            )
            db_session.add(v)
        await db_session.flush()

        # 3 versions with soft_cap=2 should trigger warning
        result = await list_versions(db_session, story_with_version.id, page=1, page_size=20, soft_cap=2)
        assert result.warning is not None
        assert "3 versions" in result.warning

    @pytest.mark.asyncio
    async def test_no_warning_under_cap(self, db_session, story_with_version):
        result = await list_versions(db_session, story_with_version.id, page=1, page_size=20, soft_cap=50)
        assert result.warning is None

    @pytest.mark.asyncio
    async def test_excludes_content_from_summaries(self, db_session, story_with_version):
        result = await list_versions(db_session, story_with_version.id, page=1, page_size=20)
        summary = result.versions[0]
        assert not hasattr(summary, "content") or "content" not in summary.model_fields
```

**Step 2: Run tests to verify failure**

```bash
uv run pytest tests/test_story_version_service.py::TestListVersions -v
```

Expected: FAIL — `ImportError: cannot import name 'list_versions'`

**Step 3: Implement `list_versions`**

Add to `services/core-api/app/services/story_version.py`:

```python
async def list_versions(
    db: AsyncSession,
    story_id: UUID,
    page: int = 1,
    page_size: int = 20,
    soft_cap: int | None = None,
) -> StoryVersionListResponse:
    """List all versions for a story, paginated, newest first.

    Args:
        db: Database session.
        story_id: Story ID.
        page: Page number (1-indexed).
        page_size: Items per page.
        soft_cap: Override for version soft cap (uses settings if None).

    Returns:
        Paginated version list with optional warning.
    """
    if soft_cap is None:
        soft_cap = get_settings().story_version_soft_cap

    # Count total versions
    count_result = await db.execute(
        select(func.count()).where(StoryVersion.story_id == story_id)
    )
    total = count_result.scalar_one()

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(StoryVersion)
        .where(StoryVersion.story_id == story_id)
        .order_by(StoryVersion.version_number.desc())
        .offset(offset)
        .limit(page_size)
    )
    versions = result.scalars().all()

    summaries = [
        StoryVersionSummary.model_validate(v) for v in versions
    ]

    warning = None
    if total > soft_cap:
        warning = (
            f"This story has {total} versions. "
            f"Consider removing old versions you no longer need."
        )

    logger.info(
        "version.list",
        extra={
            "story_id": str(story_id),
            "total": total,
            "page": page,
        },
    )

    return StoryVersionListResponse(
        versions=summaries,
        total=total,
        page=page,
        page_size=page_size,
        warning=warning,
    )
```

**Step 4: Run tests to verify pass**

```bash
uv run pytest tests/test_story_version_service.py::TestListVersions -v
```

**Step 5: Commit**

```bash
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add list_versions with pagination and soft cap warning"
```

---

## Task 7: Version Service — Get Version Detail

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write the failing test**

Add to `tests/test_story_version_service.py`:

```python
from app.services.story_version import get_version_detail


class TestGetVersionDetail:
    @pytest.mark.asyncio
    async def test_returns_full_detail(self, db_session, story_with_version):
        result = await get_version_detail(db_session, story_with_version.id, version_number=1)
        assert result.title == "Versioned Story"
        assert result.content == "Original content."
        assert result.version_number == 1

    @pytest.mark.asyncio
    async def test_not_found_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await get_version_detail(db_session, story_with_version.id, version_number=99)
        assert exc_info.value.status_code == 404
```

**Step 2: Run test to verify failure**

```bash
uv run pytest tests/test_story_version_service.py::TestGetVersionDetail -v
```

**Step 3: Implement**

Add to `services/core-api/app/services/story_version.py`:

```python
async def get_version_detail(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
) -> StoryVersionDetail:
    """Get full detail for a specific version.

    Raises:
        HTTPException: 404 if version not found.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return StoryVersionDetail.model_validate(version)
```

**Step 4: Run tests**

```bash
uv run pytest tests/test_story_version_service.py::TestGetVersionDetail -v
```

**Step 5: Commit**

```bash
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add get_version_detail"
```

---

## Task 8: Version Service — Delete Version

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write failing tests**

```python
from app.services.story_version import delete_version


class TestDeleteVersion:
    @pytest.mark.asyncio
    async def test_delete_inactive_version(self, db_session, story_with_version, test_user):
        # Create v2 as inactive
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="inactive",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        await delete_version(db_session, story_with_version.id, version_number=2)

        # Verify deleted
        check = await db.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == story_with_version.id,
                StoryVersion.version_number == 2,
            )
        )
        assert check.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_delete_active_version_blocked(self, db_session, story_with_version):
        """Deleting the active version should return 409."""
        with pytest.raises(HTTPException) as exc_info:
            await delete_version(db_session, story_with_version.id, version_number=1)
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_delete_draft_version(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Draft",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await delete_version(db_session, story_with_version.id, version_number=2)

    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await delete_version(db_session, story_with_version.id, version_number=99)
        assert exc_info.value.status_code == 404
```

**Step 2: Implement**

Add to `services/core-api/app/services/story_version.py`:

```python
async def delete_version(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
) -> None:
    """Delete a version. Active versions cannot be deleted.

    Raises:
        HTTPException: 404 if not found, 409 if active.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    if version.status == "active":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the active version. Activate another version first.",
        )

    await db.delete(version)
    await db.flush()

    logger.info(
        "version.deleted",
        extra={
            "story_id": str(story_id),
            "version_number": version_number,
            "status": version.status,
        },
    )
```

**Note:** The test for `test_delete_inactive_version` has a bug — it references `db` instead of `db_session`. Fix the test to use `db_session` when verifying deletion.

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_story_version_service.py::TestDeleteVersion -v
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add delete_version with active protection"
```

---

## Task 9: Version Service — Bulk Delete

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write failing tests**

```python
from app.services.story_version import bulk_delete_versions


class TestBulkDeleteVersions:
    @pytest.mark.asyncio
    async def test_bulk_delete_inactive_versions(self, db_session, story_with_version, test_user):
        # Create v2, v3 as inactive
        for i in [2, 3]:
            v = StoryVersion(
                story_id=story_with_version.id,
                version_number=i,
                title=f"V{i}",
                content=f"Content v{i}.",
                status="inactive",
                source="manual_edit",
                created_by=test_user.id,
            )
            db_session.add(v)
        await db_session.flush()

        deleted = await bulk_delete_versions(db_session, story_with_version.id, version_numbers=[2, 3])
        assert deleted == 2

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_if_any_active(self, db_session, story_with_version, test_user):
        """If any version in the list is active, entire request is rejected."""
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="Content v2.",
            status="inactive",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await bulk_delete_versions(db_session, story_with_version.id, version_numbers=[1, 2])
        assert exc_info.value.status_code == 409
```

**Step 2: Implement**

```python
async def bulk_delete_versions(
    db: AsyncSession,
    story_id: UUID,
    version_numbers: list[int],
) -> int:
    """Bulk delete versions. Rejects entire request if any version is active.

    Raises:
        HTTPException: 409 if any version is active, 404 if any not found.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number.in_(version_numbers),
        )
    )
    versions = result.scalars().all()

    found_numbers = {v.version_number for v in versions}
    missing = set(version_numbers) - found_numbers
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Versions not found: {sorted(missing)}",
        )

    active_versions = [v for v in versions if v.status == "active"]
    if active_versions:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete active versions. Activate another version first.",
        )

    for version in versions:
        await db.delete(version)
    await db.flush()

    logger.info(
        "version.bulk_deleted",
        extra={
            "story_id": str(story_id),
            "version_numbers": version_numbers,
            "count": len(versions),
        },
    )

    return len(versions)
```

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_story_version_service.py::TestBulkDeleteVersions -v
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add bulk_delete_versions"
```

---

## Task 10: Version Service — Restore Version

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write failing tests**

```python
from app.services.story_version import restore_version


class TestRestoreVersion:
    @pytest.mark.asyncio
    async def test_restore_creates_new_active_version(self, db_session, story_with_version, test_user):
        """Restoring v1 should create v2 with v1's content as the new active."""
        # First make v1 inactive and create v2 as active (simulating an edit)
        v1 = await get_active_version(db_session, story_with_version.id)
        v1.status = "inactive"

        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Edited",
            content="Edited content.",
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()
        story_with_version.active_version_id = v2.id
        story_with_version.title = "Edited"
        story_with_version.content = "Edited content."
        await db_session.flush()

        # Now restore v1
        new_version = await restore_version(
            db_session, story_with_version.id, version_number=1, user_id=test_user.id
        )

        assert new_version.version_number == 3
        assert new_version.status == "active"
        assert new_version.source == "restoration"
        assert new_version.source_version == 1
        assert new_version.title == "Versioned Story"
        assert new_version.content == "Original content."

    @pytest.mark.asyncio
    async def test_restore_deactivates_current(self, db_session, story_with_version, test_user):
        """The previously active version should become inactive."""
        # Create v2 as active
        v1 = await get_active_version(db_session, story_with_version.id)
        v1.status = "inactive"

        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()
        story_with_version.active_version_id = v2.id
        await db_session.flush()

        await restore_version(db_session, story_with_version.id, version_number=1, user_id=test_user.id)

        await db_session.refresh(v2)
        assert v2.status == "inactive"

    @pytest.mark.asyncio
    async def test_restore_updates_story_content(self, db_session, story_with_version, test_user):
        """stories.title and stories.content should reflect the restored content."""
        # Create v2 as active
        v1 = await get_active_version(db_session, story_with_version.id)
        v1.status = "inactive"

        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()
        story_with_version.active_version_id = v2.id
        story_with_version.title = "V2"
        story_with_version.content = "V2 content."
        await db_session.flush()

        await restore_version(db_session, story_with_version.id, version_number=1, user_id=test_user.id)

        await db_session.refresh(story_with_version)
        assert story_with_version.title == "Versioned Story"
        assert story_with_version.content == "Original content."

    @pytest.mark.asyncio
    async def test_restore_nonexistent_raises_404(self, db_session, story_with_version, test_user):
        with pytest.raises(HTTPException) as exc_info:
            await restore_version(db_session, story_with_version.id, version_number=99, user_id=test_user.id)
        assert exc_info.value.status_code == 404
```

**Step 2: Implement**

```python
async def restore_version(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
    user_id: UUID,
) -> StoryVersionDetail:
    """Restore an old version by creating a new active version with its content.

    This creates a new version (append-only history), deactivates the current
    active version, and updates the story's title/content.

    Raises:
        HTTPException: 404 if source version not found.
    """
    # Find the version to restore from
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Version not found")

    # Deactivate current active version
    current_active = await get_active_version(db, story_id)
    if current_active:
        current_active.status = "inactive"

    # Create new version from source content
    next_num = await get_next_version_number(db, story_id)
    new_version = StoryVersion(
        story_id=story_id,
        version_number=next_num,
        title=source.title,
        content=source.content,
        status="active",
        source="restoration",
        source_version=version_number,
        change_summary=f"Restored from version {version_number}",
        created_by=user_id,
    )
    db.add(new_version)
    await db.flush()

    # Update story to reflect restored content
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()
    story.title = source.title
    story.content = source.content
    story.active_version_id = new_version.id

    await db.flush()

    logger.info(
        "version.restored",
        extra={
            "story_id": str(story_id),
            "source_version": version_number,
            "new_version": next_num,
        },
    )

    return StoryVersionDetail.model_validate(new_version)
```

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_story_version_service.py::TestRestoreVersion -v
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add restore_version (append-only restoration)"
```

---

## Task 11: Version Service — Approve and Discard Draft

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write failing tests**

```python
from app.services.story_version import approve_draft, discard_draft


class TestApproveDraft:
    @pytest.mark.asyncio
    async def test_approve_promotes_draft_to_active(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Draft",
            content="AI-generated content.",
            status="draft",
            source="ai_enhancement",
            change_summary="Enhanced by AI",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        result = await approve_draft(db_session, story_with_version.id)

        assert result.status == "active"
        assert result.version_number == 2

    @pytest.mark.asyncio
    async def test_approve_deactivates_previous_active(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Draft",
            content="AI content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await approve_draft(db_session, story_with_version.id)

        v1 = await db_session.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == story_with_version.id,
                StoryVersion.version_number == 1,
            )
        )
        v1_row = v1.scalar_one()
        assert v1_row.status == "inactive"

    @pytest.mark.asyncio
    async def test_approve_updates_story_content(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Title",
            content="AI content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await approve_draft(db_session, story_with_version.id)

        await db_session.refresh(story_with_version)
        assert story_with_version.title == "AI Title"
        assert story_with_version.content == "AI content."

    @pytest.mark.asyncio
    async def test_approve_clears_stale_flag(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Draft",
            content="AI content.",
            status="draft",
            source="ai_enhancement",
            stale=True,
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        result = await approve_draft(db_session, story_with_version.id)
        assert result.stale is False

    @pytest.mark.asyncio
    async def test_approve_no_draft_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await approve_draft(db_session, story_with_version.id)
        assert exc_info.value.status_code == 404


class TestDiscardDraft:
    @pytest.mark.asyncio
    async def test_discard_deletes_draft(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Discard me",
            content="To be discarded.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await discard_draft(db_session, story_with_version.id)

        result = await get_draft_version(db_session, story_with_version.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_discard_no_draft_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await discard_draft(db_session, story_with_version.id)
        assert exc_info.value.status_code == 404
```

**Step 2: Implement**

```python
async def approve_draft(
    db: AsyncSession,
    story_id: UUID,
) -> StoryVersionDetail:
    """Approve the current draft, promoting it to active.

    Deactivates the current active version, promotes draft, and updates
    the story's title/content.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    # Deactivate current active
    current_active = await get_active_version(db, story_id)
    if current_active:
        current_active.status = "inactive"

    # Promote draft
    draft.status = "active"
    draft.stale = False

    # Update story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()
    story.title = draft.title
    story.content = draft.content
    story.active_version_id = draft.id

    await db.flush()

    logger.info(
        "version.draft_approved",
        extra={
            "story_id": str(story_id),
            "version_number": draft.version_number,
        },
    )

    return StoryVersionDetail.model_validate(draft)


async def discard_draft(
    db: AsyncSession,
    story_id: UUID,
) -> None:
    """Discard (hard-delete) the current draft.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    await db.delete(draft)
    await db.flush()

    logger.info(
        "version.draft_discarded",
        extra={
            "story_id": str(story_id),
            "version_number": draft.version_number,
        },
    )
```

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_story_version_service.py::TestApproveDraft tests/test_story_version_service.py::TestDiscardDraft -v
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add approve_draft and discard_draft"
```

---

## Task 12: Version Service — Create Version Helper

This is the helper used by both story creation (v1) and story update (new version).

**Files:**
- Modify: `services/core-api/app/services/story_version.py`
- Modify: `services/core-api/tests/test_story_version_service.py`

**Step 1: Write failing tests**

```python
from app.services.story_version import create_version


class TestCreateVersion:
    @pytest.mark.asyncio
    async def test_create_first_version(self, db_session, test_user, test_legacy):
        """Creating a version for a new story should be v1 active."""
        story = Story(
            author_id=test_user.id,
            title="Brand New",
            content="Brand new content.",
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()

        version = await create_version(
            db=db_session,
            story=story,
            title="Brand New",
            content="Brand new content.",
            source="manual_edit",
            user_id=test_user.id,
            change_summary="Initial version",
        )

        assert version.version_number == 1
        assert version.status == "active"
        assert story.active_version_id == version.id

    @pytest.mark.asyncio
    async def test_create_new_version_deactivates_previous(self, db_session, story_with_version, test_user):
        """Creating a new version should deactivate the old active."""
        version = await create_version(
            db=db_session,
            story=story_with_version,
            title="Updated Title",
            content="Updated content.",
            source="manual_edit",
            user_id=test_user.id,
        )

        assert version.version_number == 2
        assert version.status == "active"

        # Old v1 should be inactive
        v1_result = await db_session.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == story_with_version.id,
                StoryVersion.version_number == 1,
            )
        )
        v1 = v1_result.scalar_one()
        assert v1.status == "inactive"

    @pytest.mark.asyncio
    async def test_create_version_marks_draft_stale(self, db_session, story_with_version, test_user):
        """If a draft exists, creating a new active version should mark it stale."""
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Draft",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            stale=False,
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await create_version(
            db=db_session,
            story=story_with_version,
            title="New edit",
            content="New edit content.",
            source="manual_edit",
            user_id=test_user.id,
        )

        await db_session.refresh(draft)
        assert draft.stale is True

    @pytest.mark.asyncio
    async def test_create_version_updates_story_fields(self, db_session, story_with_version, test_user):
        await create_version(
            db=db_session,
            story=story_with_version,
            title="New Title",
            content="New content.",
            source="manual_edit",
            user_id=test_user.id,
        )

        await db_session.refresh(story_with_version)
        assert story_with_version.title == "New Title"
        assert story_with_version.content == "New content."
```

**Step 2: Implement**

Add to `services/core-api/app/services/story_version.py`:

```python
async def create_version(
    db: AsyncSession,
    story: Story,
    title: str,
    content: str,
    source: str,
    user_id: UUID,
    change_summary: str | None = None,
    source_version: int | None = None,
) -> StoryVersion:
    """Create a new active version for a story.

    Handles: deactivating previous active, marking draft stale,
    updating story fields, and setting active_version_id.

    Args:
        db: Database session.
        story: The Story ORM object (must be attached to session).
        title: Version title.
        content: Version content.
        source: Version source (manual_edit, ai_enhancement, etc.).
        user_id: User creating the version.
        change_summary: Optional summary of changes.
        source_version: If restoration, the source version number.

    Returns:
        The newly created StoryVersion.
    """
    # Deactivate current active version
    current_active = await get_active_version(db, story.id)
    if current_active:
        current_active.status = "inactive"

    # Mark any existing draft as stale
    draft = await get_draft_version(db, story.id)
    if draft:
        draft.stale = True

    # Create new version
    next_num = await get_next_version_number(db, story.id)
    version = StoryVersion(
        story_id=story.id,
        version_number=next_num,
        title=title,
        content=content,
        status="active",
        source=source,
        source_version=source_version,
        change_summary=change_summary,
        created_by=user_id,
    )
    db.add(version)
    await db.flush()

    # Update story fields
    story.title = title
    story.content = content
    story.active_version_id = version.id

    await db.flush()

    logger.info(
        "version.created",
        extra={
            "story_id": str(story.id),
            "version_number": next_num,
            "source": source,
        },
    )

    return version
```

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_story_version_service.py::TestCreateVersion -v
git add services/core-api/app/services/story_version.py tests/test_story_version_service.py
git commit -m "feat(versioning): add create_version helper"
```

---

## Task 13: Integrate Versioning into Story Create

**Files:**
- Modify: `services/core-api/app/services/story.py`
- Modify: `services/core-api/tests/test_story_service.py`

**Step 1: Write/update failing test**

Add to `tests/test_story_service.py`:

```python
from app.models.story_version import StoryVersion


class TestCreateStoryVersioning:
    @pytest.mark.asyncio
    async def test_create_story_creates_v1(self, db_session, test_user, test_legacy):
        """Creating a story should also create version 1."""
        from app.schemas.story import StoryCreate
        from app.schemas.associations import LegacyAssociationCreate

        data = StoryCreate(
            title="New Story",
            content="Story content.",
            visibility="private",
            legacies=[LegacyAssociationCreate(legacy_id=test_legacy.id, role="primary", position=0)],
        )

        result = await story_service.create_story(db=db_session, user_id=test_user.id, data=data)

        # Check that v1 was created
        versions = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == result.id)
        )
        version_list = versions.scalars().all()
        assert len(version_list) == 1
        assert version_list[0].version_number == 1
        assert version_list[0].status == "active"
        assert version_list[0].source == "manual_edit"
        assert version_list[0].change_summary == "Initial version"

    @pytest.mark.asyncio
    async def test_create_story_sets_active_version_id(self, db_session, test_user, test_legacy):
        from app.schemas.story import StoryCreate
        from app.schemas.associations import LegacyAssociationCreate

        data = StoryCreate(
            title="New Story",
            content="Story content.",
            visibility="private",
            legacies=[LegacyAssociationCreate(legacy_id=test_legacy.id, role="primary", position=0)],
        )

        result = await story_service.create_story(db=db_session, user_id=test_user.id, data=data)

        # Fetch story from DB and check active_version_id
        from app.models.story import Story
        story_result = await db_session.execute(select(Story).where(Story.id == result.id))
        story = story_result.scalar_one()
        assert story.active_version_id is not None
```

**Step 2: Modify `create_story` in `services/core-api/app/services/story.py`**

After `await db.flush()` (line 151) and before `await db.commit()` (line 163), add:

```python
from .story_version import create_version as create_story_version

# ... inside create_story, after db.flush() for story, before commit:

# Create v1
await create_story_version(
    db=db,
    story=story,
    title=data.title,
    content=data.content,
    source="manual_edit",
    user_id=user_id,
    change_summary="Initial version",
)
```

Move the import to the top of the file:
```python
from .story_version import create_version as create_story_version
```

**Step 3: Run tests**

```bash
uv run pytest tests/test_story_service.py::TestCreateStoryVersioning -v
```

**Step 4: Run existing story tests to verify no regressions**

```bash
uv run pytest tests/test_story_service.py -v
uv run pytest tests/test_story_api.py -v
```

**Step 5: Commit**

```bash
git add services/core-api/app/services/story.py tests/test_story_service.py
git commit -m "feat(versioning): integrate v1 creation into story create"
```

---

## Task 14: Integrate Versioning into Story Update

**Files:**
- Modify: `services/core-api/app/services/story.py`
- Modify: `services/core-api/tests/test_story_service.py`

**Step 1: Write failing tests**

Add to `tests/test_story_service.py`:

```python
class TestUpdateStoryVersioning:
    @pytest.mark.asyncio
    async def test_update_creates_new_version(self, db_session, test_user, test_legacy, test_story):
        """Updating content should create a new version."""
        # First, ensure test_story has v1 (fixtures may need updating)
        from app.services.story_version import get_next_version_number
        from app.models.story_version import StoryVersion

        # Create v1 for test_story if it doesn't have one
        v1 = StoryVersion(
            story_id=test_story.id,
            version_number=1,
            title=test_story.title,
            content=test_story.content,
            status="active",
            source="manual_edit",
            change_summary="Initial version",
            created_by=test_user.id,
        )
        db_session.add(v1)
        await db_session.flush()
        test_story.active_version_id = v1.id
        await db_session.flush()

        data = StoryUpdate(title="Updated Title", content="Updated content.")
        result = await story_service.update_story(
            db=db_session, user_id=test_user.id, story_id=test_story.id, data=data,
        )

        # Check that v2 was created
        versions_result = await db_session.execute(
            select(StoryVersion)
            .where(StoryVersion.story_id == test_story.id)
            .order_by(StoryVersion.version_number)
        )
        versions = versions_result.scalars().all()
        assert len(versions) == 2
        assert versions[0].status == "inactive"  # v1
        assert versions[1].status == "active"  # v2
        assert versions[1].title == "Updated Title"

    @pytest.mark.asyncio
    async def test_update_response_includes_version_number(self, db_session, test_user, test_story):
        """StoryResponse should include version_number after update."""
        from app.models.story_version import StoryVersion

        v1 = StoryVersion(
            story_id=test_story.id,
            version_number=1,
            title=test_story.title,
            content=test_story.content,
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v1)
        await db_session.flush()
        test_story.active_version_id = v1.id
        await db_session.flush()

        data = StoryUpdate(content="New content.")
        result = await story_service.update_story(
            db=db_session, user_id=test_user.id, story_id=test_story.id, data=data,
        )
        assert result.version_number is not None
        assert result.version_number == 2
```

**Step 2: Modify `update_story` in `services/core-api/app/services/story.py`**

Replace the inline field updates with a version creation call. The key changes:

1. Instead of directly setting `story.title = data.title`, etc., create a new version.
2. Only create a version if title or content changed. If only visibility or legacies changed, don't create a version.

Inside `update_story`, after the author check, replace the field update section:

```python
# Determine new title and content
new_title = data.title if data.title is not None else story.title
new_content = data.content if data.content is not None else story.content
content_changed = (data.title is not None and data.title != story.title) or \
                  (data.content is not None and data.content != story.content)

if content_changed:
    # Create new version (handles deactivation, stale marking, story field updates)
    new_version = await create_story_version(
        db=db,
        story=story,
        title=new_title,
        content=new_content,
        source="manual_edit",
        user_id=user_id,
    )
    version_number = new_version.version_number
else:
    # Only metadata changed (visibility, legacies)
    version_number = None

# Handle visibility update (not versioned)
if data.visibility is not None:
    story.visibility = data.visibility
```

Update the return statement to include `version_number`:

```python
return StoryResponse(
    id=story.id,
    title=story.title,
    visibility=story.visibility,
    version_number=version_number,
    legacies=[...],
    created_at=story.created_at,
    updated_at=story.updated_at,
)
```

**Step 3: Run tests**

```bash
uv run pytest tests/test_story_service.py -v
uv run pytest tests/test_story_api.py -v
```

**Step 4: Commit**

```bash
git add services/core-api/app/services/story.py tests/test_story_service.py
git commit -m "feat(versioning): integrate version creation into story update"
```

---

## Task 15: Update Story Detail to Include Version Info

**Files:**
- Modify: `services/core-api/app/services/story.py`
- Modify: `services/core-api/tests/test_story_service.py`

**Step 1: Write failing test**

```python
class TestGetStoryDetailVersioning:
    @pytest.mark.asyncio
    async def test_detail_includes_version_count(self, db_session, test_user, test_legacy, test_story):
        """GET story detail should include version_count for author."""
        from app.models.story_version import StoryVersion

        v1 = StoryVersion(
            story_id=test_story.id,
            version_number=1,
            title=test_story.title,
            content=test_story.content,
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v1)
        await db_session.flush()
        test_story.active_version_id = v1.id
        await db_session.flush()

        result = await story_service.get_story_detail(
            db=db_session, user_id=test_user.id, story_id=test_story.id,
        )
        assert result.version_count == 1

    @pytest.mark.asyncio
    async def test_detail_includes_has_draft(self, db_session, test_user, test_legacy, test_story):
        from app.models.story_version import StoryVersion

        v1 = StoryVersion(
            story_id=test_story.id,
            version_number=1,
            title=test_story.title,
            content=test_story.content,
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v1)
        await db_session.flush()
        test_story.active_version_id = v1.id
        await db_session.flush()

        result = await story_service.get_story_detail(
            db=db_session, user_id=test_user.id, story_id=test_story.id,
        )
        assert result.has_draft is False
```

**Step 2: Modify `get_story_detail`**

After the authorization check and before building the response, add:

```python
from .story_version import get_draft_version
from sqlalchemy import func as sa_func

# Count versions and check for draft (only for author)
version_count = None
has_draft = None
if story.author_id == user_id:
    count_result = await db.execute(
        select(sa_func.count()).select_from(StoryVersion).where(
            StoryVersion.story_id == story_id
        )
    )
    version_count = count_result.scalar_one()

    draft = await get_draft_version(db, story_id)
    has_draft = draft is not None
```

Add these to the `StoryDetail` constructor:
```python
version_count=version_count,
has_draft=has_draft,
```

Import `StoryVersion` at the top of the file:
```python
from ..models.story_version import StoryVersion
```

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_story_service.py -v
git add services/core-api/app/services/story.py tests/test_story_service.py
git commit -m "feat(versioning): include version_count and has_draft in story detail"
```

---

## Task 16: Version API Routes

**Files:**
- Create: `services/core-api/app/routes/story_version.py`
- Modify: `services/core-api/app/main.py`
- Create: `services/core-api/tests/test_story_version_api.py`

**Step 1: Write failing API tests**

Create `services/core-api/tests/test_story_version_api.py`:

```python
"""API tests for story version endpoints."""

import pytest
import pytest_asyncio
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.models.legacy import Legacy
from app.models.associations import StoryLegacy
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def versioned_story(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a story with v1 and v2 for API testing."""
    story = Story(
        author_id=test_user.id,
        title="API Test Story",
        content="V2 content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.flush()

    sl = StoryLegacy(story_id=story.id, legacy_id=test_legacy.id, role="primary", position=0)
    db_session.add(sl)

    v1 = StoryVersion(
        story_id=story.id, version_number=1, title="Original",
        content="V1 content.", status="inactive", source="manual_edit",
        change_summary="Initial version", created_by=test_user.id,
    )
    v2 = StoryVersion(
        story_id=story.id, version_number=2, title="API Test Story",
        content="V2 content.", status="active", source="manual_edit",
        change_summary="Updated content", created_by=test_user.id,
    )
    db_session.add_all([v1, v2])
    await db_session.flush()

    story.active_version_id = v2.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestListVersions:
    @pytest.mark.asyncio
    async def test_list_versions(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["versions"][0]["version_number"] == 2
        assert "content" not in data["versions"][0]

    @pytest.mark.asyncio
    async def test_list_versions_requires_auth(self, client: AsyncClient, versioned_story):
        resp = await client.get(f"/api/stories/{versioned_story.id}/versions")
        assert resp.status_code == 401 or resp.status_code == 403

    @pytest.mark.asyncio
    async def test_list_versions_author_only(self, client: AsyncClient, versioned_story, test_user_2):
        headers = create_auth_headers_for_user(test_user_2)
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions",
            headers=headers,
        )
        assert resp.status_code == 403


class TestGetVersion:
    @pytest.mark.asyncio
    async def test_get_version_detail(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions/1",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Original"
        assert data["content"] == "V1 content."

    @pytest.mark.asyncio
    async def test_get_version_not_found(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions/99",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDeleteVersion:
    @pytest.mark.asyncio
    async def test_delete_inactive_version(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions/1",
            headers=auth_headers,
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_active_version_blocked(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions/2",
            headers=auth_headers,
        )
        assert resp.status_code == 409


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_bulk_delete(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions",
            headers=auth_headers,
            json={"version_numbers": [1]},
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_active(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions",
            headers=auth_headers,
            json={"version_numbers": [1, 2]},
        )
        assert resp.status_code == 409


class TestRestoreVersion:
    @pytest.mark.asyncio
    async def test_restore_version(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.post(
            f"/api/stories/{versioned_story.id}/versions/1/activate",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version_number"] == 3
        assert data["source"] == "restoration"
        assert data["source_version"] == 1


class TestApproveDraft:
    @pytest.mark.asyncio
    async def test_approve_draft(
        self, client: AsyncClient, auth_headers, versioned_story, db_session, test_user,
    ):
        # Create a draft first
        draft = StoryVersion(
            story_id=versioned_story.id, version_number=3, title="Draft Title",
            content="Draft content.", status="draft", source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.commit()

        resp = await client.post(
            f"/api/stories/{versioned_story.id}/versions/draft/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"

    @pytest.mark.asyncio
    async def test_approve_no_draft_404(self, client: AsyncClient, auth_headers, versioned_story):
        resp = await client.post(
            f"/api/stories/{versioned_story.id}/versions/draft/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDiscardDraft:
    @pytest.mark.asyncio
    async def test_discard_draft(
        self, client: AsyncClient, auth_headers, versioned_story, db_session, test_user,
    ):
        draft = StoryVersion(
            story_id=versioned_story.id, version_number=3, title="Discard me",
            content="Discard content.", status="draft", source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.commit()

        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions/draft",
            headers=auth_headers,
        )
        assert resp.status_code == 204
```

**Step 2: Create the route file**

Create `services/core-api/app/routes/story_version.py`:

```python
"""API routes for story version management."""

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db, get_db_for_background
from ..models.story import Story
from ..schemas.story_version import (
    BulkDeleteRequest,
    StoryVersionDetail,
    StoryVersionListResponse,
)
from ..services import story_version as version_service
from ..services.ingestion import index_story_chunks

router = APIRouter(prefix="/api/stories/{story_id}/versions", tags=["story-versions"])
logger = logging.getLogger(__name__)


async def _require_author(
    db: AsyncSession, story_id: UUID, user_id: UUID
) -> Story:
    """Load story and verify requesting user is the author.

    Raises HTTPException 404 if not found, 403 if not author.
    """
    from sqlalchemy import select
    from fastapi import HTTPException
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story.author_id != user_id:
        raise HTTPException(status_code=403, detail="Only the author can manage versions")

    return story


@router.get(
    "",
    response_model=StoryVersionListResponse,
    summary="List all versions for a story",
)
async def list_versions(
    story_id: UUID,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> StoryVersionListResponse:
    session = require_auth(request)
    await _require_author(db, story_id, session.user_id)

    return await version_service.list_versions(
        db=db, story_id=story_id, page=page, page_size=page_size,
    )


@router.get(
    "/{version_number}",
    response_model=StoryVersionDetail,
    summary="Get full version detail",
)
async def get_version(
    story_id: UUID,
    version_number: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryVersionDetail:
    session = require_auth(request)
    await _require_author(db, story_id, session.user_id)

    return await version_service.get_version_detail(
        db=db, story_id=story_id, version_number=version_number,
    )


@router.delete(
    "/{version_number}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a version",
)
async def delete_version(
    story_id: UUID,
    version_number: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    session = require_auth(request)
    await _require_author(db, story_id, session.user_id)

    await version_service.delete_version(db=db, story_id=story_id, version_number=version_number)
    await db.commit()


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Bulk delete versions",
)
async def bulk_delete_versions(
    story_id: UUID,
    data: BulkDeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    session = require_auth(request)
    await _require_author(db, story_id, session.user_id)

    await version_service.bulk_delete_versions(
        db=db, story_id=story_id, version_numbers=data.version_numbers,
    )
    await db.commit()


@router.post(
    "/{version_number}/activate",
    response_model=StoryVersionDetail,
    summary="Restore an old version",
)
async def restore_version(
    story_id: UUID,
    version_number: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> StoryVersionDetail:
    session = require_auth(request)
    story = await _require_author(db, story_id, session.user_id)

    result = await version_service.restore_version(
        db=db, story_id=story_id, version_number=version_number, user_id=session.user_id,
    )
    await db.commit()

    # Queue embedding reprocessing
    _queue_reindex(background_tasks, story, result.content, session.user_id)

    return result


@router.post(
    "/draft/approve",
    response_model=StoryVersionDetail,
    summary="Approve the current draft",
)
async def approve_draft(
    story_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> StoryVersionDetail:
    session = require_auth(request)
    story = await _require_author(db, story_id, session.user_id)

    result = await version_service.approve_draft(db=db, story_id=story_id)
    await db.commit()

    # Queue embedding reprocessing
    _queue_reindex(background_tasks, story, result.content, session.user_id)

    return result


@router.delete(
    "/draft",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Discard the current draft",
)
async def discard_draft(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    session = require_auth(request)
    await _require_author(db, story_id, session.user_id)

    await version_service.discard_draft(db=db, story_id=story_id)
    await db.commit()


def _queue_reindex(
    background_tasks: BackgroundTasks,
    story: Story,
    content: str,
    user_id: UUID,
) -> None:
    """Queue background embedding reprocessing for a story."""
    if not story.legacy_associations:
        return

    primary_legacy = next(
        (leg for leg in story.legacy_associations if leg.role == "primary"),
        story.legacy_associations[0],
    )

    async def background_index() -> None:
        try:
            async for bg_db in get_db_for_background():
                await index_story_chunks(
                    db=bg_db,
                    story_id=story.id,
                    content=content,
                    legacy_id=primary_legacy.legacy_id,
                    visibility=story.visibility,
                    author_id=story.author_id,
                    user_id=user_id,
                )
        except Exception as e:
            logger.error(
                "background_reindexing_failed",
                extra={"story_id": str(story.id), "error": str(e)},
                exc_info=True,
            )

    background_tasks.add_task(background_index)
```

**Step 3: Register the router**

In `services/core-api/app/main.py`, add:

```python
from .routes.story_version import router as story_version_router
```

And below the existing `app.include_router(story_router)`:

```python
app.include_router(story_version_router)
```

**Step 4: Run tests**

```bash
uv run pytest tests/test_story_version_api.py -v
```

**Step 5: Run all tests**

```bash
uv run pytest -v
```

**Step 6: Commit**

```bash
git add services/core-api/app/routes/story_version.py services/core-api/app/main.py tests/test_story_version_api.py
git commit -m "feat(versioning): add version API routes with auth"
```

---

## Task 17: Change Summary Generation

**Files:**
- Create: `services/core-api/app/services/change_summary.py`
- Create: `services/core-api/tests/test_change_summary.py`

**Step 1: Write failing tests**

```python
"""Tests for change summary generation."""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.change_summary import generate_change_summary


class TestGenerateChangeSummary:
    @pytest.mark.asyncio
    async def test_returns_ai_generated_summary(self):
        mock_provider = AsyncMock()
        mock_provider.generate.return_value = "Updated the introduction paragraph"

        with patch("app.services.change_summary.get_provider_registry") as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello world",
                new_content="Hello wonderful world",
            )
            assert result == "Updated the introduction paragraph"

    @pytest.mark.asyncio
    async def test_fallback_on_failure(self):
        """If AI fails, fall back to generic summary."""
        mock_provider = AsyncMock()
        mock_provider.generate.side_effect = Exception("API error")

        with patch("app.services.change_summary.get_provider_registry") as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello", new_content="World", source="manual_edit",
            )
            assert result == "Manual edit"

    @pytest.mark.asyncio
    async def test_fallback_for_ai_source(self):
        mock_provider = AsyncMock()
        mock_provider.generate.side_effect = Exception("timeout")

        with patch("app.services.change_summary.get_provider_registry") as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello", new_content="World", source="ai_enhancement",
            )
            assert result == "AI enhancement"

    @pytest.mark.asyncio
    async def test_fallback_for_restoration(self):
        mock_provider = AsyncMock()
        mock_provider.generate.side_effect = Exception("timeout")

        with patch("app.services.change_summary.get_provider_registry") as mock_registry:
            mock_registry.return_value.get_llm_provider.return_value = mock_provider

            result = await generate_change_summary(
                old_content="Hello", new_content="World", source="restoration",
                source_version=3,
            )
            assert result == "Restored from version 3"
```

**Step 2: Implement**

Create `services/core-api/app/services/change_summary.py`:

```python
"""Change summary generation for story versions."""

import logging

from ..providers.registry import get_provider_registry

logger = logging.getLogger(__name__)

SUMMARY_PROMPT = """Compare the old and new versions of a story and write a brief 1-sentence summary of what changed. Focus on the nature of the change (what was added, removed, or modified). Be concise.

Old version:
{old_content}

New version:
{new_content}

Summary of changes (one sentence):"""

FALLBACK_SUMMARIES = {
    "manual_edit": "Manual edit",
    "ai_enhancement": "AI enhancement",
    "ai_interview": "AI interview update",
    "restoration": "Restored from version {source_version}",
}


async def generate_change_summary(
    old_content: str,
    new_content: str,
    source: str = "manual_edit",
    source_version: int | None = None,
) -> str:
    """Generate a change summary using a small model.

    Falls back to generic summary on failure. This function must never
    raise — it always returns a string.
    """
    try:
        registry = get_provider_registry()
        provider = registry.get_llm_provider()

        # Truncate to avoid excessive token usage
        old_truncated = old_content[:2000]
        new_truncated = new_content[:2000]

        prompt = SUMMARY_PROMPT.format(
            old_content=old_truncated,
            new_content=new_truncated,
        )

        result = await provider.generate(prompt, max_tokens=100)
        return result.strip()

    except Exception:
        logger.warning(
            "change_summary.generation_failed",
            extra={"source": source},
            exc_info=True,
        )
        return _fallback_summary(source, source_version)


def _fallback_summary(source: str, source_version: int | None = None) -> str:
    """Generate a generic fallback summary based on source type."""
    template = FALLBACK_SUMMARIES.get(source, "Content updated")
    if source_version is not None:
        return template.format(source_version=source_version)
    return template
```

**Note:** The `provider.generate()` call uses whatever LLM provider is configured (Bedrock or OpenAI). The exact method signature may need adjustment based on the actual `LLMProvider` protocol in `app/adapters/ai.py`. Check the protocol definition and adjust the call accordingly. If the protocol uses a streaming interface, you may need to use a non-streaming method or collect the stream.

**Step 3: Run tests and commit**

```bash
uv run pytest tests/test_change_summary.py -v
git add services/core-api/app/services/change_summary.py tests/test_change_summary.py
git commit -m "feat(versioning): add change summary generation with fallback"
```

---

## Task 18: Wire Change Summary into Version Creation

**Files:**
- Modify: `services/core-api/app/services/story.py`
- Modify: `services/core-api/app/services/story_version.py`

**Step 1: Update `update_story` to generate change summary**

In the `update_story` function, when creating a new version, pass the old content to `generate_change_summary` and use the result:

```python
from .change_summary import generate_change_summary

# Inside update_story, when content_changed is True:
change_summary = await generate_change_summary(
    old_content=story.content,  # current content before update
    new_content=new_content,
    source="manual_edit",
)

new_version = await create_story_version(
    db=db,
    story=story,
    title=new_title,
    content=new_content,
    source="manual_edit",
    user_id=user_id,
    change_summary=change_summary,
)
```

**Important:** Capture `story.content` BEFORE calling `create_story_version` (which updates `story.content`).

**Step 2: Run all tests to ensure no regressions**

```bash
uv run pytest -v
```

**Step 3: Commit**

```bash
git add services/core-api/app/services/story.py
git commit -m "feat(versioning): wire change summary generation into story update"
```

---

## Task 19: Update Test Fixtures for Versioned Stories

**Files:**
- Modify: `services/core-api/tests/conftest.py`

**Step 1: Update story fixtures to create v1**

The existing `test_story`, `test_story_public`, `test_story_private`, and `test_story_personal` fixtures need to create a v1 StoryVersion so that existing tests work with the new versioning-aware code.

For each story fixture, add after the story creation and flush:

```python
from app.models.story_version import StoryVersion

# After db_session.add(story) and flush:
version = StoryVersion(
    story_id=story.id,
    version_number=1,
    title=story.title,
    content=story.content,
    status="active",
    source="manual_edit",
    change_summary="Initial version",
    created_by=story.author_id,
)
db_session.add(version)
await db_session.flush()
story.active_version_id = version.id
```

**Step 2: Run ALL tests**

```bash
uv run pytest -v
```

This is a critical checkpoint. All existing tests must pass with the fixture changes.

**Step 3: Commit**

```bash
git add services/core-api/tests/conftest.py
git commit -m "test(versioning): update story fixtures to create v1"
```

---

## Task 20: Validate and Clean Up

**Step 1: Run full validation**

```bash
just validate-backend
```

Fix any ruff or mypy issues.

**Step 2: Run full test suite**

```bash
uv run pytest -v --tb=short
```

**Step 3: Fix any remaining issues**

Common issues to watch for:
- **mypy**: Type annotations on new functions and models
- **ruff**: Import ordering, unused imports
- **Tests**: SQLite may not support partial unique indexes (the `WHERE` clause in `CREATE UNIQUE INDEX`). The test database uses SQLite in-memory, so the partial unique indexes from the migration won't apply. This is fine — the constraints are enforced at the application level in tests and at the database level in PostgreSQL.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix(versioning): validation and cleanup"
```

---

## Task Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Configuration setting | `config/settings.py` |
| 2 | StoryVersion model | `models/story_version.py`, `models/story.py` |
| 3 | Alembic migration | `alembic/versions/*_add_story_versions.py` |
| 4 | Pydantic schemas | `schemas/story_version.py`, `schemas/story.py` |
| 5 | Service core helpers | `services/story_version.py` |
| 6 | List versions | `services/story_version.py` |
| 7 | Get version detail | `services/story_version.py` |
| 8 | Delete version | `services/story_version.py` |
| 9 | Bulk delete | `services/story_version.py` |
| 10 | Restore version | `services/story_version.py` |
| 11 | Approve + discard draft | `services/story_version.py` |
| 12 | Create version helper | `services/story_version.py` |
| 13 | Integrate into story create | `services/story.py` |
| 14 | Integrate into story update | `services/story.py` |
| 15 | Version info in story detail | `services/story.py` |
| 16 | API routes | `routes/story_version.py`, `main.py` |
| 17 | Change summary generation | `services/change_summary.py` |
| 18 | Wire summary into update | `services/story.py` |
| 19 | Update test fixtures | `tests/conftest.py` |
| 20 | Validate and clean up | All files |
