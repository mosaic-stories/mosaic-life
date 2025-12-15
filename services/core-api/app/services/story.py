"""Service layer for story operations."""

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.associations import StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.story import Story
from ..schemas.associations import LegacyAssociationResponse
from ..schemas.story import (
    StoryCreate,
    StoryDetail,
    StoryResponse,
    StorySummary,
    StoryUpdate,
)

logger = logging.getLogger(__name__)

# Maximum length for content preview
PREVIEW_MAX_LENGTH = 200


def create_content_preview(content: str, max_length: int = PREVIEW_MAX_LENGTH) -> str:
    """Create a truncated preview of story content.

    Strips markdown formatting and truncates to max_length characters,
    ending at a word boundary with an ellipsis if truncated.

    Args:
        content: Full story content (may contain markdown)
        max_length: Maximum preview length

    Returns:
        Truncated plain text preview
    """
    # Remove markdown formatting
    # Remove headers
    text = re.sub(r"^#{1,6}\s+", "", content, flags=re.MULTILINE)
    # Remove bold/italic
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)
    # Remove links but keep text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove images
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    # Remove code blocks
    text = re.sub(r"```[^`]*```", "", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove blockquotes
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r"^[-*_]{3,}$", "", text, flags=re.MULTILINE)
    # Collapse multiple newlines/whitespace
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) <= max_length:
        return text

    # Truncate at word boundary
    truncated = text[:max_length]
    last_space = truncated.rfind(" ")
    if last_space > max_length * 0.7:  # Only use word boundary if reasonably close
        truncated = truncated[:last_space]

    return truncated.rstrip(".,;:!?") + "..."


async def _get_legacy_names(db: AsyncSession, legacy_ids: list[UUID]) -> dict[UUID, str]:
    """Fetch legacy names by IDs.

    Args:
        db: Database session
        legacy_ids: List of legacy IDs

    Returns:
        Mapping of legacy ID to legacy name
    """
    if not legacy_ids:
        return {}

    result = await db.execute(
        select(Legacy.id, Legacy.name).where(Legacy.id.in_(legacy_ids))
    )
    return {row[0]: row[1] for row in result.all()}


async def create_story(
    db: AsyncSession,
    user_id: UUID,
    data: StoryCreate,
) -> StoryResponse:
    """Create a new story.

    User must be a member of at least one of the specified legacies.

    Args:
        db: Database session
        user_id: User creating the story
        data: Story creation data

    Returns:
        Created story

    Raises:
        HTTPException: 403 if not a member of any legacy
    """
    # Extract legacy IDs from the legacies list
    legacy_ids = [leg.legacy_id for leg in data.legacies]

    # Verify user is a member of at least one legacy
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.user_id == user_id,
            LegacyMember.legacy_id.in_(legacy_ids),
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        logger.warning(
            "story.create_denied",
            extra={
                "user_id": str(user_id),
                "legacy_ids": [str(lid) for lid in legacy_ids],
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Must be a member of at least one legacy to create a story",
        )

    # Create story (without legacy_id - using many-to-many)
    story = Story(
        author_id=user_id,
        title=data.title,
        content=data.content,
        visibility=data.visibility,
    )
    db.add(story)
    await db.flush()  # Get story.id without committing

    # Create StoryLegacy associations
    for leg_assoc in data.legacies:
        story_legacy = StoryLegacy(
            story_id=story.id,
            legacy_id=leg_assoc.legacy_id,
            role=leg_assoc.role,
            position=leg_assoc.position,
        )
        db.add(story_legacy)

    await db.commit()
    await db.refresh(story)

    # Get legacy names for response
    legacy_names = await _get_legacy_names(db, legacy_ids)

    # Build legacies response
    legacies = [
        LegacyAssociationResponse(
            legacy_id=leg.legacy_id,
            legacy_name=legacy_names.get(leg.legacy_id, "Unknown"),
            role=leg.role,
            position=leg.position,
        )
        for leg in sorted(data.legacies, key=lambda x: x.position)
    ]

    logger.info(
        "story.created",
        extra={
            "story_id": str(story.id),
            "legacy_ids": [str(lid) for lid in legacy_ids],
            "author_id": str(user_id),
            "visibility": data.visibility,
        },
    )

    return StoryResponse(
        id=story.id,
        title=story.title,
        visibility=story.visibility,
        legacies=legacies,
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
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()

    # Build query to find stories associated with this legacy
    query = (
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .join(StoryLegacy, Story.id == StoryLegacy.story_id)
        .where(StoryLegacy.legacy_id == legacy_id)
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

    story_result = await db.execute(query)
    stories = story_result.scalars().unique().all()

    # Get all unique legacy IDs from all stories
    all_legacy_ids: set[UUID] = set()
    for story in stories:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)

    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

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
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            visibility=story.visibility,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
            created_at=story.created_at,
            updated_at=story.updated_at,
        )
        for story in stories
    ]


async def list_public_stories(
    db: AsyncSession,
    legacy_id: UUID,
) -> list[StorySummary]:
    """List public stories for a legacy (no auth required).

    Args:
        db: Database session
        legacy_id: Legacy ID

    Returns:
        List of public stories for the legacy
    """
    query = (
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .join(StoryLegacy, Story.id == StoryLegacy.story_id)
        .where(StoryLegacy.legacy_id == legacy_id)
        .where(Story.visibility == "public")
        .order_by(Story.created_at.desc())
    )

    story_result = await db.execute(query)
    stories = story_result.scalars().unique().all()

    # Get all unique legacy IDs from all stories
    all_legacy_ids: set[UUID] = set()
    for story in stories:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)

    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    logger.info(
        "story.list.public",
        extra={
            "legacy_id": str(legacy_id),
            "count": len(stories),
        },
    )

    return [
        StorySummary(
            id=story.id,
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            visibility=story.visibility,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
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
            selectinload(Story.legacy_associations),
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

    # Get legacy names for response
    legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    logger.info(
        "story.detail",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
        },
    )

    return StoryDetail(
        id=story.id,
        author_id=story.author_id,
        author_name=story.author.name,
        author_email=story.author.email,
        title=story.title,
        content=story.content,
        visibility=story.visibility,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=assoc.legacy_id,
                legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                role=assoc.role,
                position=assoc.position,
            )
            for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
        ],
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
    # Load story with associations
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
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

    # Update legacy associations if provided
    if data.legacies is not None:
        # Verify user is member of at least one new legacy
        legacy_ids = [leg.legacy_id for leg in data.legacies]
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        member = member_result.scalar_one_or_none()

        if not member:
            logger.warning(
                "story.update_denied",
                extra={
                    "story_id": str(story_id),
                    "user_id": str(user_id),
                    "legacy_ids": [str(lid) for lid in legacy_ids],
                },
            )
            raise HTTPException(
                status_code=403,
                detail="Must be a member of at least one legacy",
            )

        # Delete existing associations
        await db.execute(
            select(StoryLegacy).where(StoryLegacy.story_id == story_id)
        )
        for assoc in story.legacy_associations:
            await db.delete(assoc)

        # Create new associations
        for leg_assoc in data.legacies:
            story_legacy = StoryLegacy(
                story_id=story.id,
                legacy_id=leg_assoc.legacy_id,
                role=leg_assoc.role,
                position=leg_assoc.position,
            )
            db.add(story_legacy)

    story.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(story, ["legacy_associations"])

    # Get legacy names for response
    legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    logger.info(
        "story.updated",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
        },
    )

    return StoryResponse(
        id=story.id,
        title=story.title,
        visibility=story.visibility,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=assoc.legacy_id,
                legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                role=assoc.role,
                position=assoc.position,
            )
            for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
        ],
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def delete_story(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
) -> dict[str, str]:
    """Delete a story.

    Only author or creator of ANY linked legacy can delete.

    Args:
        db: Database session
        user_id: User deleting the story
        story_id: Story ID

    Returns:
        Success message

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    # Load story with associations
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Check if user is author
    is_author = story.author_id == user_id

    # Check if user is creator of ANY linked legacy
    is_creator = False
    if not is_author:
        legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
        if legacy_ids:
            # Check if user is creator of any linked legacy
            creator_result = await db.execute(
                select(Legacy).where(
                    Legacy.id.in_(legacy_ids),
                    Legacy.created_by == user_id,
                )
            )
            creator_legacy = creator_result.scalar_one_or_none()
            is_creator = creator_legacy is not None

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
            detail="Only the author or creator of a linked legacy can delete this story",
        )

    # Delete story (associations will cascade)
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

    Union access: User can view if member of ANY linked legacy.

    Args:
        db: Database session
        user_id: Requesting user ID
        story: Story to check (must have legacy_associations loaded)

    Returns:
        True if authorized, False otherwise
    """
    # Public stories are visible to everyone
    if story.visibility == "public":
        return True

    # Personal stories are only visible to author
    if story.visibility == "personal":
        return story.author_id == user_id

    # Private stories are visible to members of ANY linked legacy (union access)
    if story.visibility == "private":
        # Get legacy IDs from story associations
        story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]

        if not story_legacy_ids:
            # Story has no legacy associations - only author can view
            return story.author_id == user_id

        # Check if user is a member of ANY linked legacy
        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(story_legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        member = result.scalar_one_or_none()
        return member is not None

    # Unknown visibility (shouldn't happen)
    return False
