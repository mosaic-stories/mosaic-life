"""Favorite service — toggle, batch check, and list favorites."""

import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
        raise HTTPException(
            status_code=400, detail=f"Invalid entity_type: {entity_type}"
        )

    result: Any = await db.execute(select(model).where(model.id == entity_id))  # type: ignore[attr-defined]
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
        current_count = (
            entity.favorite_count if entity.favorite_count is not None else 0
        )
        entity.favorite_count = max(0, current_count - 1)
        favorited = False
    else:
        # Add favorite — UniqueConstraint handles concurrent duplicates
        favorite = UserFavorite(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        db.add(favorite)
        try:
            await db.flush()
        except IntegrityError:
            # Concurrent insert already created the row — rollback and return
            await db.rollback()
            entity = await _get_entity(db, entity_type, entity_id)
            return {"favorited": True, "favorite_count": entity.favorite_count or 0}
        current_count = (
            entity.favorite_count if entity.favorite_count is not None else 0
        )
        entity.favorite_count = current_count + 1
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
    entity_type: str,
    entity_ids: list[UUID],
) -> dict[str, bool]:
    """Check which entities the user has favorited. Returns {entity_id: bool}."""
    if not entity_ids:
        return {}

    result = await db.execute(
        select(UserFavorite.entity_id).where(
            UserFavorite.user_id == user_id,
            UserFavorite.entity_type == entity_type,
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
    offset: int = 0,
) -> dict[str, Any]:
    """List user's favorites with entity metadata."""
    base_filter = [UserFavorite.user_id == user_id]
    if entity_type:
        base_filter.append(UserFavorite.entity_type == entity_type)

    # Get true total count
    count_result = await db.execute(
        select(func.count()).select_from(UserFavorite).where(*base_filter)
    )
    total: int = count_result.scalar_one()

    # Fetch paginated favorites
    query = (
        select(UserFavorite)
        .where(*base_filter)
        .order_by(UserFavorite.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    favorites = result.scalars().all()

    # Load entity metadata for each favorite
    items: list[dict[str, Any]] = []
    orphan_found = False
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
            orphan_found = True

    if orphan_found:
        await db.commit()

    return {"items": items, "total": total}


async def _get_entity_summary(
    db: AsyncSession,
    entity_type: str,
    entity_id: UUID,
) -> dict[str, Any] | None:
    """Load a minimal summary of an entity for the favorites list."""
    model = ENTITY_MODEL_MAP.get(entity_type)
    if not model:
        return None

    query: Any = select(model).where(model.id == entity_id)  # type: ignore[attr-defined]
    # Eagerly load legacy_associations for story/media to get legacy_id
    if entity_type in ("story", "media") and hasattr(model, "legacy_associations"):
        query = query.options(selectinload(model.legacy_associations))
    result: Any = await db.execute(query)
    entity = result.scalar_one_or_none()
    if not entity:
        return None

    if entity_type == "story":
        # Include first legacy_id for frontend routing
        legacy_id = None
        if hasattr(entity, "legacy_associations") and entity.legacy_associations:
            legacy_id = str(entity.legacy_associations[0].legacy_id)
        return {
            "title": entity.title,
            "content_preview": entity.content[:200] if entity.content else "",
            "author_id": str(entity.author_id),
            "visibility": entity.visibility,
            "status": entity.status,
            "favorite_count": entity.favorite_count or 0,
            "legacy_id": legacy_id,
        }
    elif entity_type == "legacy":
        return {
            "id": str(entity.id),
            "name": entity.name,
            "biography": entity.biography,
            "visibility": entity.visibility,
            "birth_date": str(entity.birth_date) if entity.birth_date else None,
            "death_date": str(entity.death_date) if entity.death_date else None,
            "favorite_count": entity.favorite_count or 0,
        }
    elif entity_type == "media":
        # Include first legacy_id for frontend routing
        legacy_id = None
        if hasattr(entity, "legacy_associations") and entity.legacy_associations:
            legacy_id = str(entity.legacy_associations[0].legacy_id)
        return {
            "filename": entity.filename,
            "content_type": entity.content_type,
            "favorite_count": entity.favorite_count or 0,
            "legacy_id": legacy_id,
        }
    return None
