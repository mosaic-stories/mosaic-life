"""Read/query services for user profiles and profile settings."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.associations import StoryLegacy
from ..models.connection import Connection
from ..models.legacy import Legacy, LegacyMember
from ..models.profile_settings import ProfileSettings, VisibilityTier
from ..models.story import Story
from ..models.user import User
from ..schemas.profile import (
    ProfileConnectionCard,
    ProfileLegacyCard,
    ProfileResponse,
    ProfileSettingsResponse,
    ProfileStoryCard,
    VisibilityContext,
)
from .connection import is_connected as check_connected
from .legacy import get_profile_image_url, get_story_counts
from .story import create_content_preview

logger = logging.getLogger(__name__)


def _build_default_profile_settings(user_id: UUID) -> ProfileSettings:
    """Create an in-memory ProfileSettings object with explicit defaults."""
    return ProfileSettings(
        user_id=user_id,
        discoverable=False,
        visibility_legacies=VisibilityTier.NOBODY.value,
        visibility_stories=VisibilityTier.NOBODY.value,
        visibility_media=VisibilityTier.NOBODY.value,
        visibility_connections=VisibilityTier.NOBODY.value,
        visibility_bio=VisibilityTier.CONNECTIONS.value,
    )


def _viewer_can_see(tier: str, is_authenticated: bool, is_connected: bool) -> bool:
    """Check if a viewer meets the visibility tier requirement."""
    if tier == VisibilityTier.PUBLIC.value:
        return True
    if tier == VisibilityTier.AUTHENTICATED.value:
        return is_authenticated
    if tier == VisibilityTier.CONNECTIONS.value:
        return is_connected
    return False


async def _get_settings_for_user(db: AsyncSession, user_id: UUID) -> ProfileSettings:
    result = await db.execute(
        select(ProfileSettings).where(ProfileSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        return _build_default_profile_settings(user_id)
    return settings


async def get_profile_settings(
    db: AsyncSession,
    user_id: UUID,
) -> ProfileSettingsResponse | None:
    """Get persisted profile settings for the current user."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        return None

    settings = await _get_settings_for_user(db, user_id)
    return ProfileSettingsResponse(
        username=user.username,
        discoverable=settings.discoverable,
        visibility_legacies=settings.visibility_legacies,
        visibility_stories=settings.visibility_stories,
        visibility_media=settings.visibility_media,
        visibility_connections=settings.visibility_connections,
        visibility_bio=settings.visibility_bio,
    )


async def get_profile_by_username(
    db: AsyncSession,
    username: str,
    viewer_user_id: UUID | None,
) -> ProfileResponse | None:
    """Get a user's profile filtered by viewer authorization."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    settings = await _get_settings_for_user(db, user.id)
    is_authenticated = viewer_user_id is not None
    is_self = viewer_user_id == user.id if viewer_user_id else False
    is_viewer_connected = is_self or (
        viewer_user_id is not None
        and await check_connected(db, viewer_user_id, user.id)
    )

    visibility_context = VisibilityContext(
        show_bio=is_self
        or _viewer_can_see(
            settings.visibility_bio, is_authenticated, is_viewer_connected
        ),
        show_legacies=is_self
        or _viewer_can_see(
            settings.visibility_legacies, is_authenticated, is_viewer_connected
        ),
        show_stories=is_self
        or _viewer_can_see(
            settings.visibility_stories, is_authenticated, is_viewer_connected
        ),
        show_media=is_self
        or _viewer_can_see(
            settings.visibility_media, is_authenticated, is_viewer_connected
        ),
        show_connections=is_self
        or _viewer_can_see(
            settings.visibility_connections, is_authenticated, is_viewer_connected
        ),
    )

    legacies = (
        await _list_profile_legacies(db, user.id)
        if visibility_context.show_legacies
        else None
    )
    stories = (
        await _list_profile_stories(db, user.id, include_non_public=is_self)
        if visibility_context.show_stories
        else None
    )
    connections = (
        await _list_profile_connections(db, user.id)
        if visibility_context.show_connections
        else None
    )

    return ProfileResponse(
        user_id=user.id,
        username=user.username,
        display_name=user.name,
        avatar_url=user.avatar_url,
        bio=user.bio if visibility_context.show_bio else None,
        legacies=legacies,
        stories=stories,
        connections=connections,
        visibility_context=visibility_context,
    )


async def _list_profile_legacies(
    db: AsyncSession, profile_user_id: UUID
) -> list[ProfileLegacyCard]:
    result = await db.execute(
        select(Legacy)
        .join(LegacyMember, LegacyMember.legacy_id == Legacy.id)
        .options(selectinload(Legacy.profile_image))
        .where(LegacyMember.user_id == profile_user_id)
        .order_by(Legacy.created_at.desc())
    )
    legacies = result.scalars().all()
    story_counts = await get_story_counts(db, [legacy.id for legacy in legacies])

    return [
        ProfileLegacyCard(
            id=legacy.id,
            name=legacy.name,
            subject_photo_url=get_profile_image_url(legacy),
            story_count=story_counts.get(legacy.id, 0),
        )
        for legacy in legacies
    ]


async def _list_profile_stories(
    db: AsyncSession,
    profile_user_id: UUID,
    *,
    include_non_public: bool,
) -> list[ProfileStoryCard]:
    stmt = (
        select(Story, Legacy.name)
        .join(
            StoryLegacy,
            (StoryLegacy.story_id == Story.id) & (StoryLegacy.position == 0),
        )
        .join(Legacy, Legacy.id == StoryLegacy.legacy_id)
        .where(
            Story.author_id == profile_user_id,
            Story.status == "published",
        )
        .order_by(Story.updated_at.desc())
    )
    if not include_non_public:
        stmt = stmt.where(Story.visibility == "public")

    result = await db.execute(stmt)
    rows = result.all()
    return [
        ProfileStoryCard(
            id=story.id,
            title=story.title,
            preview=create_content_preview(story.content),
            legacy_name=legacy_name,
        )
        for story, legacy_name in rows
    ]


async def _list_profile_connections(
    db: AsyncSession, profile_user_id: UUID
) -> list[ProfileConnectionCard]:
    result = await db.execute(
        select(Connection).where(
            or_(
                Connection.user_a_id == profile_user_id,
                Connection.user_b_id == profile_user_id,
            ),
            Connection.removed_at.is_(None),
        )
    )
    connections = result.scalars().all()
    if not connections:
        return []

    other_user_ids = [
        conn.user_b_id if conn.user_a_id == profile_user_id else conn.user_a_id
        for conn in connections
    ]
    users_result = await db.execute(select(User).where(User.id.in_(other_user_ids)))
    users_by_id = {user.id: user for user in users_result.scalars().all()}

    cards: list[ProfileConnectionCard] = []
    for other_user_id in other_user_ids:
        other_user = users_by_id.get(other_user_id)
        if other_user is None or not other_user.username:
            continue
        cards.append(
            ProfileConnectionCard(
                username=other_user.username,
                display_name=other_user.name,
                avatar_url=other_user.avatar_url,
            )
        )
    return cards
