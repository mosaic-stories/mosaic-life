"""Shared story access checks for story-scoped routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.legacy import LegacyMember
from app.models.story import Story


async def require_story_read_access(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
) -> Story:
    """Load story and enforce visibility-based read access."""
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if await can_read_story(db=db, story=story, user_id=user_id):
        return story

    raise HTTPException(status_code=403, detail="Not authorized to view this story")


async def can_read_story(db: AsyncSession, story: Story, user_id: UUID) -> bool:
    """Return whether a user may read a story according to visibility rules."""
    if story.visibility == "public":
        return True

    if story.visibility == "personal":
        return story.author_id == user_id

    if story.visibility == "private":
        if story.author_id == user_id:
            return True

        story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
        if not story_legacy_ids:
            return False

        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(story_legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        return result.scalar_one_or_none() is not None

    return False
