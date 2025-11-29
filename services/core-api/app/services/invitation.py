"""Invitation service for managing legacy member invitations."""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.invitation import Invitation
from ..models.legacy import Legacy, LegacyMember
from ..models.user import User
from ..schemas.invitation import (
    InvitationAcceptResponse,
    InvitationCreate,
    InvitationPreview,
    InvitationResponse,
)
from .email import send_invitation_email
from .legacy import can_invite_role, check_legacy_access, get_profile_image_url

logger = logging.getLogger(__name__)

INVITATION_EXPIRY_DAYS = 7


def _generate_token() -> str:
    """Generate a secure random token for invitation URLs."""
    return secrets.token_urlsafe(48)[:64]


async def create_invitation(
    db: AsyncSession,
    legacy_id: UUID,
    inviter_id: UUID,
    data: InvitationCreate,
) -> InvitationResponse:
    """Create and send an invitation.

    Args:
        db: Database session
        legacy_id: Legacy to invite to
        inviter_id: User sending the invitation
        data: Invitation details (email, role)

    Returns:
        Created invitation

    Raises:
        HTTPException: If inviter lacks permission or duplicate invitation exists
    """
    # Check inviter has access and get their role
    inviter_member = await check_legacy_access(db, inviter_id, legacy_id)

    # Check inviter can invite at this role level
    if not can_invite_role(inviter_member.role, data.role):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot invite at this role level. Your role ({inviter_member.role}) "
            f"cannot invite {data.role}s.",
        )

    # Check for existing pending invitation
    now = datetime.now(timezone.utc)
    existing = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.legacy_id == legacy_id,
                Invitation.email == data.email,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > now,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="A pending invitation already exists for this email.",
        )

    # Check if user is already a member
    existing_user = await db.execute(select(User).where(User.email == data.email))
    user = existing_user.scalar_one_or_none()
    if user:
        existing_member = await db.execute(
            select(LegacyMember).where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.user_id == user.id,
                )
            )
        )
        if existing_member.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="This person is already a member of this legacy.",
            )

    # Get legacy and inviter details for email
    legacy = await db.get(Legacy, legacy_id)
    inviter = await db.get(User, inviter_id)

    # Create invitation
    invitation = Invitation(
        legacy_id=legacy_id,
        email=data.email,
        role=data.role,
        invited_by=inviter_id,
        token=_generate_token(),
        expires_at=now + timedelta(days=INVITATION_EXPIRY_DAYS),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    # Send email (don't fail if email fails)
    if inviter is not None and legacy is not None:
        await send_invitation_email(
            to_email=data.email,
            inviter_name=inviter.name or inviter.email,
            legacy_name=legacy.name,
            role=data.role,
            token=invitation.token,
        )

    logger.info(
        "invitation.created",
        extra={
            "invitation_id": str(invitation.id),
            "legacy_id": str(legacy_id),
            "inviter_id": str(inviter_id),
            "invitee_email": data.email,
            "role": data.role,
        },
    )

    return InvitationResponse(
        id=invitation.id,
        legacy_id=invitation.legacy_id,
        email=invitation.email,
        role=invitation.role,
        invited_by=invitation.invited_by,
        inviter_name=inviter.name if inviter else None,
        inviter_email=inviter.email if inviter else None,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        revoked_at=invitation.revoked_at,
        status=invitation.status,
    )


async def get_invitation_by_token(
    db: AsyncSession,
    token: str,
) -> InvitationPreview:
    """Get invitation details for preview page.

    Args:
        db: Database session
        token: Invitation token

    Returns:
        Invitation preview with legacy details

    Raises:
        HTTPException: If invitation not found or invalid
    """
    result = await db.execute(
        select(Invitation)
        .options(
            selectinload(Invitation.legacy).selectinload(Legacy.profile_image),
            selectinload(Invitation.inviter),
        )
        .where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if invitation.accepted_at:
        raise HTTPException(
            status_code=410, detail="This invitation has already been used."
        )

    if invitation.revoked_at:
        raise HTTPException(status_code=410, detail="This invitation has been revoked.")

    if invitation.is_expired:
        raise HTTPException(status_code=410, detail="This invitation has expired.")

    legacy = invitation.legacy
    inviter = invitation.inviter

    # Get profile image URL if exists
    profile_image_url = get_profile_image_url(legacy) if legacy else None

    return InvitationPreview(
        legacy_id=legacy.id,
        legacy_name=legacy.name,
        legacy_biography=legacy.biography,
        legacy_profile_image_url=profile_image_url,
        inviter_name=inviter.name if inviter else None,
        role=invitation.role,
        expires_at=invitation.expires_at,
        status=invitation.status,
    )


async def accept_invitation(
    db: AsyncSession,
    token: str,
    user_id: UUID,
) -> InvitationAcceptResponse:
    """Accept an invitation and become a member.

    Args:
        db: Database session
        token: Invitation token
        user_id: User accepting the invitation

    Returns:
        Acceptance confirmation with legacy ID and role

    Raises:
        HTTPException: If invitation invalid or user already a member
    """
    result = await db.execute(select(Invitation).where(Invitation.token == token))
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if invitation.accepted_at:
        raise HTTPException(
            status_code=410, detail="This invitation has already been used."
        )

    if invitation.revoked_at:
        raise HTTPException(status_code=410, detail="This invitation has been revoked.")

    if invitation.is_expired:
        raise HTTPException(status_code=410, detail="This invitation has expired.")

    # Check user isn't already a member
    existing = await db.execute(
        select(LegacyMember).where(
            and_(
                LegacyMember.legacy_id == invitation.legacy_id,
                LegacyMember.user_id == user_id,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="You are already a member of this legacy.",
        )

    # Create membership
    member = LegacyMember(
        legacy_id=invitation.legacy_id,
        user_id=user_id,
        role=invitation.role,
    )
    db.add(member)

    # Mark invitation as accepted
    invitation.accepted_at = datetime.now(timezone.utc)

    await db.commit()

    logger.info(
        "invitation.accepted",
        extra={
            "invitation_id": str(invitation.id),
            "legacy_id": str(invitation.legacy_id),
            "user_id": str(user_id),
            "role": invitation.role,
        },
    )

    return InvitationAcceptResponse(
        message="Welcome! You are now a member of this legacy.",
        legacy_id=invitation.legacy_id,
        role=invitation.role,
    )


async def revoke_invitation(
    db: AsyncSession,
    legacy_id: UUID,
    invitation_id: UUID,
    revoker_id: UUID,
) -> None:
    """Revoke a pending invitation.

    Args:
        db: Database session
        legacy_id: Legacy the invitation belongs to
        invitation_id: Invitation to revoke
        revoker_id: User revoking the invitation

    Raises:
        HTTPException: If revoker lacks permission or invitation not found
    """
    # Check revoker has permission (creator or admin)
    revoker_member = await check_legacy_access(db, revoker_id, legacy_id)
    if revoker_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can revoke invitations.",
        )

    result = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.id == invitation_id,
                Invitation.legacy_id == legacy_id,
            )
        )
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    if not invitation.is_pending:
        raise HTTPException(
            status_code=400, detail="This invitation is no longer pending."
        )

    invitation.revoked_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        "invitation.revoked",
        extra={
            "invitation_id": str(invitation_id),
            "legacy_id": str(legacy_id),
            "revoker_id": str(revoker_id),
        },
    )


async def list_pending_invitations(
    db: AsyncSession,
    legacy_id: UUID,
    requester_id: UUID,
) -> list[InvitationResponse]:
    """List pending invitations for a legacy.

    Args:
        db: Database session
        legacy_id: Legacy to list invitations for
        requester_id: User requesting the list

    Returns:
        List of pending invitations

    Raises:
        HTTPException: If requester lacks permission
    """
    # Check requester has permission (creator or admin)
    requester_member = await check_legacy_access(db, requester_id, legacy_id)
    if requester_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can view pending invitations.",
        )

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.inviter))
        .where(
            and_(
                Invitation.legacy_id == legacy_id,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
                Invitation.expires_at > now,
            )
        )
        .order_by(Invitation.created_at.desc())
    )
    invitations = result.scalars().all()

    return [
        InvitationResponse(
            id=inv.id,
            legacy_id=inv.legacy_id,
            email=inv.email,
            role=inv.role,
            invited_by=inv.invited_by,
            inviter_name=inv.inviter.name if inv.inviter else None,
            inviter_email=inv.inviter.email if inv.inviter else None,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            status=inv.status,
        )
        for inv in invitations
    ]
