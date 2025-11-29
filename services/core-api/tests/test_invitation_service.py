"""Tests for invitation service."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invitation import Invitation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from app.schemas.invitation import InvitationCreate
from app.services.invitation import (
    accept_invitation,
    create_invitation,
    get_invitation_by_token,
    list_pending_invitations,
    revoke_invitation,
)


class TestCreateInvitation:
    """Tests for creating invitations."""

    @pytest.mark.asyncio
    async def test_create_invitation_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful invitation creation."""
        with patch(
            "app.services.invitation.send_invitation_email", new_callable=AsyncMock
        ) as mock_send:
            mock_send.return_value = True

            invitation = await create_invitation(
                db=db_session,
                legacy_id=test_legacy.id,
                inviter_id=test_user.id,
                data=InvitationCreate(email="invitee@example.com", role="advocate"),
            )

            assert invitation.email == "invitee@example.com"
            assert invitation.role == "advocate"
            assert invitation.invited_by == test_user.id
            assert invitation.legacy_id == test_legacy.id
            assert invitation.status == "pending"
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_invitation_invalid_role_for_inviter(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that advocate cannot invite admin."""
        from sqlalchemy import select

        # Change test_user's role to advocate
        result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == test_legacy.id,
                LegacyMember.user_id == test_user.id,
            )
        )
        member = result.scalar_one()
        member.role = "advocate"
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await create_invitation(
                db=db_session,
                legacy_id=test_legacy.id,
                inviter_id=test_user.id,
                data=InvitationCreate(email="invitee@example.com", role="admin"),
            )

        assert exc.value.status_code == 403
        assert "Cannot invite at this role level" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_create_invitation_duplicate_pending(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that duplicate pending invitation is rejected."""
        with patch(
            "app.services.invitation.send_invitation_email", new_callable=AsyncMock
        ) as mock_send:
            mock_send.return_value = True

            # First invitation
            await create_invitation(
                db=db_session,
                legacy_id=test_legacy.id,
                inviter_id=test_user.id,
                data=InvitationCreate(email="invitee@example.com", role="advocate"),
            )

            # Duplicate
            with pytest.raises(HTTPException) as exc:
                await create_invitation(
                    db=db_session,
                    legacy_id=test_legacy.id,
                    inviter_id=test_user.id,
                    data=InvitationCreate(email="invitee@example.com", role="advocate"),
                )

            assert exc.value.status_code == 400
            assert "pending invitation" in str(exc.value.detail).lower()


class TestAcceptInvitation:
    """Tests for accepting invitations."""

    @pytest.mark.asyncio
    async def test_accept_invitation_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful invitation acceptance."""
        from sqlalchemy import select

        # Create invitation for a different email (simulating new user)
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="newuser@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="accept_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        # Create new user to accept
        new_user = User(
            email="newuser@example.com",
            google_id="google_new",
            name="New User",
        )
        db_session.add(new_user)
        await db_session.commit()
        await db_session.refresh(new_user)

        result = await accept_invitation(
            db=db_session,
            token="accept_test_token",
            user_id=new_user.id,
        )

        assert result.legacy_id == test_legacy.id
        assert result.role == "advocate"

        # Verify membership was created
        member_result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == test_legacy.id,
                LegacyMember.user_id == new_user.id,
            )
        )
        member = member_result.scalar_one_or_none()
        assert member is not None
        assert member.role == "advocate"

    @pytest.mark.asyncio
    async def test_accept_invitation_expired(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that expired invitation cannot be accepted."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="expired@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="expired_token",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),  # Expired
        )
        db_session.add(invitation)
        await db_session.commit()

        new_user = User(
            email="expired@example.com",
            google_id="google_expired",
            name="Expired User",
        )
        db_session.add(new_user)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await accept_invitation(
                db=db_session,
                token="expired_token",
                user_id=new_user.id,
            )

        assert exc.value.status_code == 410
        assert "expired" in str(exc.value.detail).lower()


class TestGetInvitationByToken:
    """Tests for getting invitation by token."""

    @pytest.mark.asyncio
    async def test_get_invitation_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful invitation retrieval."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="preview@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="preview_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        preview = await get_invitation_by_token(
            db=db_session,
            token="preview_token",
        )

        assert preview.legacy_id == test_legacy.id
        assert preview.legacy_name == test_legacy.name
        assert preview.role == "advocate"
        assert preview.status == "pending"

    @pytest.mark.asyncio
    async def test_get_invitation_not_found(
        self,
        db_session: AsyncSession,
    ):
        """Test invitation not found."""
        with pytest.raises(HTTPException) as exc:
            await get_invitation_by_token(
                db=db_session,
                token="nonexistent_token",
            )

        assert exc.value.status_code == 404


class TestRevokeInvitation:
    """Tests for revoking invitations."""

    @pytest.mark.asyncio
    async def test_revoke_invitation_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful invitation revocation."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="revoke@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="revoke_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        await revoke_invitation(
            db=db_session,
            legacy_id=test_legacy.id,
            invitation_id=invitation.id,
            revoker_id=test_user.id,
        )

        await db_session.refresh(invitation)
        assert invitation.revoked_at is not None
        assert invitation.status == "revoked"


class TestListPendingInvitations:
    """Tests for listing pending invitations."""

    @pytest.mark.asyncio
    async def test_list_pending_invitations_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful listing of pending invitations."""
        # Create multiple invitations
        for i in range(3):
            invitation = Invitation(
                legacy_id=test_legacy.id,
                email=f"invite{i}@example.com",
                role="advocate",
                invited_by=test_user.id,
                token=f"list_token_{i}",
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )
            db_session.add(invitation)
        await db_session.commit()

        invitations = await list_pending_invitations(
            db=db_session,
            legacy_id=test_legacy.id,
            requester_id=test_user.id,
        )

        assert len(invitations) == 3
        for inv in invitations:
            assert inv.status == "pending"
