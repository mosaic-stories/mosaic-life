"""Tests for Invitation model."""

import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invitation import Invitation
from app.models.legacy import Legacy
from app.models.user import User


class TestInvitationModel:
    """Tests for Invitation model."""

    @pytest.mark.asyncio
    async def test_create_invitation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating an invitation."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_123",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.id is not None
        assert invitation.email == "invitee@example.com"
        assert invitation.role == "advocate"
        assert invitation.accepted_at is None
        assert invitation.revoked_at is None

    @pytest.mark.asyncio
    async def test_invitation_is_pending(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation pending status check."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_456",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.is_pending is True
        assert invitation.is_expired is False

    @pytest.mark.asyncio
    async def test_invitation_is_expired(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test expired invitation."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_789",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),  # Expired
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.is_pending is False
        assert invitation.is_expired is True

    @pytest.mark.asyncio
    async def test_invitation_status_pending(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation status is pending."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_pending",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.status == "pending"

    @pytest.mark.asyncio
    async def test_invitation_status_accepted(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation status is accepted."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_accepted",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            accepted_at=datetime.now(timezone.utc),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.status == "accepted"

    @pytest.mark.asyncio
    async def test_invitation_status_revoked(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation status is revoked."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_revoked",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            revoked_at=datetime.now(timezone.utc),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.status == "revoked"

    @pytest.mark.asyncio
    async def test_invitation_status_expired(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation status is expired."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_expired",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        assert invitation.status == "expired"

    @pytest.mark.asyncio
    async def test_invitation_relationships(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation relationships."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_relationship",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        # Load relationships
        await db_session.refresh(invitation, ["legacy", "inviter"])

        assert invitation.legacy.id == test_legacy.id
        assert invitation.legacy.name == test_legacy.name
        assert invitation.inviter.id == test_user.id
        assert invitation.inviter.email == test_user.email

    @pytest.mark.asyncio
    async def test_invitation_cascade_delete_on_legacy_delete(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation is deleted when legacy is deleted."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="test_token_cascade",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        invitation_id = invitation.id

        # Delete legacy
        await db_session.delete(test_legacy)
        await db_session.commit()

        # Verify invitation is deleted
        result = await db_session.execute(
            select(Invitation).where(Invitation.id == invitation_id)
        )
        deleted_invitation = result.scalar_one_or_none()
        assert deleted_invitation is None

    @pytest.mark.asyncio
    async def test_invitation_default_role(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test invitation default role is advocate."""
        # Create invitation without explicit role
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="invitee@example.com",
            invited_by=test_user.id,
            token="test_token_default",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        # Server default should be applied after commit
        assert invitation.role == "advocate"
