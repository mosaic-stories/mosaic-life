"""Service layer for story operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import LegacyMember
from ..models.story import Story
from ..schemas.story import StoryCreate, StoryDetail, StoryResponse, StorySummary, StoryUpdate
from .legacy import check_legacy_access

logger = logging.getLogger(__name__)


async def create_story(
    db: AsyncSession,
    user_id: UUID,
    data: StoryCreate,
) -> StoryResponse:
    """Create a new story.

    User must be a member of the legacy.

    Args:
        db: Database session
        user_id: User creating the story
        data: Story creation data

    Returns:
        Created story

    Raises:
        HTTPException: 403 if not a member
    """
    # Check user is a member of the legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=data.legacy_id,
        required_role="member",
    )

    # Create story
    story = Story(
        legacy_id=data.legacy_id,
        author_id=user_id,
        title=data.title,
        content=data.content,
        visibility=data.visibility,
    )
    db.add(story)
    await db.commit()
    await db.refresh(story)

    logger.info(
        "story.created",
        extra={
            "story_id": str(story.id),
            "legacy_id": str(data.legacy_id),
            "author_id": str(user_id),
            "visibility": data.visibility,
        },
    )

    return StoryResponse(
        id=story.id,
        legacy_id=story.legacy_id,
        title=story.title,
        visibility=story.visibility,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def list_legacy_stories(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> list[StorySummary]:
    """List stories for a legacy, filtered by visibility.

    Visibility rules:
    - Member sees: public + private + own personal stories
    - Non-member sees: only public stories

    Args:
        db: Database session
        user_id: Requesting user ID
        legacy_id: Legacy ID

    Returns:
        List of stories visible to the user
    """
    # Check if user is a member (not pending)
    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    member = result.scalar_one_or_none()

    # Build query based on membership
    query = (
        select(Story)
        .options(selectinload(Story.author))
        .where(Story.legacy_id == legacy_id)
    )

    if member:
        # Member sees: public + private + own personal stories
        query = query.where(
            or_(
                Story.visibility == "public",
                Story.visibility == "private",
                and_(Story.visibility == "personal", Story.author_id == user_id),
            )
        )
    else:
        # Non-member sees only public stories
        query = query.where(Story.visibility == "public")

    query = query.order_by(Story.created_at.desc())

    result = await db.execute(query)
    stories = result.scalars().all()

    logger.info(
        "story.list",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
            "is_member": member is not None,
            "count": len(stories),
        },
    )

    return [
        StorySummary(
            id=story.id,
            legacy_id=story.legacy_id,
            title=story.title,
            author_id=story.author_id,
            author_name=story.author.name,
            visibility=story.visibility,
            created_at=story.created_at,
            updated_at=story.updated_at,
        )
        for story in stories
    ]


async def get_story_detail(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
) -> StoryDetail:
    """Get story detail.

    Enforces visibility rules.

    Args:
        db: Database session
        user_id: Requesting user ID
        story_id: Story ID

    Returns:
        Story details

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    # Load story with relationships
    result = await db.execute(
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy),
        )
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        logger.warning(
            "story.not_found",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
            },
        )
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Check visibility
    authorized = await _check_story_visibility(db, user_id, story)

    if not authorized:
        logger.warning(
            "story.access_denied",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "visibility": story.visibility,
                "author_id": str(story.author_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Not authorized to view this story",
        )

    logger.info(
        "story.detail",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
        },
    )

    return StoryDetail(
        id=story.id,
        legacy_id=story.legacy_id,
        legacy_name=story.legacy.name,
        author_id=story.author_id,
        author_name=story.author.name,
        author_email=story.author.email,
        title=story.title,
        content=story.content,
        visibility=story.visibility,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def update_story(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
    data: StoryUpdate,
) -> StoryResponse:
    """Update a story.

    Only author can update.

    Args:
        db: Database session
        user_id: User updating the story
        story_id: Story ID
        data: Update data

    Returns:
        Updated story

    Raises:
        HTTPException: 404 if not found, 403 if not author
    """
    # Load story
    result = await db.execute(
        select(Story).where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Check author
    if story.author_id != user_id:
        logger.warning(
            "story.update_denied",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "author_id": str(story.author_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Only the author can update this story",
        )

    # Update fields
    if data.title is not None:
        story.title = data.title
    if data.content is not None:
        story.content = data.content
    if data.visibility is not None:
        story.visibility = data.visibility

    story.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(story)

    logger.info(
        "story.updated",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
        },
    )

    return StoryResponse(
        id=story.id,
        legacy_id=story.legacy_id,
        title=story.title,
        visibility=story.visibility,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def delete_story(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
) -> dict[str, str]:
    """Delete a story.

    Only author or legacy creator can delete.

    Args:
        db: Database session
        user_id: User deleting the story
        story_id: Story ID

    Returns:
        Success message

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    # Load story
    result = await db.execute(
        select(Story).where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Check if user is author
    is_author = story.author_id == user_id

    # Check if user is legacy creator
    is_creator = False
    if not is_author:
        try:
            await check_legacy_access(
                db=db,
                user_id=user_id,
                legacy_id=story.legacy_id,
                required_role="creator",
            )
            is_creator = True
        except HTTPException:
            is_creator = False

    if not is_author and not is_creator:
        logger.warning(
            "story.delete_denied",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "author_id": str(story.author_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Only the author or legacy creator can delete this story",
        )

    # Delete story
    await db.delete(story)
    await db.commit()

    logger.info(
        "story.deleted",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
            "deleted_by": "author" if is_author else "creator",
        },
    )

    return {"message": "Story deleted"}


async def _check_story_visibility(
    db: AsyncSession,
    user_id: UUID,
    story: Story,
) -> bool:
    """Check if user can view a story based on visibility rules.

    Args:
        db: Database session
        user_id: Requesting user ID
        story: Story to check

    Returns:
        True if authorized, False otherwise
    """
    # Public stories are visible to everyone
    if story.visibility == "public":
        return True

    # Personal stories are only visible to author
    if story.visibility == "personal":
        return story.author_id == user_id

    # Private stories are visible to legacy members
    if story.visibility == "private":
        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == story.legacy_id,
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
        )
        member = result.scalar_one_or_none()
        return member is not None

    # Unknown visibility (shouldn't happen)
    return False
