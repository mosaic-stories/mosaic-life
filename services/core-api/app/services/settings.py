"""Service layer for user settings operations."""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.associations import MediaLegacy, StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.media import Media
from ..models.story import Story
from ..models.user import User
from ..schemas.preferences import (
    PreferencesResponse,
    PreferencesUpdateRequest,
    ProfileResponse,
    ProfileUpdateRequest,
    UserPreferences,
)
from ..schemas.stats import UserStatsResponse

logger = logging.getLogger(__name__)

# Default preferences
DEFAULT_PREFERENCES = UserPreferences()


async def get_user_preferences(db: AsyncSession, user_id: UUID) -> PreferencesResponse:
    """Get user preferences."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise ValueError(f"User {user_id} not found")

    prefs = user.preferences or {}
    defaults = DEFAULT_PREFERENCES.model_dump()

    return PreferencesResponse(
        theme=prefs.get("theme", defaults["theme"]),
        default_model=prefs.get("default_model", defaults["default_model"]),
        hidden_personas=prefs.get("hidden_personas", defaults["hidden_personas"]),
    )


async def update_user_preferences(
    db: AsyncSession, user_id: UUID, data: PreferencesUpdateRequest
) -> PreferencesResponse:
    """Update user preferences."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise ValueError(f"User {user_id} not found")

    # Merge with existing preferences
    # Create a NEW dict to ensure SQLAlchemy detects the change
    current_prefs = dict(user.preferences or {})
    updates = data.model_dump(exclude_none=True)

    for key, value in updates.items():
        current_prefs[key] = value

    # Assign the new dict to trigger SQLAlchemy change detection
    user.preferences = current_prefs
    await db.commit()
    await db.refresh(user)

    logger.info(
        "user.preferences.updated",
        extra={"user_id": str(user_id), "updated_fields": list(updates.keys())},
    )

    defaults = DEFAULT_PREFERENCES.model_dump()
    return PreferencesResponse(
        theme=current_prefs.get("theme", defaults["theme"]),
        default_model=current_prefs.get("default_model", defaults["default_model"]),
        hidden_personas=current_prefs.get(
            "hidden_personas", defaults["hidden_personas"]
        ),
    )


async def get_user_profile(db: AsyncSession, user_id: UUID) -> ProfileResponse:
    """Get user profile."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise ValueError(f"User {user_id} not found")

    return ProfileResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        created_at=user.created_at.isoformat(),
    )


async def update_user_profile(
    db: AsyncSession, user_id: UUID, data: ProfileUpdateRequest
) -> ProfileResponse:
    """Update user profile."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise ValueError(f"User {user_id} not found")

    if data.name is not None:
        user.name = data.name
    if data.bio is not None:
        user.bio = data.bio

    await db.commit()
    await db.refresh(user)

    logger.info("user.profile.updated", extra={"user_id": str(user_id)})

    return ProfileResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        created_at=user.created_at.isoformat(),
    )


async def get_user_stats(db: AsyncSession, user_id: UUID) -> UserStatsResponse:
    """Get user statistics."""
    # Get user for member_since
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise ValueError(f"User {user_id} not found")

    # Count legacies owned by user
    legacies_result = await db.execute(
        select(func.count(Legacy.id)).where(Legacy.created_by == user_id)
    )
    legacies_count = legacies_result.scalar() or 0

    # Count stories across user's legacies
    stories_result = await db.execute(
        select(func.count(Story.id.distinct()))
        .join(StoryLegacy, Story.id == StoryLegacy.story_id)
        .join(Legacy, StoryLegacy.legacy_id == Legacy.id)
        .where(Legacy.created_by == user_id)
    )
    stories_count = stories_result.scalar() or 0

    # Count media items across user's legacies
    media_result = await db.execute(
        select(func.count(Media.id.distinct()))
        .join(MediaLegacy, Media.id == MediaLegacy.media_id)
        .join(Legacy, MediaLegacy.legacy_id == Legacy.id)
        .where(Legacy.created_by == user_id)
    )
    media_count = media_result.scalar() or 0

    # Calculate storage used (sum of media file sizes)
    # Note: Media can be associated with multiple legacies, so we need distinct
    storage_result = await db.execute(
        select(func.coalesce(func.sum(Media.size_bytes.distinct()), 0))
        .join(MediaLegacy, Media.id == MediaLegacy.media_id)
        .join(Legacy, MediaLegacy.legacy_id == Legacy.id)
        .where(Legacy.created_by == user_id)
    )
    storage_used = storage_result.scalar() or 0

    # Count unique collaborators (users who are members of user's legacies)
    collaborators_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.user_id)))
        .join(Legacy, LegacyMember.legacy_id == Legacy.id)
        .where(Legacy.created_by == user_id)
        .where(LegacyMember.user_id != user_id)
    )
    collaborators_count = collaborators_result.scalar() or 0

    # TODO: Add chat_sessions_count when AI chat tracking is implemented
    # TODO: Add legacy_views_total when view tracking is implemented

    return UserStatsResponse(
        member_since=user.created_at,
        legacies_count=legacies_count,
        stories_count=stories_count,
        media_count=media_count,
        storage_used_bytes=storage_used,
        chat_sessions_count=0,  # Placeholder
        legacy_views_total=0,  # Placeholder
        collaborators_count=collaborators_count,
    )
