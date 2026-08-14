"""API routes for story version management."""

import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Query,
    Request,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..models.story import Story
from ..schemas.story_version import (
    BulkDeleteRequest,
    StoryVersionDetail,
    StoryVersionListResponse,
)
from ..services import story_version as version_service
from ..services.story_access import require_story_write_access

router = APIRouter(prefix="/api/stories/{story_id}/versions", tags=["story-versions"])
logger = logging.getLogger(__name__)


async def _require_author(db: AsyncSession, story_id: UUID, user_id: UUID) -> Story:
    """Load story and verify requesting user is the author.

    Delegates to the canonical story-access write gate.
    """
    return await require_story_write_access(
        db=db, story_id=story_id, user_id=user_id, action="manage versions for"
    )


# ── List / Bulk operations (no path parameter) ──────────────────────────


@router.get(
    "",
    response_model=StoryVersionListResponse,
    summary="List all versions for a story",
)
async def list_versions(
    story_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> StoryVersionListResponse:
    session = require_auth(request)
    story = await _require_author(db, story_id, session.user_id)

    result = await version_service.list_versions(
        db=db,
        story=story,
        user_id=session.user_id,
        background_tasks=background_tasks,
        page=page,
        page_size=page_size,
    )
    # `list_versions` may mint a version if the previous editing session
    # went idle or hit the max-interval cap (design.md Decision 2);
    # `mint_version_at_boundary` never commits (repo convention -- callers
    # own the commit, see commit c1cb24c). Committing unconditionally here
    # matches this file's other routes that call a mutating service
    # function (e.g. `approve_draft`, `restore_version` below) -- a no-op
    # commit when nothing was minted is harmless.
    await db.commit()

    return result


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
    await _require_author(db, story_id, session.user_id)

    result = await version_service.approve_draft(
        db=db,
        story_id=story_id,
        user_id=session.user_id,
        background_tasks=background_tasks,
    )
    await db.commit()

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
    await _require_author(db, story_id, session.user_id)

    result = await version_service.restore_version(
        db=db,
        story_id=story_id,
        version_number=version_number,
        user_id=session.user_id,
        background_tasks=background_tasks,
    )
    await db.commit()

    return result
