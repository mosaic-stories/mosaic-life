"""Tests for settings account/session/export routes."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_session import UserSession


class TestSettingsSessions:
    """Tests for session management endpoints."""

    @pytest.mark.asyncio
    async def test_get_sessions_registers_current_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        response = await client.get("/api/users/me/sessions", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert len(data["sessions"]) >= 1
        assert any(item["is_current"] for item in data["sessions"])

    @pytest.mark.asyncio
    async def test_revoke_other_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
    ):
        other_session = UserSession(
            user_id=test_user.id,
            session_token="other-session-token-hash",
            device_info="Other Browser",
            ip_address="127.0.0.1",
            location="Test",
            last_active_at=datetime.now(timezone.utc),
        )
        db_session.add(other_session)
        await db_session.commit()
        await db_session.refresh(other_session)

        response = await client.delete(
            f"/api/users/me/sessions/{other_session.id}", headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

        refreshed = await db_session.execute(
            select(UserSession).where(UserSession.id == other_session.id)
        )
        revoked = refreshed.scalar_one()
        assert revoked.revoked_at is not None

    @pytest.mark.asyncio
    async def test_cannot_revoke_current_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        get_response = await client.get("/api/users/me/sessions", headers=auth_headers)
        current_session = next(
            item for item in get_response.json()["sessions"] if item["is_current"]
        )

        response = await client.delete(
            f"/api/users/me/sessions/{current_session['id']}", headers=auth_headers
        )

        assert response.status_code == 400
        assert "Cannot revoke current session" in response.json()["detail"]


class TestSettingsExportAndDeletion:
    """Tests for export and account deletion endpoints."""

    @pytest.mark.asyncio
    async def test_export_request_and_download(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        response = await client.post("/api/users/me/export", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "queued"
        assert "/api/users/me/export/" in payload["download_url"]

        token = payload["download_url"].rstrip("/").split("/")[-1]
        download_response = await client.get(
            f"/api/users/me/export/{token}",
            headers=auth_headers,
        )

        assert download_response.status_code == 200
        export_data = download_response.json()
        assert export_data["user"]["email"] == test_user.email
        assert "summary" in export_data

    @pytest.mark.asyncio
    async def test_delete_account(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
    ):
        token_response = await client.post(
            "/api/users/me/delete-token", headers=auth_headers
        )
        assert token_response.status_code == 200
        token = token_response.json()["token"]

        delete_response = await client.request(
            "DELETE",
            "/api/users/me",
            headers=auth_headers,
            json={
                "confirmation_text": "DELETE",
                "confirmation_token": token,
            },
        )

        assert delete_response.status_code == 200
        assert delete_response.json()["status"] == "deleted"

        result = await db_session.execute(select(User).where(User.id == test_user.id))
        assert result.scalar_one_or_none() is None
