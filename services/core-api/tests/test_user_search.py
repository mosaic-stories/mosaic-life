"""Tests for user search with discoverability."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_settings import ProfileSettings
from app.models.user import User
from app.services import user as user_service


@pytest.mark.asyncio
class TestUserSearchDiscoverability:
    async def test_discoverable_user_appears_in_search(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=True)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(
            db_session, "Test User 2", test_user.id
        )
        assert len(results) == 1
        assert results[0].username == test_user_2.username

    async def test_non_discoverable_user_hidden_from_search(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=False)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(
            db_session, "Test User 2", test_user.id
        )
        assert len(results) == 0

    async def test_user_without_settings_hidden_from_search(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        # No ProfileSettings = not discoverable
        results = await user_service.search_users(
            db_session, "Test User 2", test_user.id
        )
        assert len(results) == 0
