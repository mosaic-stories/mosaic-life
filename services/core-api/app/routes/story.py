"""API routes for story management."""

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db, get_db_for_background
from ..schemas.story import (
    StoryCreate,
    StoryDetail,
    StoryResponse,
    StoryScopeCounts,
    StoryScopedResponse,
    StoryStatsResponse,
    StorySummary,
    StoryUpdate,
    TopLegacyResponse,
)
from ..services import activity as activity_service
from ..services import story as story_service
from ..services.ingestion import index_story_chunks

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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> StoryResponse:
    """Create a new story.

    User must be a member of the legacy to create stories.
    """
    session = require_auth(request)

    story = await story_service.create_story(
        db=db,
        user_id=session.user_id,
        data=data,
    )

    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="created",
        entity_type="story",
        entity_id=story.id,
        metadata={
            "title": story.title,
            "legacy_id": str(story.legacies[0].legacy_id) if story.legacies else None,
        },
    )

    # Queue background indexing
    if story.legacies:
        primary_legacy = next(
            (leg for leg in story.legacies if leg.role == "primary"),
            story.legacies[0],
        )

        async def background_index() -> None:
            try:
                async for bg_db in get_db_for_background():
                    await index_story_chunks(
                        db=bg_db,
                        story_id=story.id,
                        content=data.content,
                        legacy_id=primary_legacy.legacy_id,
                        visibility=data.visibility,
                        author_id=session.user_id,
                        user_id=session.user_id,
                    )
            except Exception as e:
                logger.error(
                    "background_indexing_failed",
                    extra={"story_id": str(story.id), "error": str(e)},
                    exc_info=True,
                )

        background_tasks.add_task(background_index)

    return story


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
    response_model=StoryScopedResponse | list[StorySummary],
    summary="List stories",
    description="List stories filtered by visibility rules. Filter by legacy_id, orphaned flag, or scope.",
)
async def list_stories(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    orphaned: bool = Query(False, description="Return only orphaned stories"),
    scope: Literal["all", "mine", "shared", "favorites", "drafts"] | None = Query(
        None, description="Filter scope (alternative to legacy_id/orphaned)"
    ),
    db: AsyncSession = Depends(get_db),
) -> StoryScopedResponse | list[StorySummary]:
    """List stories with optional filtering."""
    session = require_auth(request)

    if scope:
        result = await story_service.list_stories_scoped(
            db=db,
            user_id=session.user_id,
            scope=scope,
        )
        return StoryScopedResponse(
            items=result["items"],
            counts=StoryScopeCounts(**result["counts"]),
        )

    return await story_service.list_legacy_stories(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        orphaned=orphaned,
    )


@router.get(
    "/stats",
    response_model=StoryStatsResponse,
    summary="Get story stats",
    description="Get story-specific statistics for the authenticated user.",
)
async def get_story_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryStatsResponse:
    """Get story stats for the current user."""
    session = require_auth(request)

    result = await story_service.get_story_stats(
        db=db,
        user_id=session.user_id,
    )
    return StoryStatsResponse(**result)


@router.get(
    "/top-legacies",
    response_model=list[TopLegacyResponse],
    summary="Get top legacies by story count",
    description="Get legacies the user has written the most stories about.",
)
async def get_top_legacies(
    request: Request,
    limit: int = Query(default=6, ge=1, le=20, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[TopLegacyResponse]:
    """Get top legacies by story count for the current user."""
    session = require_auth(request)

    items = await story_service.get_top_legacies(
        db=db,
        user_id=session.user_id,
        limit=limit,
    )
    return [TopLegacyResponse(**item) for item in items]


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

    result = await story_service.get_story_detail(
        db=db,
        user_id=session.user_id,
        story_id=story_id,
    )
    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="viewed",
        entity_type="story",
        entity_id=story_id,
        metadata={"title": result.title},
        deduplicate_minutes=5,
    )
    return result


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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> StoryResponse:
    """Update a story.

    Only the story author can update.
    """
    session = require_auth(request)

    story = await story_service.update_story(
        db=db,
        user_id=session.user_id,
        story_id=story_id,
        data=data,
    )

    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="updated",
        entity_type="story",
        entity_id=story_id,
        metadata={"title": story.title},
    )

    # Reindex if content changed
    if data.content is not None and story.legacies:
        primary_legacy = next(
            (leg for leg in story.legacies if leg.role == "primary"),
            story.legacies[0],
        )
        # Capture content to satisfy mypy
        content = data.content

        async def background_reindex() -> None:
            try:
                async for bg_db in get_db_for_background():
                    await index_story_chunks(
                        db=bg_db,
                        story_id=story.id,
                        content=content,
                        legacy_id=primary_legacy.legacy_id,
                        visibility=story.visibility,
                        author_id=session.user_id,
                        user_id=session.user_id,
                    )
            except Exception as e:
                logger.error(
                    "background_reindexing_failed",
                    extra={"story_id": str(story.id), "error": str(e)},
                    exc_info=True,
                )

        background_tasks.add_task(background_reindex)

    return story


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

    result = await story_service.delete_story(
        db=db,
        user_id=session.user_id,
        story_id=story_id,
    )
    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="deleted",
        entity_type="story",
        entity_id=story_id,
        metadata={"title": result["title"]},
    )
