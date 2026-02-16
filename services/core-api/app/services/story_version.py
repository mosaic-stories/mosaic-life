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


async def get_active_version(db: AsyncSession, story_id: UUID) -> StoryVersion | None:
    """Get the active version for a story, or None."""
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def get_draft_version(db: AsyncSession, story_id: UUID) -> StoryVersion | None:
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

    summaries = [StoryVersionSummary.model_validate(v) for v in versions]

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


async def get_version_detail(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
) -> StoryVersionDetail:
    """Get full detail for a specific version.

    Raises:
        HTTPException: 404 if version not found.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return StoryVersionDetail.model_validate(version)


async def delete_version(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
) -> None:
    """Delete a version. Active versions cannot be deleted.

    Raises:
        HTTPException: 404 if not found, 409 if active.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    if version.status == "active":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the active version. Activate another version first.",
        )

    await db.delete(version)
    await db.flush()

    logger.info(
        "version.deleted",
        extra={
            "story_id": str(story_id),
            "version_number": version_number,
            "status": version.status,
        },
    )


async def bulk_delete_versions(
    db: AsyncSession,
    story_id: UUID,
    version_numbers: list[int],
) -> int:
    """Bulk delete versions. Rejects entire request if any version is active.

    Raises:
        HTTPException: 409 if any version is active, 404 if any not found.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number.in_(version_numbers),
        )
    )
    versions = result.scalars().all()

    found_numbers = {v.version_number for v in versions}
    missing = set(version_numbers) - found_numbers
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Versions not found: {sorted(missing)}",
        )

    active_versions = [v for v in versions if v.status == "active"]
    if active_versions:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete active versions. Activate another version first.",
        )

    for version in versions:
        await db.delete(version)
    await db.flush()

    logger.info(
        "version.bulk_deleted",
        extra={
            "story_id": str(story_id),
            "version_numbers": version_numbers,
            "count": len(versions),
        },
    )

    return len(versions)


async def restore_version(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
    user_id: UUID,
) -> StoryVersionDetail:
    """Restore an old version by creating a new active version with its content.

    This creates a new version (append-only history), deactivates the current
    active version, and updates the story's title/content.

    Raises:
        HTTPException: 404 if source version not found.
    """
    # Find the version to restore from
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Version not found")

    # Deactivate current active version
    current_active = await get_active_version(db, story_id)
    if current_active:
        current_active.status = "inactive"

    # Create new version from source content
    next_num = await get_next_version_number(db, story_id)
    new_version = StoryVersion(
        story_id=story_id,
        version_number=next_num,
        title=source.title,
        content=source.content,
        status="active",
        source="restoration",
        source_version=version_number,
        change_summary=f"Restored from version {version_number}",
        created_by=user_id,
    )
    db.add(new_version)
    await db.flush()

    # Update story to reflect restored content
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()
    story.title = source.title
    story.content = source.content
    story.active_version_id = new_version.id

    await db.flush()

    logger.info(
        "version.restored",
        extra={
            "story_id": str(story_id),
            "source_version": version_number,
            "new_version": next_num,
        },
    )

    return StoryVersionDetail.model_validate(new_version)


async def approve_draft(
    db: AsyncSession,
    story_id: UUID,
) -> StoryVersionDetail:
    """Approve the current draft, promoting it to active.

    Deactivates the current active version, promotes draft, and updates
    the story's title/content.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    # Deactivate current active
    current_active = await get_active_version(db, story_id)
    if current_active:
        current_active.status = "inactive"

    # Promote draft
    draft.status = "active"
    draft.stale = False

    # Update story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()
    story.title = draft.title
    story.content = draft.content
    story.active_version_id = draft.id

    await db.flush()

    logger.info(
        "version.draft_approved",
        extra={
            "story_id": str(story_id),
            "version_number": draft.version_number,
        },
    )

    return StoryVersionDetail.model_validate(draft)


async def discard_draft(
    db: AsyncSession,
    story_id: UUID,
) -> None:
    """Discard (hard-delete) the current draft.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    await db.delete(draft)
    await db.flush()

    logger.info(
        "version.draft_discarded",
        extra={
            "story_id": str(story_id),
            "version_number": draft.version_number,
        },
    )


async def create_version(
    db: AsyncSession,
    story: Story,
    title: str,
    content: str,
    source: str,
    user_id: UUID,
    change_summary: str | None = None,
    source_version: int | None = None,
) -> StoryVersion:
    """Create a new active version for a story.

    Handles: deactivating previous active, marking draft stale,
    updating story fields, and setting active_version_id.
    """
    # Deactivate current active version
    current_active = await get_active_version(db, story.id)
    if current_active:
        current_active.status = "inactive"

    # Mark any existing draft as stale
    draft = await get_draft_version(db, story.id)
    if draft:
        draft.stale = True

    # Create new version
    next_num = await get_next_version_number(db, story.id)
    version = StoryVersion(
        story_id=story.id,
        version_number=next_num,
        title=title,
        content=content,
        status="active",
        source=source,
        source_version=source_version,
        change_summary=change_summary,
        created_by=user_id,
    )
    db.add(version)
    await db.flush()

    # Update story fields
    story.title = title
    story.content = content
    story.active_version_id = version.id

    await db.flush()

    logger.info(
        "version.created",
        extra={
            "story_id": str(story.id),
            "version_number": next_num,
            "source": source,
        },
    )

    return version
