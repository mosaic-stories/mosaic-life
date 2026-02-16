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
