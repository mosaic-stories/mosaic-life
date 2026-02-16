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
