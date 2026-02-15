"""Service layer for user settings operations."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.ai import AIConversation

from ..models.associations import MediaLegacy, StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.media import Media
from ..models.notification import Notification
from ..models.story import Story
from ..models.support_request import SupportRequest
from ..models.user import User
from ..models.user_session import UserSession
from ..schemas.account import DeleteAccountRequest
from ..schemas.preferences import (
    PreferencesResponse,
    PreferencesUpdateRequest,
    ProfileResponse,
    ProfileUpdateRequest,
    UserPreferences,
)
from ..schemas.session import SessionListResponse, SessionResponse
from ..schemas.stats import UserStatsResponse
from .email import send_data_export_email

logger = logging.getLogger(__name__)

# Default preferences
DEFAULT_PREFERENCES = UserPreferences()

DELETE_TOKEN_MAX_AGE_SECONDS = 600
EXPORT_TOKEN_MAX_AGE_SECONDS = 3600


def _get_serializer(salt: str) -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(settings.session_secret_key, salt=salt)


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


async def upsert_user_session(
    db: AsyncSession,
    user_id: UUID,
    session_token_hash: str,
    device_info: str | None,
    ip_address: str | None,
) -> None:
    """Ensure a live user session exists for the provided token hash."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.session_token == session_token_hash,
        )
    )
    existing_session = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if existing_session:
        if existing_session.revoked_at is not None:
            existing_session.revoked_at = None
        existing_session.last_active_at = now
        if device_info:
            existing_session.device_info = device_info
        if ip_address:
            existing_session.ip_address = ip_address
        await db.commit()
        return

    session = UserSession(
        user_id=user_id,
        session_token=session_token_hash,
        device_info=device_info,
        ip_address=ip_address,
        location=None,
        last_active_at=now,
    )
    db.add(session)
    await db.commit()


async def get_user_sessions(
    db: AsyncSession,
    user_id: UUID,
    current_session_token_hash: str | None,
) -> SessionListResponse:
    """Get active sessions for a user."""
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
        .order_by(UserSession.last_active_at.desc())
    )
    sessions = list(result.scalars().all())

    session_items = [
        SessionResponse(
            id=session.id,
            device_info=session.device_info,
            location=session.location,
            last_active_at=session.last_active_at,
            created_at=session.created_at,
            is_current=(
                current_session_token_hash is not None
                and session.session_token == current_session_token_hash
            ),
        )
        for session in sessions
    ]

    return SessionListResponse(sessions=session_items)


async def revoke_user_session(
    db: AsyncSession,
    user_id: UUID,
    session_id: UUID,
    current_session_token_hash: str | None,
) -> None:
    """Revoke a non-current active session."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError("Session not found")

    if (
        current_session_token_hash is not None
        and session.session_token == current_session_token_hash
    ):
        raise PermissionError("Cannot revoke current session")

    session.revoked_at = datetime.now(timezone.utc)
    await db.commit()


def create_account_deletion_token(user_id: UUID) -> tuple[str, datetime]:
    """Create short-lived account deletion confirmation token."""
    serializer = _get_serializer("account-delete")
    token = serializer.dumps({"user_id": str(user_id)})
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=DELETE_TOKEN_MAX_AGE_SECONDS
    )
    return token, expires_at


async def delete_user_account(
    db: AsyncSession,
    user_id: UUID,
    request: DeleteAccountRequest,
) -> None:
    """Delete current user account after token and confirmation validation."""
    if request.confirmation_text.strip().upper() != "DELETE":
        raise ValueError("Invalid confirmation text")

    serializer = _get_serializer("account-delete")
    try:
        payload = serializer.loads(
            request.confirmation_token,
            max_age=DELETE_TOKEN_MAX_AGE_SECONDS,
        )
    except SignatureExpired as exc:
        raise ValueError("Confirmation token expired") from exc
    except BadSignature as exc:
        raise ValueError("Invalid confirmation token") from exc

    if payload.get("user_id") != str(user_id):
        raise ValueError("Invalid confirmation token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    await db.delete(user)
    await db.commit()


def _create_export_token(user_id: UUID) -> tuple[str, datetime]:
    serializer = _get_serializer("user-export")
    token = serializer.dumps({"user_id": str(user_id)})
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=EXPORT_TOKEN_MAX_AGE_SECONDS
    )
    return token, expires_at


def _validate_export_token(user_id: UUID, token: str) -> None:
    serializer = _get_serializer("user-export")
    try:
        payload = serializer.loads(token, max_age=EXPORT_TOKEN_MAX_AGE_SECONDS)
    except SignatureExpired as exc:
        raise ValueError("Export token expired") from exc
    except BadSignature as exc:
        raise ValueError("Invalid export token") from exc

    if payload.get("user_id") != str(user_id):
        raise ValueError("Invalid export token")


async def request_user_data_export(
    db: AsyncSession,
    user_id: UUID,
) -> tuple[str, datetime]:
    """Create a user export token and email a download link."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError(f"User {user_id} not found")

    token, expires_at = _create_export_token(user_id)
    settings = get_settings()
    download_url = f"{settings.api_url}/api/users/me/export/{token}"

    await send_data_export_email(
        to_email=user.email,
        download_url=download_url,
        expires_at=expires_at,
    )

    logger.info(
        "user.export.requested",
        extra={"user_id": str(user_id), "expires_at": expires_at.isoformat()},
    )

    return download_url, expires_at


async def get_user_data_export(
    db: AsyncSession,
    user_id: UUID,
    token: str,
) -> dict[str, Any]:
    """Build account export payload after validating export token."""
    _validate_export_token(user_id, token)

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    legacies_result = await db.execute(
        select(Legacy).where(Legacy.created_by == user_id)
    )
    legacies = list(legacies_result.scalars().all())

    stories_result = await db.execute(select(Story).where(Story.author_id == user_id))
    stories = list(stories_result.scalars().all())

    media_result = await db.execute(select(Media).where(Media.owner_id == user_id))
    media_items = list(media_result.scalars().all())

    support_result = await db.execute(
        select(SupportRequest).where(SupportRequest.user_id == user_id)
    )
    support_requests = list(support_result.scalars().all())

    notifications_result = await db.execute(
        select(Notification).where(Notification.user_id == user_id)
    )
    notifications = list(notifications_result.scalars().all())

    conversations_result = await db.execute(
        select(AIConversation).where(AIConversation.user_id == user_id)
    )
    conversations = list(conversations_result.scalars().all())

    story_assoc_result = await db.execute(
        select(StoryLegacy.story_id, StoryLegacy.legacy_id, StoryLegacy.role).where(
            StoryLegacy.story_id.in_([story.id for story in stories])
        )
    )
    story_associations = [
        {
            "story_id": str(story_id),
            "legacy_id": str(legacy_id),
            "role": role,
        }
        for story_id, legacy_id, role in story_assoc_result.fetchall()
    ]

    media_assoc_result = await db.execute(
        select(MediaLegacy.media_id, MediaLegacy.legacy_id, MediaLegacy.role).where(
            MediaLegacy.media_id.in_([item.id for item in media_items])
        )
    )
    media_associations = [
        {
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "role": role,
        }
        for media_id, legacy_id, role in media_assoc_result.fetchall()
    ]

    membership_result = await db.execute(
        select(LegacyMember).where(LegacyMember.user_id == user_id)
    )
    memberships = list(membership_result.scalars().all())

    export_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "bio": user.bio,
            "preferences": user.preferences or {},
            "created_at": user.created_at.isoformat(),
        },
        "summary": {
            "legacies_count": len(legacies),
            "stories_count": len(stories),
            "media_count": len(media_items),
            "memberships_count": len(memberships),
            "support_requests_count": len(support_requests),
            "notifications_count": len(notifications),
            "conversations_count": len(conversations),
        },
        "legacies": [
            {
                "id": str(legacy.id),
                "name": legacy.name,
                "birth_date": legacy.birth_date.isoformat()
                if legacy.birth_date
                else None,
                "death_date": legacy.death_date.isoformat()
                if legacy.death_date
                else None,
                "biography": legacy.biography,
                "visibility": legacy.visibility,
                "created_at": legacy.created_at.isoformat(),
            }
            for legacy in legacies
        ],
        "stories": [
            {
                "id": str(story.id),
                "title": story.title,
                "content": story.content,
                "visibility": story.visibility,
                "created_at": story.created_at.isoformat(),
                "updated_at": story.updated_at.isoformat(),
            }
            for story in stories
        ],
        "story_associations": story_associations,
        "media": [
            {
                "id": str(item.id),
                "filename": item.filename,
                "content_type": item.content_type,
                "size_bytes": item.size_bytes,
                "storage_path": item.storage_path,
                "created_at": item.created_at.isoformat(),
            }
            for item in media_items
        ],
        "media_associations": media_associations,
        "memberships": [
            {
                "legacy_id": str(member.legacy_id),
                "role": member.role,
                "joined_at": member.joined_at.isoformat(),
            }
            for member in memberships
        ],
        "support_requests": [
            {
                "id": str(item.id),
                "category": item.category,
                "subject": item.subject,
                "message": item.message,
                "context": item.context,
                "status": item.status,
                "created_at": item.created_at.isoformat(),
            }
            for item in support_requests
        ],
        "notifications": [
            {
                "id": str(item.id),
                "type": item.type,
                "title": item.title,
                "message": item.message,
                "status": item.status,
                "created_at": item.created_at.isoformat(),
            }
            for item in notifications
        ],
        "ai_conversations": [
            {
                "id": str(item.id),
                "persona_id": item.persona_id,
                "title": item.title,
                "created_at": item.created_at.isoformat(),
                "updated_at": item.updated_at.isoformat(),
            }
            for item in conversations
        ],
    }

    return export_data
