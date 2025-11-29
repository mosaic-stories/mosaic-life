"""Tests for invitation API endpoints."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invitation import Invitation
from app.models.legacy import Legacy
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestSendInvitation:
    """Tests for POST /api/legacies/{id}/invitations."""

    @pytest.mark.asyncio
    async def test_send_invitation_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test successful invitation sending."""
        with patch(
            "app.services.invitation.send_invitation_email", new_callable=AsyncMock
        ) as mock_send:
            mock_send.return_value = True

            response = await client.post(
                f"/api/legacies/{test_legacy.id}/invitations",
                json={"email": "invitee@example.com", "role": "advocate"},
                headers=auth_headers,
            )

            assert response.status_code == 201
            data = response.json()
            assert data["email"] == "invitee@example.com"
            assert data["role"] == "advocate"
            assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_send_invitation_unauthorized(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test invitation without auth."""
        response = await client.post(
            f"/api/legacies/{test_legacy.id}/invitations",
            json={"email": "invitee@example.com", "role": "advocate"},
        )

        assert response.status_code == 401


class TestListInvitations:
    """Tests for GET /api/legacies/{id}/invitations."""

    @pytest.mark.asyncio
    async def test_list_invitations_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_user: User,
        db_session: AsyncSession,
    ):
        """Test listing pending invitations."""
        # Create an invitation
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="pending@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="list_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        response = await client.get(
            f"/api/legacies/{test_legacy.id}/invitations",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["email"] == "pending@example.com"


class TestRevokeInvitation:
    """Tests for DELETE /api/legacies/{id}/invitations/{id}."""

    @pytest.mark.asyncio
    async def test_revoke_invitation_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_user: User,
        db_session: AsyncSession,
    ):
        """Test revoking an invitation."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="revoke@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="revoke_api_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()
        await db_session.refresh(invitation)

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/invitations/{invitation.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204


class TestAcceptInvitation:
    """Tests for POST /api/invitations/{token}/accept."""

    @pytest.mark.asyncio
    async def test_accept_invitation_success(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user: User,
    ):
        """Test successful invitation acceptance."""
        # Create new user
        new_user = User(
            email="accepter@example.com",
            google_id="google_accepter",
            name="Accepter",
        )
        db_session.add(new_user)
        await db_session.commit()
        await db_session.refresh(new_user)

        # Create invitation for new user
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="accepter@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="accept_api_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        # Create auth headers for new user
        new_auth_headers = create_auth_headers_for_user(new_user)

        response = await client.post(
            "/api/invitations/accept_api_test_token/accept",
            headers=new_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["legacy_id"] == str(test_legacy.id)
        assert data["role"] == "advocate"


class TestGetInvitationPreview:
    """Tests for GET /api/invitations/{token}."""

    @pytest.mark.asyncio
    async def test_get_invitation_preview(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user: User,
    ):
        """Test getting invitation preview."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="preview@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="preview_test_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        response = await client.get(
            "/api/invitations/preview_test_token",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["legacy_name"] == test_legacy.name
        assert data["role"] == "advocate"
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_get_invitation_preview_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting non-existent invitation."""
        response = await client.get(
            "/api/invitations/nonexistent_token",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_invitation_preview_requires_auth(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user: User,
    ):
        """Test that preview requires authentication."""
        invitation = Invitation(
            legacy_id=test_legacy.id,
            email="noauth@example.com",
            role="advocate",
            invited_by=test_user.id,
            token="noauth_token",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db_session.add(invitation)
        await db_session.commit()

        response = await client.get("/api/invitations/noauth_token")

        assert response.status_code == 401
