"""Activity tracking API routes."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.activity import (
    ActivityFeedResponse,
    ActivityItem,
    CleanupResponse,
    RecentItemsResponse,
)
from ..services import activity as activity_service

router = APIRouter(prefix="/api/activity", tags=["activity"])

EntityTypeParam = Literal["legacy", "story", "media", "conversation"]


@router.get("", response_model=ActivityFeedResponse)
async def get_activity_feed(
    request: Request,
    entity_type: EntityTypeParam | None = Query(
        None, description="Filter by entity type"
    ),
    action: str | None = Query(None, description="Filter by action"),
    cursor: str | None = Query(None, description="ISO timestamp cursor for pagination"),
    limit: int = Query(20, ge=1, le=100, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> ActivityFeedResponse:
    """Get the current user's activity feed."""
    session = require_auth(request)

    cursor_dt = None
    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)

    result = await activity_service.get_activity_feed(
        db=db,
        user_id=session.user_id,
        entity_type=entity_type,
        action=action,
        cursor=cursor_dt,
        limit=limit,
    )
    # Convert ORM objects to ActivityItem, mapping metadata_ -> metadata
    items = [
        ActivityItem(
            id=item.id,
            action=item.action,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            metadata=item.metadata_,
            created_at=item.created_at,
        )
        for item in result["items"]
    ]
    return ActivityFeedResponse(
        items=items,
        next_cursor=result["next_cursor"],
        has_more=result["has_more"],
        tracking_enabled=result["tracking_enabled"],
    )


@router.get("/recent", response_model=RecentItemsResponse)
async def get_recent_items(
    request: Request,
    entity_type: EntityTypeParam | None = Query(
        None, description="Filter by entity type"
    ),
    limit: int = Query(10, ge=1, le=50, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> RecentItemsResponse:
    """Get the current user's recently interacted-with items (deduplicated)."""
    session = require_auth(request)

    result = await activity_service.get_recent_items(
        db=db,
        user_id=session.user_id,
        entity_type=entity_type,
        limit=limit,
    )
    return RecentItemsResponse(**result)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_activity(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear all activity history for the current user."""
    session = require_auth(request)
    await activity_service.clear_user_activity(db=db, user_id=session.user_id)
    await db.commit()


# Internal cleanup endpoint — called by Kubernetes CronJob
internal_router = APIRouter(prefix="/api/internal/activity", tags=["activity-internal"])


@internal_router.get("/cleanup", response_model=CleanupResponse)
async def run_cleanup(
    db: AsyncSession = Depends(get_db),
) -> CleanupResponse:
    """Run tiered retention cleanup. Called by CronJob — no auth required."""
    deleted = await activity_service.run_retention_cleanup(db=db)
    await db.commit()
    return CleanupResponse(deleted_count=deleted)
