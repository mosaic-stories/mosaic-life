"""Service for user profiles and visibility settings."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.profile_settings import ProfileSettings, VisibilityTier
from ..models.user import User
from ..schemas.profile import (
    ProfileResponse,
    ProfileSettingsResponse,
    ProfileUpdate,
    VisibilityContext,
)
from .username import validate_username

logger = logging.getLogger(__name__)


def _viewer_can_see(tier: str, is_authenticated: bool, is_connected: bool) -> bool:
    """Check if a viewer meets the visibility tier requirement."""
    if tier == VisibilityTier.PUBLIC.value:
        return True
    if tier == VisibilityTier.AUTHENTICATED.value:
        return is_authenticated
    if tier == VisibilityTier.CONNECTIONS.value:
        return is_connected
    return False  # NOBODY


async def get_profile_by_username(
    db: AsyncSession,
    username: str,
    viewer_user_id: UUID | None,
) -> ProfileResponse | None:
    """Get a user's profile filtered by viewer's authorization level."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    settings_result = await db.execute(
        select(ProfileSettings).where(ProfileSettings.user_id == user.id)
    )
    settings = settings_result.scalar_one_or_none()

    if settings is None:
        return ProfileResponse(
            username=user.username,
            display_name=user.name,
            avatar_url=user.avatar_url,
            visibility_context=VisibilityContext(),
        )

    is_authenticated = viewer_user_id is not None
    is_self = viewer_user_id == user.id if viewer_user_id else False
    # TODO: check actual connection status in Phase 2
    is_connected = is_self

    ctx = VisibilityContext(
        show_bio=is_self
        or _viewer_can_see(settings.visibility_bio, is_authenticated, is_connected),
        show_legacies=is_self
        or _viewer_can_see(
            settings.visibility_legacies, is_authenticated, is_connected
        ),
        show_stories=is_self
        or _viewer_can_see(settings.visibility_stories, is_authenticated, is_connected),
        show_media=is_self
        or _viewer_can_see(settings.visibility_media, is_authenticated, is_connected),
        show_connections=is_self
        or _viewer_can_see(
            settings.visibility_connections, is_authenticated, is_connected
        ),
    )

    return ProfileResponse(
        username=user.username,
        display_name=user.name,
        avatar_url=user.avatar_url,
        bio=user.bio if ctx.show_bio else None,
        visibility_context=ctx,
    )


async def update_username(db: AsyncSession, user_id: UUID, new_username: str) -> None:
    """Change a user's username."""
    error = validate_username(new_username)
    if error:
        raise HTTPException(status_code=400, detail=error)

    existing = await db.execute(select(User).where(User.username == new_username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Username is already taken")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.username = new_username
    await db.commit()

    logger.info(
        "profile.username_changed",
        extra={"user_id": str(user_id), "new_username": new_username},
    )


async def update_profile(db: AsyncSession, user_id: UUID, data: ProfileUpdate) -> User:
    """Update user profile fields (name, bio, avatar)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if data.name is not None:
        user.name = data.name
    if data.bio is not None:
        user.bio = data.bio
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url

    await db.commit()
    await db.refresh(user)
    return user


async def update_visibility_settings(
    db: AsyncSession,
    user_id: UUID,
    **kwargs: bool | str | None,
) -> ProfileSettingsResponse:
    """Update profile visibility settings."""
    result = await db.execute(
        select(ProfileSettings).where(ProfileSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        raise HTTPException(status_code=404, detail="Profile settings not found")

    for key, value in kwargs.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)

    return ProfileSettingsResponse(
        discoverable=settings.discoverable,
        visibility_legacies=settings.visibility_legacies,
        visibility_stories=settings.visibility_stories,
        visibility_media=settings.visibility_media,
        visibility_connections=settings.visibility_connections,
        visibility_bio=settings.visibility_bio,
    )
