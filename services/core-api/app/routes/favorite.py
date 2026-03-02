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
