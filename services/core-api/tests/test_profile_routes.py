"""Tests for profile API routes."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import Connection
from app.models.legacy import LegacyMember
from app.models.profile_settings import ProfileSettings
from app.models.story import Story
from app.models.user import User


@pytest.mark.asyncio
class TestGetProfile:
    async def test_get_profile_by_username(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        test_legacy,
        test_story_public: Story,
        db_session: AsyncSession,
        auth_headers: dict,
    ) -> None:
        settings = ProfileSettings(
            user_id=test_user.id,
            visibility_bio="public",
            visibility_legacies="public",
            visibility_stories="public",
            visibility_connections="public",
        )
        db_session.add(settings)
        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="advocate",
            )
        )
        db_session.add(
            Connection(
                user_a_id=min(test_user.id, test_user_2.id),
                user_b_id=max(test_user.id, test_user_2.id),
            )
        )
        await db_session.commit()

        response = await client.get(
            f"/api/users/{test_user.username}", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == str(test_user.id)
        assert data["username"] == test_user.username
        assert data["display_name"] == test_user.name
        assert len(data["legacies"]) == 1
        assert len(data["stories"]) == 1
        assert data["stories"][0]["id"] == str(test_story_public.id)
        assert len(data["connections"]) == 1
        assert data["connections"][0]["username"] == test_user_2.username

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
    async def test_get_settings(
        self,
        client: AsyncClient,
        test_user: User,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id, discoverable=True)
        db_session.add(settings)
        await db_session.commit()

        response = await client.get(
            "/api/users/me/profile/settings",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == test_user.username
        assert data["discoverable"] is True

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

    async def test_update_settings_creates_missing_row(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ) -> None:
        response = await client.patch(
            "/api/users/me/profile/settings",
            json={"discoverable": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["discoverable"] is True
