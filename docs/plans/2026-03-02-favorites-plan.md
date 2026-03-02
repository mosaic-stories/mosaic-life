# Favorites System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a full favorites system allowing users to favorite stories, legacies, and media, with public favorite counts and a homepage "My Favorites" section.

**Architecture:** Single polymorphic `user_favorites` table with `entity_type` discriminator. Denormalized `favorite_count` columns on `stories`, `legacies`, and `media` tables for fast reads. Toggle endpoint (add/remove in one call), batch-check endpoint (for list views), and list endpoint (for homepage section with entity metadata via JOIN).

**Tech Stack:** FastAPI + SQLAlchemy 2.x (backend), React + TanStack Query + Zustand (frontend), Alembic (migrations), Vitest + pytest (testing)

**Design Doc:** `docs/plans/2026-03-02-favorites-design.md`

---

## Task 1: Database Model — `UserFavorite`

**Files:**
- Create: `services/core-api/app/models/favorite.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Create the UserFavorite model**

Create `services/core-api/app/models/favorite.py`:

```python
"""UserFavorite model for tracking user favorites."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class UserFavorite(Base):
    """Polymorphic favorites table for stories, legacies, and media."""

    __tablename__ = "user_favorites"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    entity_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    entity_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_user_favorite"),
    )

    def __repr__(self) -> str:
        return f"<UserFavorite(user_id={self.user_id}, entity_type={self.entity_type}, entity_id={self.entity_id})>"
```

Note: Add `from typing import TYPE_CHECKING` and `if TYPE_CHECKING: from .user import User` at the top if mypy requires it. Check existing models for the exact pattern.

**Step 2: Register model in `__init__.py`**

In `services/core-api/app/models/__init__.py`, add the import and `__all__` entry:

```python
# Add import (alphabetical order, after .associations line):
from .favorite import UserFavorite

# Add to __all__ list (alphabetical order):
"UserFavorite",
```

**Step 3: Verify model loads**

Run from `services/core-api/`:
```bash
uv run python -c "from app.models import UserFavorite; print(UserFavorite.__tablename__)"
```
Expected: `user_favorites`

**Step 4: Commit**

```bash
git add services/core-api/app/models/favorite.py services/core-api/app/models/__init__.py
git commit -m "feat: add UserFavorite database model"
```

---

## Task 2: Database Migration — `user_favorites` table + `favorite_count` columns

**Files:**
- Modify: `services/core-api/app/models/story.py` (add `favorite_count` column)
- Modify: `services/core-api/app/models/legacy.py` (add `favorite_count` column)
- Modify: `services/core-api/app/models/media.py` (add `favorite_count` column)
- Create: Alembic migration (auto-generated)

**Step 1: Add `favorite_count` to Story model**

In `services/core-api/app/models/story.py`, add after the `status` field:

```python
from sqlalchemy import Integer  # add to imports

favorite_count: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    server_default="0",
    index=False,
)
```

**Step 2: Add `favorite_count` to Legacy model**

In `services/core-api/app/models/legacy.py`, add after the `updated_at` field:

```python
from sqlalchemy import Integer  # add to imports

favorite_count: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    server_default="0",
    index=False,
)
```

**Step 3: Add `favorite_count` to Media model**

In `services/core-api/app/models/media.py`, add after the `storage_path` field:

```python
from sqlalchemy import Integer  # add to imports

favorite_count: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    server_default="0",
    index=False,
)
```

**Step 4: Generate Alembic migration**

Run from `services/core-api/`:
```bash
uv run alembic revision --autogenerate -m "add_user_favorites_table_and_favorite_counts"
```

**Step 5: Review the generated migration**

Open the generated file in `services/core-api/alembic/versions/`. Verify it contains:
- `op.create_table("user_favorites", ...)` with all columns
- `op.create_index` for composite index on `(entity_type, entity_id)`
- Unique constraint `uq_user_favorite` on `(user_id, entity_type, entity_id)`
- `op.add_column("stories", ...)` for `favorite_count`
- `op.add_column("legacies", ...)` for `favorite_count`
- `op.add_column("media", ...)` for `favorite_count`
- Proper `downgrade()` that drops everything in reverse

**Step 6: Run the migration locally**

```bash
uv run alembic upgrade head
```
Expected: Migration applies without errors.

**Step 7: Verify tables exist**

```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\d user_favorites"
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "SELECT column_name FROM information_schema.columns WHERE table_name='stories' AND column_name='favorite_count'"
```

**Step 8: Commit**

```bash
git add services/core-api/app/models/story.py services/core-api/app/models/legacy.py services/core-api/app/models/media.py services/core-api/alembic/versions/
git commit -m "feat: add user_favorites table and favorite_count columns"
```

---

## Task 3: Backend Schemas — Pydantic models for favorites

**Files:**
- Create: `services/core-api/app/schemas/favorite.py`
- Modify: `services/core-api/app/schemas/story.py` (add `favorite_count` to responses)
- Modify: `services/core-api/app/schemas/legacy.py` (add `favorite_count` to responses)
- Modify: `services/core-api/app/schemas/media.py` (add `favorite_count` to responses)

**Step 1: Create favorite schemas**

Create `services/core-api/app/schemas/favorite.py`:

```python
"""Pydantic schemas for Favorites API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FavoriteToggleRequest(BaseModel):
    """Request to toggle a favorite."""

    entity_type: Literal["story", "legacy", "media"] = Field(
        ..., description="Type of entity to favorite"
    )
    entity_id: UUID = Field(..., description="ID of the entity to favorite")


class FavoriteToggleResponse(BaseModel):
    """Response from toggling a favorite."""

    favorited: bool = Field(description="Whether the entity is now favorited")
    favorite_count: int = Field(description="Updated favorite count for the entity")


class FavoriteCheckResponse(BaseModel):
    """Response from batch-checking favorites."""

    favorites: dict[str, bool] = Field(
        description="Map of entity_id to favorited status"
    )


class FavoriteItem(BaseModel):
    """A single favorite with entity metadata."""

    id: UUID
    entity_type: str
    entity_id: UUID
    created_at: datetime
    entity: dict[str, Any] | None = Field(
        default=None,
        description="Entity summary data (shape varies by entity_type)",
    )

    model_config = {"from_attributes": True}


class FavoriteListResponse(BaseModel):
    """Response from listing favorites."""

    items: list[FavoriteItem]
    total: int
```

**Step 2: Add `favorite_count` to story schemas**

In `services/core-api/app/schemas/story.py`, add to `StorySummary`:

```python
favorite_count: int = Field(default=0, description="Number of times this story has been favorited")
```

Add the same field to `StoryDetail`.

**Step 3: Add `favorite_count` to legacy schemas**

In `services/core-api/app/schemas/legacy.py`, add to `LegacyResponse`:

```python
favorite_count: int = Field(default=0, description="Number of times this legacy has been favorited")
```

**Step 4: Add `favorite_count` to media schemas**

In `services/core-api/app/schemas/media.py`, add to `MediaSummary` and `MediaDetail`:

```python
favorite_count: int = Field(default=0, description="Number of times this media has been favorited")
```

**Step 5: Run validation**

```bash
cd services/core-api && just validate-backend
```
Expected: All checks pass (ruff + mypy).

**Step 6: Commit**

```bash
git add services/core-api/app/schemas/favorite.py services/core-api/app/schemas/story.py services/core-api/app/schemas/legacy.py services/core-api/app/schemas/media.py
git commit -m "feat: add favorite schemas and favorite_count to response models"
```

---

## Task 4: Backend Service — Favorite business logic

**Files:**
- Create: `services/core-api/app/services/favorite.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/test_favorite_service.py`:

```python
"""Tests for favorite service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import UserFavorite
from app.models.legacy import Legacy
from app.models.media import Media
from app.models.story import Story
from app.models.user import User
from app.services import favorite as favorite_service


class TestToggleFavorite:
    """Tests for toggle_favorite."""

    @pytest.mark.asyncio
    async def test_favorite_story(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        """Favoriting a story creates a record and increments count."""
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )

        assert result["favorited"] is True
        assert result["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_unfavorite_story(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        """Toggling again removes the favorite and decrements count."""
        # First toggle: favorite
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )
        # Second toggle: unfavorite
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )

        assert result["favorited"] is False
        assert result["favorite_count"] == 0

    @pytest.mark.asyncio
    async def test_favorite_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Favoriting a legacy works."""
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="legacy",
            entity_id=test_legacy.id,
        )

        assert result["favorited"] is True
        assert result["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_favorite_media(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_media: Media,
    ):
        """Favoriting a media item works."""
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="media",
            entity_id=test_media.id,
        )

        assert result["favorited"] is True
        assert result["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_favorite_nonexistent_entity(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Favoriting a nonexistent entity raises 404."""
        from uuid import uuid4

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await favorite_service.toggle_favorite(
                db=db_session,
                user_id=test_user.id,
                entity_type="story",
                entity_id=uuid4(),
            )
        assert exc_info.value.status_code == 404


class TestBatchCheckFavorites:
    """Tests for batch_check_favorites."""

    @pytest.mark.asyncio
    async def test_batch_check(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_story_public: Story,
    ):
        """Batch check returns correct favorited status."""
        # Favorite one story
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )

        result = await favorite_service.batch_check_favorites(
            db=db_session,
            user_id=test_user.id,
            entity_ids=[test_story.id, test_story_public.id],
        )

        assert result[str(test_story.id)] is True
        assert result[str(test_story_public.id)] is False

    @pytest.mark.asyncio
    async def test_batch_check_empty(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Batch check with empty list returns empty dict."""
        result = await favorite_service.batch_check_favorites(
            db=db_session,
            user_id=test_user.id,
            entity_ids=[],
        )

        assert result == {}


class TestListFavorites:
    """Tests for list_favorites."""

    @pytest.mark.asyncio
    async def test_list_all_favorites(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ):
        """List returns all user favorites with entity metadata."""
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="legacy",
            entity_id=test_legacy.id,
        )

        result = await favorite_service.list_favorites(
            db=db_session,
            user_id=test_user.id,
        )

        assert result["total"] == 2
        assert len(result["items"]) == 2

    @pytest.mark.asyncio
    async def test_list_favorites_filtered_by_type(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ):
        """List filtered by entity_type returns only matching favorites."""
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="legacy",
            entity_id=test_legacy.id,
        )

        result = await favorite_service.list_favorites(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
        )

        assert result["total"] == 1
        assert result["items"][0]["entity_type"] == "story"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_favorite_service.py -v --no-header
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.favorite'`

**Step 3: Implement favorite service**

Create `services/core-api/app/services/favorite.py`:

```python
"""Favorite service — toggle, batch check, and list favorites."""

import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.favorite import UserFavorite
from ..models.legacy import Legacy
from ..models.media import Media
from ..models.story import Story

logger = logging.getLogger(__name__)

# Map entity_type to SQLAlchemy model
ENTITY_MODEL_MAP: dict[str, type] = {
    "story": Story,
    "legacy": Legacy,
    "media": Media,
}


async def _get_entity(
    db: AsyncSession,
    entity_type: str,
    entity_id: UUID,
) -> Any:
    """Load entity by type and id, or raise 404."""
    model = ENTITY_MODEL_MAP.get(entity_type)
    if not model:
        raise HTTPException(status_code=400, detail=f"Invalid entity_type: {entity_type}")

    result = await db.execute(select(model).where(model.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type} not found")
    return entity


async def toggle_favorite(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str,
    entity_id: UUID,
) -> dict[str, Any]:
    """Toggle a favorite on/off. Returns {favorited: bool, favorite_count: int}."""
    entity = await _get_entity(db, entity_type, entity_id)

    # Check if already favorited
    result = await db.execute(
        select(UserFavorite).where(
            UserFavorite.user_id == user_id,
            UserFavorite.entity_type == entity_type,
            UserFavorite.entity_id == entity_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Remove favorite
        await db.delete(existing)
        entity.favorite_count = max(0, entity.favorite_count - 1)
        favorited = False
    else:
        # Add favorite
        favorite = UserFavorite(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        db.add(favorite)
        entity.favorite_count = (entity.favorite_count or 0) + 1
        favorited = True

    await db.commit()
    await db.refresh(entity)

    logger.info(
        "favorite.toggled",
        extra={
            "user_id": str(user_id),
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "favorited": favorited,
            "favorite_count": entity.favorite_count,
        },
    )

    return {"favorited": favorited, "favorite_count": entity.favorite_count}


async def batch_check_favorites(
    db: AsyncSession,
    user_id: UUID,
    entity_ids: list[UUID],
) -> dict[str, bool]:
    """Check which entities the user has favorited. Returns {entity_id: bool}."""
    if not entity_ids:
        return {}

    result = await db.execute(
        select(UserFavorite.entity_id).where(
            UserFavorite.user_id == user_id,
            UserFavorite.entity_id.in_(entity_ids),
        )
    )
    favorited_ids = {str(row[0]) for row in result.all()}

    return {str(eid): str(eid) in favorited_ids for eid in entity_ids}


async def list_favorites(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List user's favorites with entity metadata."""
    query = select(UserFavorite).where(UserFavorite.user_id == user_id)

    if entity_type:
        query = query.where(UserFavorite.entity_type == entity_type)

    query = query.order_by(UserFavorite.created_at.desc()).limit(limit)

    result = await db.execute(query)
    favorites = result.scalars().all()

    # Load entity metadata for each favorite
    items: list[dict[str, Any]] = []
    for fav in favorites:
        entity_data = await _get_entity_summary(db, fav.entity_type, fav.entity_id)
        if entity_data is not None:
            items.append(
                {
                    "id": fav.id,
                    "entity_type": fav.entity_type,
                    "entity_id": fav.entity_id,
                    "created_at": fav.created_at,
                    "entity": entity_data,
                }
            )
        else:
            # Orphaned favorite — entity was deleted. Clean up lazily.
            await db.delete(fav)

    if any(fav.entity_type for fav in favorites):
        # Commit any orphan cleanup
        await db.commit()

    return {"items": items, "total": len(items)}


async def _get_entity_summary(
    db: AsyncSession,
    entity_type: str,
    entity_id: UUID,
) -> dict[str, Any] | None:
    """Load a minimal summary of an entity for the favorites list."""
    model = ENTITY_MODEL_MAP.get(entity_type)
    if not model:
        return None

    result = await db.execute(select(model).where(model.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        return None

    if entity_type == "story":
        return {
            "title": entity.title,
            "content_preview": entity.content[:200] if entity.content else "",
            "author_id": str(entity.author_id),
            "visibility": entity.visibility,
            "status": entity.status,
            "favorite_count": entity.favorite_count,
        }
    elif entity_type == "legacy":
        return {
            "name": entity.name,
            "biography": entity.biography,
            "visibility": entity.visibility,
            "birth_date": str(entity.birth_date) if entity.birth_date else None,
            "death_date": str(entity.death_date) if entity.death_date else None,
            "favorite_count": entity.favorite_count,
        }
    elif entity_type == "media":
        return {
            "filename": entity.filename,
            "content_type": entity.content_type,
            "favorite_count": entity.favorite_count,
        }
    return None
```

**Step 4: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/test_favorite_service.py -v --no-header
```
Expected: All tests PASS.

**Step 5: Run validation**

```bash
cd services/core-api && just validate-backend
```
Expected: ruff + mypy pass.

**Step 6: Commit**

```bash
git add services/core-api/app/services/favorite.py services/core-api/tests/test_favorite_service.py
git commit -m "feat: add favorite service with toggle, batch check, and list"
```

---

## Task 5: Backend Routes — Favorite API endpoints

**Files:**
- Create: `services/core-api/app/routes/favorite.py`
- Modify: `services/core-api/app/main.py` (register router)

**Step 1: Write the failing test**

Create `services/core-api/tests/test_favorite_api.py`:

```python
"""Integration tests for favorite API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.media import Media
from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestToggleFavorite:
    """Tests for POST /api/favorites."""

    @pytest.mark.asyncio
    async def test_toggle_favorite_on(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["favorited"] is True
        assert data["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_toggle_favorite_off(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        # First: favorite
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )
        # Second: unfavorite
        response = await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["favorited"] is False
        assert data["favorite_count"] == 0

    @pytest.mark.asyncio
    async def test_toggle_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ):
        response = await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
        )
        assert response.status_code == 401


class TestCheckFavorites:
    """Tests for GET /api/favorites/check."""

    @pytest.mark.asyncio
    async def test_batch_check(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
        test_story_public: Story,
    ):
        # Favorite one story
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        response = await client.get(
            f"/api/favorites/check?entity_ids={test_story.id},{test_story_public.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["favorites"][str(test_story.id)] is True
        assert data["favorites"][str(test_story_public.id)] is False


class TestListFavorites:
    """Tests for GET /api/favorites."""

    @pytest.mark.asyncio
    async def test_list_favorites(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        # Favorite a story
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/favorites",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["entity_type"] == "story"
        assert data["items"][0]["entity"] is not None

    @pytest.mark.asyncio
    async def test_list_favorites_filtered(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
        test_legacy: Legacy,
    ):
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )
        await client.post(
            "/api/favorites",
            json={"entity_type": "legacy", "entity_id": str(test_legacy.id)},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/favorites?entity_type=story",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["entity_type"] == "story"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_favorite_api.py -v --no-header
```
Expected: FAIL — 404 (route doesn't exist yet).

**Step 3: Create the routes**

Create `services/core-api/app/routes/favorite.py`:

```python
"""Favorite API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.favorite import (
    FavoriteCheckResponse,
    FavoriteListResponse,
    FavoriteToggleRequest,
    FavoriteToggleResponse,
)
from ..services import favorite as favorite_service

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


@router.post(
    "",
    response_model=FavoriteToggleResponse,
)
async def toggle_favorite(
    data: FavoriteToggleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FavoriteToggleResponse:
    """Toggle a favorite on or off."""
    session = require_auth(request)
    result = await favorite_service.toggle_favorite(
        db=db,
        user_id=session.user_id,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
    )
    return FavoriteToggleResponse(**result)


@router.get(
    "/check",
    response_model=FavoriteCheckResponse,
)
async def check_favorites(
    request: Request,
    entity_ids: str = Query(..., description="Comma-separated entity UUIDs"),
    db: AsyncSession = Depends(get_db),
) -> FavoriteCheckResponse:
    """Batch check which entities the user has favorited."""
    session = require_auth(request)
    parsed_ids = [UUID(eid.strip()) for eid in entity_ids.split(",") if eid.strip()]
    result = await favorite_service.batch_check_favorites(
        db=db,
        user_id=session.user_id,
        entity_ids=parsed_ids,
    )
    return FavoriteCheckResponse(favorites=result)


@router.get(
    "",
    response_model=FavoriteListResponse,
)
async def list_favorites(
    request: Request,
    entity_type: str | None = Query(None, description="Filter by entity type"),
    limit: int = Query(20, ge=1, le=100, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> FavoriteListResponse:
    """List the current user's favorites with entity metadata."""
    session = require_auth(request)
    result = await favorite_service.list_favorites(
        db=db,
        user_id=session.user_id,
        entity_type=entity_type,
        limit=limit,
    )
    return FavoriteListResponse(**result)
```

**Step 4: Register router in `main.py`**

In `services/core-api/app/main.py`, add:

```python
# Import (add with other route imports):
from .routes.favorite import router as favorite_router

# Register (add with other include_router calls):
app.include_router(favorite_router)
```

**Step 5: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/test_favorite_api.py -v --no-header
```
Expected: All tests PASS.

**Step 6: Run full test suite + validation**

```bash
cd services/core-api && uv run pytest --no-header -q && just validate-backend
```
Expected: No regressions, validation passes.

**Step 7: Commit**

```bash
git add services/core-api/app/routes/favorite.py services/core-api/app/main.py services/core-api/tests/test_favorite_api.py
git commit -m "feat: add favorite API endpoints (toggle, check, list)"
```

---

## Task 6: Frontend API & Hooks — Favorites feature module

**Files:**
- Create: `apps/web/src/features/favorites/api/favorites.ts`
- Create: `apps/web/src/features/favorites/hooks/useFavorites.ts`
- Modify: `apps/web/src/features/story/api/stories.ts` (add `favorite_count` to types)
- Modify: `apps/web/src/features/legacy/api/legacies.ts` (add `favorite_count` to type)
- Modify: `apps/web/src/features/media/api/media.ts` (add `favorite_count` to type)

**Step 1: Create favorites API module**

Create directory and file `apps/web/src/features/favorites/api/favorites.ts`:

```typescript
import { apiGet, apiPost } from '@/lib/api/client';

export type EntityType = 'story' | 'legacy' | 'media';

export interface FavoriteToggleResponse {
  favorited: boolean;
  favorite_count: number;
}

export interface FavoriteCheckResponse {
  favorites: Record<string, boolean>;
}

export interface FavoriteEntity {
  [key: string]: unknown;
}

export interface FavoriteItem {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  created_at: string;
  entity: FavoriteEntity | null;
}

export interface FavoriteListResponse {
  items: FavoriteItem[];
  total: number;
}

export async function toggleFavorite(
  entityType: EntityType,
  entityId: string,
): Promise<FavoriteToggleResponse> {
  return apiPost<FavoriteToggleResponse>('/api/favorites', {
    entity_type: entityType,
    entity_id: entityId,
  });
}

export async function checkFavorites(
  entityIds: string[],
): Promise<FavoriteCheckResponse> {
  if (entityIds.length === 0) return { favorites: {} };
  return apiGet<FavoriteCheckResponse>(
    `/api/favorites/check?entity_ids=${entityIds.join(',')}`,
  );
}

export async function listFavorites(
  entityType?: EntityType,
  limit = 20,
): Promise<FavoriteListResponse> {
  const params = new URLSearchParams();
  if (entityType) params.set('entity_type', entityType);
  params.set('limit', String(limit));
  return apiGet<FavoriteListResponse>(`/api/favorites?${params.toString()}`);
}
```

**Step 2: Create favorites hooks**

Create `apps/web/src/features/favorites/hooks/useFavorites.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkFavorites,
  listFavorites,
  toggleFavorite,
  type EntityType,
  type FavoriteToggleResponse,
} from '../api/favorites';
import { storyKeys } from '@/features/story/hooks/useStories';
import { legacyKeys } from '@/features/legacy/hooks/useLegacies';
import { mediaKeys } from '@/features/media/hooks/useMedia';

export const favoriteKeys = {
  all: ['favorites'] as const,
  check: (entityIds: string[]) => [...favoriteKeys.all, 'check', entityIds] as const,
  list: (entityType?: EntityType) => [...favoriteKeys.all, 'list', entityType] as const,
};

export function useFavoriteCheck(entityIds: string[]) {
  return useQuery({
    queryKey: favoriteKeys.check(entityIds),
    queryFn: () => checkFavorites(entityIds),
    enabled: entityIds.length > 0,
  });
}

export function useFavoriteToggle() {
  const queryClient = useQueryClient();

  return useMutation<
    FavoriteToggleResponse,
    Error,
    { entityType: EntityType; entityId: string }
  >({
    mutationFn: ({ entityType, entityId }) =>
      toggleFavorite(entityType, entityId),
    onSuccess: (_data, variables) => {
      // Invalidate favorite check caches
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });

      // Invalidate the parent entity list to refresh favorite_count
      switch (variables.entityType) {
        case 'story':
          queryClient.invalidateQueries({ queryKey: storyKeys.all });
          break;
        case 'legacy':
          queryClient.invalidateQueries({ queryKey: legacyKeys.all });
          break;
        case 'media':
          queryClient.invalidateQueries({ queryKey: mediaKeys.all });
          break;
      }
    },
  });
}

export function useMyFavorites(entityType?: EntityType, limit = 8) {
  return useQuery({
    queryKey: favoriteKeys.list(entityType),
    queryFn: () => listFavorites(entityType, limit),
  });
}
```

Note: The hook references `legacyKeys` and `mediaKeys`. Check the actual export names in `useLegacies.ts` and `useMedia.ts` — they may be named differently (e.g., `legacyQueryKeys`). Adjust the import to match. If they don't export query keys, add a simple `all` key export to each.

**Step 3: Add `favorite_count` to frontend types**

In `apps/web/src/features/story/api/stories.ts`, add to `StorySummary` and `StoryDetail`:
```typescript
favorite_count: number;
```

In `apps/web/src/features/legacy/api/legacies.ts`, add to `Legacy`:
```typescript
favorite_count?: number;
```

In `apps/web/src/features/media/api/media.ts`, add to `MediaItem`:
```typescript
favorite_count?: number;
```

**Step 4: Verify build compiles**

```bash
cd apps/web && npm run build
```
Expected: No TypeScript errors.

**Step 5: Commit**

```bash
git add apps/web/src/features/favorites/ apps/web/src/features/story/api/stories.ts apps/web/src/features/legacy/api/legacies.ts apps/web/src/features/media/api/media.ts
git commit -m "feat: add favorites API module, hooks, and favorite_count to entity types"
```

---

## Task 7: Frontend Component — `FavoriteButton`

**Files:**
- Create: `apps/web/src/features/favorites/components/FavoriteButton.tsx`

**Step 1: Create the FavoriteButton component**

Create `apps/web/src/features/favorites/components/FavoriteButton.tsx`:

```tsx
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavoriteToggle } from '../hooks/useFavorites';
import type { EntityType } from '../api/favorites';

interface FavoriteButtonProps {
  entityType: EntityType;
  entityId: string;
  isFavorited: boolean;
  favoriteCount: number;
  size?: 'sm' | 'default';
}

export default function FavoriteButton({
  entityType,
  entityId,
  isFavorited,
  favoriteCount,
  size = 'sm',
}: FavoriteButtonProps) {
  const toggle = useFavoriteToggle();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (toggle.isPending) return;
    toggle.mutate({ entityType, entityId });
  };

  // Optimistic display: flip during pending state
  const showFilled = toggle.isPending ? !isFavorited : isFavorited;
  const displayCount = toggle.isPending
    ? isFavorited
      ? Math.max(0, favoriteCount - 1)
      : favoriteCount + 1
    : favoriteCount;

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      disabled={toggle.isPending}
      className="gap-1 text-neutral-500 hover:text-red-500"
      aria-label={showFilled ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        className={`size-4 transition-colors ${
          showFilled ? 'fill-red-500 text-red-500' : ''
        }`}
      />
      {displayCount > 0 && (
        <span className="text-xs">{displayCount}</span>
      )}
    </Button>
  );
}
```

**Step 2: Verify build compiles**

```bash
cd apps/web && npm run build
```
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/favorites/components/FavoriteButton.tsx
git commit -m "feat: add FavoriteButton component with optimistic UI"
```

---

## Task 8: Integrate FavoriteButton into StoryCard

**Files:**
- Modify: `apps/web/src/features/legacy/components/StoryCard.tsx`
- Modify: `apps/web/src/features/legacy/components/StoriesSection.tsx` (pass favorite data)

**Step 1: Update StoryCard to use FavoriteButton**

In `apps/web/src/features/legacy/components/StoryCard.tsx`:

Replace the non-functional heart button (lines 77-81):
```tsx
{!story.shared_from && (
  <Button variant="ghost" size="sm">
    <Heart className="size-4" />
  </Button>
)}
```

With the FavoriteButton:
```tsx
{!story.shared_from && (
  <FavoriteButton
    entityType="story"
    entityId={story.id}
    isFavorited={isFavorited}
    favoriteCount={story.favorite_count}
  />
)}
```

Add imports:
```typescript
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
```

Remove unused `Heart` import from lucide-react and `Button` import if no longer used elsewhere in the component.

Update props to accept `isFavorited`:
```typescript
export interface StoryCardProps {
  story: StorySummary;
  onClick?: () => void;
  isFavorited?: boolean;
}

export default function StoryCard({ story, onClick, isFavorited = false }: StoryCardProps) {
```

**Step 2: Update StoriesSection to pass favorite data**

In `apps/web/src/features/legacy/components/StoriesSection.tsx`:

Add the favorite check hook. The component receives a list of stories — extract their IDs and call `useFavoriteCheck`:

```typescript
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useAuth } from '@/contexts/AuthContext';

// Inside the component:
const { user } = useAuth();
const storyIds = stories?.map(s => s.id) ?? [];
const { data: favoriteData } = useFavoriteCheck(user ? storyIds : []);
```

Then pass `isFavorited` to each `StoryCard`:
```tsx
<StoryCard
  key={story.id}
  story={story}
  onClick={() => onStoryClick(story.id)}
  isFavorited={favoriteData?.favorites[story.id] ?? false}
/>
```

**Step 3: Verify build compiles and visual test**

```bash
cd apps/web && npm run build
```
Expected: No errors. Start dev server (`npm run dev`) and check that the heart icon appears on story cards, clicking it fills/unfills the heart.

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/StoryCard.tsx apps/web/src/features/legacy/components/StoriesSection.tsx
git commit -m "feat: integrate FavoriteButton into story cards"
```

---

## Task 9: Integrate FavoriteButton into Legacy and Media cards

**Files:**
- Modify: `apps/web/src/pages/Homepage.tsx` (add heart to legacy cards)
- Modify: `apps/web/src/features/media/components/MediaGalleryInline.tsx` (add heart to media items)

**Step 1: Add FavoriteButton to legacy cards on homepage**

In `apps/web/src/pages/Homepage.tsx`:

Import the favorite components:
```typescript
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
```

In the "Explore Legacies" section, add the favorite check hook:
```typescript
const exploreLegacyIds = exploreLegacies?.map(l => l.id) ?? [];
const { data: legacyFavoriteData } = useFavoriteCheck(user ? exploreLegacyIds : []);
```

Add `FavoriteButton` to the explore legacy cards, in the card header area alongside the context badge:
```tsx
{user && (
  <FavoriteButton
    entityType="legacy"
    entityId={legacy.id}
    isFavorited={legacyFavoriteData?.favorites[legacy.id] ?? false}
    favoriteCount={legacy.favorite_count ?? 0}
  />
)}
```

**Step 2: Add FavoriteButton to media gallery items**

In `apps/web/src/features/media/components/MediaGalleryInline.tsx`:

Import:
```typescript
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useAuth } from '@/contexts/AuthContext';
```

Add the favorite check hook inside the component:
```typescript
const { user } = useAuth();
const mediaIds = media?.map(m => m.id) ?? [];
const { data: mediaFavoriteData } = useFavoriteCheck(user ? mediaIds : []);
```

Add `FavoriteButton` overlay on each media thumbnail (positioned in the top-right corner):
```tsx
{user && (
  <div className="absolute top-1 right-1 z-10">
    <FavoriteButton
      entityType="media"
      entityId={item.id}
      isFavorited={mediaFavoriteData?.favorites[item.id] ?? false}
      favoriteCount={item.favorite_count ?? 0}
      size="sm"
    />
  </div>
)}
```

**Step 3: Verify build and visual test**

```bash
cd apps/web && npm run build
```
Expected: No errors. Dev server shows hearts on legacy cards and media thumbnails.

**Step 4: Commit**

```bash
git add apps/web/src/pages/Homepage.tsx apps/web/src/features/media/components/MediaGalleryInline.tsx
git commit -m "feat: add favorite buttons to legacy cards and media gallery"
```

---

## Task 10: Homepage "My Favorites" Section

**Files:**
- Create: `apps/web/src/features/favorites/components/FavoritesSection.tsx`
- Modify: `apps/web/src/pages/Homepage.tsx` (add section)

**Step 1: Create FavoritesSection component**

Create `apps/web/src/features/favorites/components/FavoritesSection.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useMyFavorites } from '../hooks/useFavorites';
import type { EntityType, FavoriteItem } from '../api/favorites';

type FilterType = 'all' | EntityType;

function FavoriteCard({ item, onClick }: { item: FavoriteItem; onClick: () => void }) {
  if (!item.entity) return null;

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer p-4 space-y-2"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 capitalize">
          {item.entity_type}
        </span>
        <Heart className="size-3 fill-red-500 text-red-500" />
      </div>

      <h4 className="text-sm font-medium text-neutral-900 line-clamp-1">
        {(item.entity as Record<string, string>).title
          || (item.entity as Record<string, string>).name
          || (item.entity as Record<string, string>).filename
          || 'Untitled'}
      </h4>

      {(item.entity as Record<string, string>).content_preview && (
        <p className="text-xs text-neutral-500 line-clamp-2">
          {(item.entity as Record<string, string>).content_preview}
        </p>
      )}

      {(item.entity as Record<string, string>).biography && (
        <p className="text-xs text-neutral-500 line-clamp-2">
          {(item.entity as Record<string, string>).biography}
        </p>
      )}
    </Card>
  );
}

export default function FavoritesSection() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');
  const entityTypeFilter = filter === 'all' ? undefined : filter;
  const { data, isLoading } = useMyFavorites(entityTypeFilter, 8);

  // Don't render section if no favorites
  if (!isLoading && (!data || data.total === 0) && filter === 'all') {
    return null;
  }

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Stories', value: 'story' },
    { label: 'Legacies', value: 'legacy' },
    { label: 'Media', value: 'media' },
  ];

  const handleItemClick = (item: FavoriteItem) => {
    switch (item.entity_type) {
      case 'story':
        // Navigate to the story (need a legacy context — for now go to story directly)
        navigate(`/story/${item.entity_id}`);
        break;
      case 'legacy':
        navigate(`/legacy/${item.entity_id}`);
        break;
      case 'media':
        // Navigate to legacy that contains this media (simplified: go to media id)
        navigate(`/media/${item.entity_id}`);
        break;
    }
  };

  return (
    <section className="bg-neutral-50 py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-neutral-900">My Favorites</h2>
          <p className="text-neutral-600">
            Your saved stories, legacies, and media
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f.value
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && data.items.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.items.map(item => (
              <FavoriteCard
                key={item.id}
                item={item}
                onClick={() => handleItemClick(item)}
              />
            ))}
          </div>
        )}

        {!isLoading && data && data.items.length === 0 && filter !== 'all' && (
          <p className="text-center text-neutral-500 py-8">
            No {filter} favorites yet
          </p>
        )}
      </div>
    </section>
  );
}
```

**Step 2: Add FavoritesSection to Homepage**

In `apps/web/src/pages/Homepage.tsx`, import and place between "My Legacies" and "Explore Legacies":

```typescript
import FavoritesSection from '@/features/favorites/components/FavoritesSection';
```

Add the section in JSX (after the My Legacies section, before Explore Legacies):
```tsx
{user && <FavoritesSection />}
```

**Step 3: Verify build and visual test**

```bash
cd apps/web && npm run build
```
Expected: No errors. Homepage shows "My Favorites" section when user has favorites.

**Step 4: Commit**

```bash
git add apps/web/src/features/favorites/components/FavoritesSection.tsx apps/web/src/pages/Homepage.tsx
git commit -m "feat: add My Favorites section to homepage"
```

---

## Task 11: Backend Validation & Full Test Run

**Files:** None new — validation pass.

**Step 1: Run full backend test suite**

```bash
cd services/core-api && uv run pytest --no-header -q
```
Expected: All tests pass, no regressions.

**Step 2: Run backend validation**

```bash
cd services/core-api && just validate-backend
```
Expected: ruff + mypy pass.

**Step 3: Run frontend build**

```bash
cd apps/web && npm run build
```
Expected: Clean build, no TypeScript errors.

**Step 4: Run frontend tests**

```bash
cd apps/web && npm run test -- --run
```
Expected: All existing tests pass.

**Step 5: Commit any fixes if needed**

If validation surfaces issues, fix them and commit:
```bash
git add -u
git commit -m "fix: address validation issues in favorites implementation"
```

---

## Task 12: Manual Smoke Test

**No files — manual verification only.**

**Step 1: Start the full stack**

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

**Step 2: Run migrations**

```bash
cd services/core-api && uv run alembic upgrade head
```

**Step 3: Test the flow**

1. Log in via Google OAuth
2. Navigate to a legacy detail page with stories
3. Click the heart icon on a story card — verify it fills and shows count "1"
4. Click again — verify it unfills and count disappears
5. Navigate to homepage — verify "My Favorites" section appears with the favorited item
6. Use filter tabs to filter by type
7. Check legacy cards in Explore section — verify heart icon appears
8. Check media gallery — verify heart icon appears on thumbnails

**Step 4: Verify API directly**

```bash
# Toggle favorite
curl -X POST http://localhost:8080/api/favorites \
  -H "Content-Type: application/json" \
  -H "Cookie: <session_cookie>" \
  -d '{"entity_type": "story", "entity_id": "<story_id>"}'

# Check favorites
curl "http://localhost:8080/api/favorites/check?entity_ids=<id1>,<id2>" \
  -H "Cookie: <session_cookie>"

# List favorites
curl "http://localhost:8080/api/favorites?limit=10" \
  -H "Cookie: <session_cookie>"
```

---

## Summary of All Files

### New Files (8)
| File | Purpose |
|------|---------|
| `services/core-api/app/models/favorite.py` | UserFavorite SQLAlchemy model |
| `services/core-api/app/schemas/favorite.py` | Pydantic request/response schemas |
| `services/core-api/app/services/favorite.py` | Toggle, batch check, list logic |
| `services/core-api/app/routes/favorite.py` | API endpoints |
| `services/core-api/tests/test_favorite_service.py` | Service unit tests |
| `services/core-api/tests/test_favorite_api.py` | API integration tests |
| `apps/web/src/features/favorites/api/favorites.ts` | Frontend API client |
| `apps/web/src/features/favorites/hooks/useFavorites.ts` | TanStack Query hooks |
| `apps/web/src/features/favorites/components/FavoriteButton.tsx` | Reusable heart button |
| `apps/web/src/features/favorites/components/FavoritesSection.tsx` | Homepage favorites section |

### Modified Files (8)
| File | Change |
|------|--------|
| `services/core-api/app/models/__init__.py` | Register UserFavorite |
| `services/core-api/app/models/story.py` | Add `favorite_count` column |
| `services/core-api/app/models/legacy.py` | Add `favorite_count` column |
| `services/core-api/app/models/media.py` | Add `favorite_count` column |
| `services/core-api/app/main.py` | Register favorite router |
| `services/core-api/app/schemas/story.py` | Add `favorite_count` to responses |
| `services/core-api/app/schemas/legacy.py` | Add `favorite_count` to response |
| `services/core-api/app/schemas/media.py` | Add `favorite_count` to responses |
| `apps/web/src/features/story/api/stories.ts` | Add `favorite_count` to types |
| `apps/web/src/features/legacy/api/legacies.ts` | Add `favorite_count` to type |
| `apps/web/src/features/media/api/media.ts` | Add `favorite_count` to type |
| `apps/web/src/features/legacy/components/StoryCard.tsx` | Replace heart placeholder with FavoriteButton |
| `apps/web/src/features/legacy/components/StoriesSection.tsx` | Add favorite check hook |
| `apps/web/src/pages/Homepage.tsx` | Add FavoritesSection + legacy card hearts |
| `apps/web/src/features/media/components/MediaGalleryInline.tsx` | Add media heart overlay |
