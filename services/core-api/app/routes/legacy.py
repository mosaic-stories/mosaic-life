"""API routes for legacy management."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.legacy import (
    LegacyCreate,
    LegacyResponse,
    LegacySearchResponse,
    LegacyUpdate,
)
from ..services import legacy as legacy_service

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
    "/{legacy_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member",
    description="Remove a member from a legacy. Only creator can remove members.",
)
async def remove_member(
    legacy_id: UUID,
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a member from a legacy.

    Only the legacy creator can remove members.
    Cannot remove the creator.
    """
    session = require_auth(request)

    await legacy_service.remove_legacy_member(
        db=db,
        remover_user_id=session.user_id,
        legacy_id=legacy_id,
        user_id=user_id,
    )
