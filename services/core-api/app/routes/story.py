"""API routes for story management."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.story import (
    StoryCreate,
    StoryDetail,
    StoryResponse,
    StorySummary,
    StoryUpdate,
)
from ..services import story as story_service

router = APIRouter(prefix="/api/stories", tags=["stories"])
logger = logging.getLogger(__name__)


@router.post(
    "/",
    response_model=StoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new story",
    description="Create a story. User must be a legacy member.",
)
async def create_story(
    data: StoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryResponse:
    """Create a new story.

    User must be a member of the legacy to create stories.
    """
    session = require_auth(request)

    return await story_service.create_story(
        db=db,
        user_id=session.user_id,
        data=data,
    )


@router.get(
    "/public",
    response_model=list[StorySummary],
    summary="List public stories for a legacy",
    description="List public stories for a legacy. No authentication required.",
)
async def list_public_stories(
    legacy_id: UUID = Query(..., description="Legacy ID to list stories for"),
    db: AsyncSession = Depends(get_db),
) -> list[StorySummary]:
    """List public stories for a legacy.

    Returns only public stories. No authentication required.
    """
    return await story_service.list_public_stories(
        db=db,
        legacy_id=legacy_id,
    )


@router.get(
    "/",
    response_model=list[StorySummary],
    summary="List stories",
    description="List stories filtered by visibility rules. Filter by legacy_id or use orphaned flag.",
)
async def list_stories(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    orphaned: bool = Query(False, description="Return only orphaned stories"),
    db: AsyncSession = Depends(get_db),
) -> list[StorySummary]:
    """List stories with optional filtering.

    Visibility filtering:
    - Members see: public + private + own personal stories
    - Non-members see: only public stories
    - Orphaned stories: user's stories with no legacy associations
    """
    session = require_auth(request)

    return await story_service.list_legacy_stories(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        orphaned=orphaned,
    )


@router.get(
    "/{story_id}",
    response_model=StoryDetail,
    summary="Get story details",
    description="Get full story details. Visibility rules enforced.",
)
async def get_story(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryDetail:
    """Get story details.

    Returns full story content if user has permission based on visibility.
    """
    session = require_auth(request)

    return await story_service.get_story_detail(
        db=db,
        user_id=session.user_id,
        story_id=story_id,
    )


@router.put(
    "/{story_id}",
    response_model=StoryResponse,
    summary="Update story",
    description="Update a story. Only author can update.",
)
async def update_story(
    story_id: UUID,
    data: StoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryResponse:
    """Update a story.

    Only the story author can update.
    """
    session = require_auth(request)

    return await story_service.update_story(
        db=db,
        user_id=session.user_id,
        story_id=story_id,
        data=data,
    )


@router.delete(
    "/{story_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete story",
    description="Delete a story. Author or legacy creator can delete.",
)
async def delete_story(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a story.

    Only the author or legacy creator can delete.
    """
    session = require_auth(request)

    await story_service.delete_story(
        db=db,
        user_id=session.user_id,
        story_id=story_id,
    )
