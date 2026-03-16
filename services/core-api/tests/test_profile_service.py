"""Tests for user profile service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_settings import ProfileSettings
from app.models.user import User
from app.services import profile as profile_service


@pytest.mark.asyncio
class TestGetProfileByUsername:
    async def test_returns_profile_for_public_bio(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(
            user_id=test_user.id,
            visibility_bio="public",
        )
        db_session.add(settings)
        await db_session.commit()

        result = await profile_service.get_profile_by_username(
            db_session, test_user.username, viewer_user_id=None
        )
        assert result is not None
        assert result.display_name == test_user.name
        assert result.bio == test_user.bio

    async def test_hides_bio_when_not_authorized(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(
            user_id=test_user.id,
            visibility_bio="connections",
        )
        db_session.add(settings)
        await db_session.commit()

        result = await profile_service.get_profile_by_username(
            db_session, test_user.username, viewer_user_id=None
        )
        assert result is not None
        assert result.bio is None

    async def test_returns_none_for_unknown_username(
        self, db_session: AsyncSession
    ) -> None:
        result = await profile_service.get_profile_by_username(
            db_session, "nonexistent-user", viewer_user_id=None
        )
        assert result is None


@pytest.mark.asyncio
class TestUpdateUsername:
    async def test_update_username(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        await profile_service.update_username(db_session, test_user.id, "new-username")
        await db_session.refresh(test_user)
        assert test_user.username == "new-username"

    async def test_rejects_invalid_username(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        with pytest.raises(Exception):
            await profile_service.update_username(db_session, test_user.id, "ab")

    async def test_rejects_reserved_username(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        with pytest.raises(Exception):
            await profile_service.update_username(db_session, test_user.id, "admin")


@pytest.mark.asyncio
class TestUpdateVisibilitySettings:
    async def test_update_settings(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id)
        db_session.add(settings)
        await db_session.commit()

        result = await profile_service.update_visibility_settings(
            db_session, test_user.id, discoverable=True, visibility_bio="public"
        )
        assert result.discoverable is True
        assert result.visibility_bio == "public"

    async def test_creates_missing_settings(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        result = await profile_service.update_visibility_settings(
            db_session, test_user.id, discoverable=True
        )
        assert result.discoverable is True
