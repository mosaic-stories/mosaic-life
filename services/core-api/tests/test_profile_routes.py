"""Tests for profile API routes."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_settings import ProfileSettings
from app.models.user import User


@pytest.mark.asyncio
class TestGetProfile:
    async def test_get_profile_by_username(
        self,
        client: AsyncClient,
        test_user: User,
        db_session: AsyncSession,
        auth_headers: dict,
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id, visibility_bio="public")
        db_session.add(settings)
        await db_session.commit()

        response = await client.get(
            f"/api/users/{test_user.username}", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == test_user.username
        assert data["display_name"] == test_user.name

    async def test_get_profile_unknown_username(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        response = await client.get("/api/users/nonexistent-user", headers=auth_headers)
        assert response.status_code == 404


@pytest.mark.asyncio
class TestUpdateUsername:
    async def test_change_username(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ) -> None:
        response = await client.patch(
            "/api/users/me/username",
            json={"username": "new-name-1234"},
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_reject_invalid_username(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        response = await client.patch(
            "/api/users/me/username",
            json={"username": "ab"},
            headers=auth_headers,
        )
        assert response.status_code in (400, 422)


@pytest.mark.asyncio
class TestUpdateVisibilitySettings:
    async def test_update_settings(
        self,
        client: AsyncClient,
        test_user: User,
        db_session: AsyncSession,
        auth_headers: dict,
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id)
        db_session.add(settings)
        await db_session.commit()

        response = await client.patch(
            "/api/users/me/profile/settings",
            json={"discoverable": True, "visibility_bio": "public"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["discoverable"] is True
        assert data["visibility_bio"] == "public"
