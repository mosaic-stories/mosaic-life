"""API routes for legacy management."""

import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import get_current_session, require_auth
from ..database import get_db
from ..schemas.legacy import (
    LegacyCreate,
    LegacyResponse,
    LegacySearchResponse,
    LegacyUpdate,
)
from ..services import legacy as legacy_service
from ..services import member as member_service
from pydantic import BaseModel


class RoleUpdate(BaseModel):
    """Schema for updating a member's role."""

    role: str


router = APIRouter(prefix="/api/legacies", tags=["legacies"])
logger = logging.getLogger(__name__)


@router.post(
    "/",
    response_model=LegacyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new legacy",
    description="Create a new legacy. User automatically becomes the creator.",
)
async def create_legacy(
    data: LegacyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LegacyResponse:
    """Create a new legacy.

    User automatically becomes the creator with full permissions.
    """
    session = require_auth(request)

    return await legacy_service.create_legacy(
        db=db,
        user_id=session.user_id,
        data=data,
    )


@router.get(
    "/",
    response_model=list[LegacyResponse],
    summary="List user's legacies",
    description="List all legacies where the user is a member (not pending).",
)
async def list_legacies(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[LegacyResponse]:
    """List all legacies where user is a member.

    Does not include legacies where membership is pending.
    """
    session = require_auth(request)

    return await legacy_service.list_user_legacies(
        db=db,
        user_id=session.user_id,
    )


@router.get(
    "/explore",
    response_model=list[LegacyResponse],
    summary="Explore legacies",
    description="Get legacies for exploration. Returns public legacies for unauthenticated users, or filtered results for authenticated users.",
)
async def explore_legacies(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(
        default=20, ge=1, le=100, description="Maximum number of legacies to return"
    ),
    visibility_filter: Literal["all", "public", "private"] = Query(
        default="all", description="Filter by visibility (authenticated users only)"
    ),
) -> list[LegacyResponse]:
    """Get legacies for exploration.

    Returns public legacies for unauthenticated users.
    Authenticated users can filter by visibility.
    """
    session = get_current_session(request)
    user_id = session.user_id if session else None

    return await legacy_service.explore_legacies(
        db=db,
        limit=limit,
        user_id=user_id,
        visibility_filter=visibility_filter if user_id else "public",
    )


@router.get(
    "/search",
    response_model=list[LegacySearchResponse],
    summary="Search legacies by name",
    description="Search for legacies by name (case-insensitive partial match).",
)
async def search_legacies(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    db: AsyncSession = Depends(get_db),
) -> list[LegacySearchResponse]:
    """Search legacies by name.

    Performs case-insensitive partial match on legacy name.
    Returns up to 50 results ordered by creation date.
    """
    # Auth optional for search (but required by middleware if not public)
    if request:
        require_auth(request)

    return await legacy_service.search_legacies_by_name(
        db=db,
        query=q,
    )


@router.get(
    "/{legacy_id}/public",
    response_model=LegacyResponse,
    summary="Get legacy details (public)",
    description="Get legacy details for public viewing. No authentication required.",
)
async def get_legacy_public(
    legacy_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> LegacyResponse:
    """Get legacy details for public viewing.

    Returns full legacy details including member list.
    No authentication required.
    """
    return await legacy_service.get_legacy_public(
        db=db,
        legacy_id=legacy_id,
    )


@router.get(
    "/{legacy_id}",
    response_model=LegacyResponse,
    summary="Get legacy details",
    description="Get legacy details with member list. User must be a member.",
)
async def get_legacy(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LegacyResponse:
    """Get legacy details.

    Returns full legacy details including member list.
    User must be a member (not pending) to access.
    """
    session = require_auth(request)

    return await legacy_service.get_legacy_detail(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
    )


@router.put(
    "/{legacy_id}",
    response_model=LegacyResponse,
    summary="Update legacy",
    description="Update legacy details. Only creator can update.",
)
async def update_legacy(
    legacy_id: UUID,
    data: LegacyUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LegacyResponse:
    """Update legacy details.

    Only the legacy creator can update.
    """
    session = require_auth(request)

    return await legacy_service.update_legacy(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        data=data,
    )


@router.delete(
    "/{legacy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete legacy",
    description="Delete a legacy. Only creator can delete.",
)
async def delete_legacy(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete legacy.

    Only the legacy creator can delete.
    Cascades to all members and related data.
    """
    session = require_auth(request)

    await legacy_service.delete_legacy(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
    )


@router.post(
    "/{legacy_id}/join",
    status_code=status.HTTP_201_CREATED,
    summary="Request to join legacy",
    description="Submit a request to join a legacy. Creates pending membership.",
)
async def request_join(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Request to join a legacy.

    Creates a pending membership that requires creator approval.
    """
    session = require_auth(request)

    return await legacy_service.request_join_legacy(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
    )


@router.get(
    "/{legacy_id}/members",
    summary="List legacy members",
    description="List all members of a legacy. Any member can view.",
)
async def list_members(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all members of a legacy.

    Returns members sorted by role level (creator first) then join date.
    """
    session = require_auth(request)
    return await member_service.list_members(
        db=db,
        legacy_id=legacy_id,
        requester_id=session.user_id,
    )


@router.patch(
    "/{legacy_id}/members/{user_id}",
    summary="Change member role",
    description="Change a member's role. Only creator and admin can change roles.",
)
async def change_member_role(
    legacy_id: UUID,
    user_id: UUID,
    data: RoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Change a member's role.

    Only creators and admins can change roles. Actor can only
    assign roles at or below their own level.
    """
    session = require_auth(request)
    return await member_service.change_member_role(
        db=db,
        legacy_id=legacy_id,
        target_user_id=user_id,
        new_role=data.role,
        actor_id=session.user_id,
    )


@router.post(
    "/{legacy_id}/members/{user_id}/approve",
    summary="Approve member",
    description="Approve a pending join request. Only creator can approve.",
)
async def approve_member(
    legacy_id: UUID,
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Approve a pending join request.

    Only the legacy creator can approve members.
    Changes role from 'pending' to 'member'.
    """
    session = require_auth(request)

    return await legacy_service.approve_legacy_member(
        db=db,
        approver_user_id=session.user_id,
        legacy_id=legacy_id,
        user_id=user_id,
    )


@router.delete(
    "/{legacy_id}/members/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Leave legacy",
    description="Leave a legacy voluntarily. The last creator cannot leave.",
)
async def leave_legacy(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Leave a legacy voluntarily.

    The last creator cannot leave - they must promote someone else first.
    """
    session = require_auth(request)
    await member_service.leave_legacy(
        db=db,
        legacy_id=legacy_id,
        user_id=session.user_id,
    )


@router.delete(
    "/{legacy_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member",
    description="Remove a member from a legacy. Only creator and admin can remove members.",
)
async def remove_member(
    legacy_id: UUID,
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a member from a legacy.

    Only creators and admins can remove members.
    Cannot remove the last creator.
    """
    session = require_auth(request)

    await member_service.remove_member(
        db=db,
        legacy_id=legacy_id,
        target_user_id=user_id,
        actor_id=session.user_id,
    )
