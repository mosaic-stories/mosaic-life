"""API routes for story version management."""

import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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


async def _require_author(db: AsyncSession, story_id: UUID, user_id: UUID) -> Story:
    """Load story and verify requesting user is the author.

    Raises HTTPException 404 if not found, 403 if not author.
    """
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story.author_id != user_id:
        raise HTTPException(
            status_code=403, detail="Only the author can manage versions"
        )

    return story


# ── List / Bulk operations (no path parameter) ──────────────────────────


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
        db=db,
        story_id=story_id,
        page=page,
        page_size=page_size,
    )


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
        db=db,
        story_id=story_id,
        version_numbers=data.version_numbers,
    )
    await db.commit()


# ── Draft operations (literal "draft" path — MUST precede /{version_number}) ─


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


# ── Single-version operations (parameterised path) ──────────────────────


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
        db=db,
        story_id=story_id,
        version_number=version_number,
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

    await version_service.delete_version(
        db=db,
        story_id=story_id,
        version_number=version_number,
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
        db=db,
        story_id=story_id,
        version_number=version_number,
        user_id=session.user_id,
    )
    await db.commit()

    # Queue embedding reprocessing
    _queue_reindex(background_tasks, story, result.content, session.user_id)

    return result


# ── Helpers ──────────────────────────────────────────────────────────────


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
