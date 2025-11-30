"""User API routes."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.user import UserSearchResult
from ..services import user as user_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search", response_model=list[UserSearchResult])
async def search_users(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=10, ge=1, le=50, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[UserSearchResult]:
    """Search users by name.

    Returns users matching the search query. The current user is excluded
    from results. Requires minimum 3 characters for search to return results.
    """
    session = require_auth(request)
    return await user_service.search_users(db, q, session.user_id, limit)
