"""API routes for invitations."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.invitation import (
    InvitationAcceptResponse,
    InvitationCreate,
    InvitationPreview,
    InvitationResponse,
)
from ..services import invitation as invitation_service

router = APIRouter(tags=["invitations"])


# Legacy-scoped invitation routes
legacy_router = APIRouter(prefix="/api/legacies/{legacy_id}/invitations")


@legacy_router.post(
    "",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send invitation",
)
async def send_invitation(
    legacy_id: UUID,
    data: InvitationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    """Send an invitation to join a legacy.

    The inviter must be a member with sufficient permissions to invite
    at the requested role level.
    """
    session = require_auth(request)
    return await invitation_service.create_invitation(
        db=db,
        legacy_id=legacy_id,
        inviter_id=session.user_id,
        data=data,
    )


@legacy_router.get(
    "",
    response_model=list[InvitationResponse],
    summary="List pending invitations",
)
async def list_invitations(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[InvitationResponse]:
    """List pending invitations for a legacy.

    Only creators and admins can view pending invitations.
    """
    session = require_auth(request)
    return await invitation_service.list_pending_invitations(
        db=db,
        legacy_id=legacy_id,
        requester_id=session.user_id,
    )


@legacy_router.delete(
    "/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke invitation",
)
async def revoke_invitation(
    legacy_id: UUID,
    invitation_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke a pending invitation.

    Only creators and admins can revoke invitations.
    """
    session = require_auth(request)
    await invitation_service.revoke_invitation(
        db=db,
        legacy_id=legacy_id,
        invitation_id=invitation_id,
        revoker_id=session.user_id,
    )


# Token-based invitation routes (for accepting)
token_router = APIRouter(prefix="/api/invitations")


@token_router.get(
    "/{token}",
    response_model=InvitationPreview,
    summary="Get invitation preview",
)
async def get_invitation_preview(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InvitationPreview:
    """Get invitation details for preview page.

    Requires authentication to view the preview.
    """
    require_auth(request)  # Must be logged in to view
    return await invitation_service.get_invitation_by_token(db=db, token=token)


@token_router.post(
    "/{token}/accept",
    response_model=InvitationAcceptResponse,
    summary="Accept invitation",
)
async def accept_invitation(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InvitationAcceptResponse:
    """Accept an invitation and become a member."""
    session = require_auth(request)
    return await invitation_service.accept_invitation(
        db=db,
        token=token,
        user_id=session.user_id,
    )


# Combine routers
router.include_router(legacy_router)
router.include_router(token_router)
