"""Write/update services for user profiles and visibility settings."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.profile_settings import ProfileSettings, VisibilityTier
from ..models.user import User
from ..schemas.profile import ProfileSettingsResponse, ProfileUpdate
from .username import validate_username

logger = logging.getLogger(__name__)


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
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(ProfileSettings).where(ProfileSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = ProfileSettings(
            user_id=user_id,
            discoverable=False,
            visibility_legacies=VisibilityTier.NOBODY.value,
            visibility_stories=VisibilityTier.NOBODY.value,
            visibility_media=VisibilityTier.NOBODY.value,
            visibility_connections=VisibilityTier.NOBODY.value,
            visibility_bio=VisibilityTier.CONNECTIONS.value,
        )
        db.add(settings)

    for key, value in kwargs.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)

    return ProfileSettingsResponse(
        username=user.username,
        discoverable=settings.discoverable,
        visibility_legacies=settings.visibility_legacies,
        visibility_stories=settings.visibility_stories,
        visibility_media=settings.visibility_media,
        visibility_connections=settings.visibility_connections,
        visibility_bio=settings.visibility_bio,
    )
