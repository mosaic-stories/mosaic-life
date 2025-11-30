"""User service for user-related operations."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..schemas.user import UserSearchResult

logger = logging.getLogger(__name__)


async def search_users(
    db: AsyncSession,
    query: str,
    current_user_id: UUID,
    limit: int = 10,
) -> list[UserSearchResult]:
    """Search users by name.

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

    result = await db.execute(
        select(User)
        .where(
            User.name.ilike(search_pattern),
            User.id != current_user_id,  # Exclude current user
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
        )
        for user in users
    ]
