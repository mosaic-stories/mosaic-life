"""User service for user-related operations."""

import logging
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.legacy import LegacyMember
from ..models.profile_settings import ProfileSettings
from ..models.user import User
from ..schemas.user import UserSearchResult

logger = logging.getLogger(__name__)


async def search_users(
    db: AsyncSession,
    query: str,
    current_user_id: UUID,
    limit: int = 10,
) -> list[UserSearchResult]:
    """Search users by name, respecting discoverability settings.

    Args:
        db: Database session
        query: Search query (minimum 3 characters)
        current_user_id: Current user's ID (excluded from results)
        limit: Maximum number of results

    Returns:
        List of matching users
    """
    # Return empty list for queries less than 3 characters
    if len(query) < 3:
        return []

    # Case-insensitive search on name field
    search_pattern = f"%{query}%"

    # Subquery: legacies the current user is a member of
    my_legacies = (
        select(LegacyMember.legacy_id)
        .where(LegacyMember.user_id == current_user_id)
        .scalar_subquery()
    )

    # Users who share a legacy with current user
    shared_legacy_users = (
        select(LegacyMember.user_id)
        .where(LegacyMember.legacy_id.in_(my_legacies))
        .scalar_subquery()
    )

    result = await db.execute(
        select(User)
        .outerjoin(ProfileSettings, ProfileSettings.user_id == User.id)
        .where(
            User.name.ilike(search_pattern),
            User.id != current_user_id,
            or_(
                ProfileSettings.discoverable == True,  # noqa: E712
                User.id.in_(shared_legacy_users),
            ),
        )
        .order_by(User.name)
        .limit(limit)
    )
    users = result.scalars().all()

    logger.debug(
        "user.search",
        extra={
            "query": query,
            "result_count": len(users),
            "current_user_id": str(current_user_id),
        },
    )

    return [
        UserSearchResult(
            id=user.id,
            name=user.name,
            avatar_url=user.avatar_url,
            username=user.username,
        )
        for user in users
    ]
