"""Tests for profile connection awareness."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import Connection
from app.models.profile_settings import ProfileSettings
from app.models.user import User
from app.services import profile_queries as profile_query_service


@pytest.mark.asyncio
class TestProfileConnectionAwareness:
    async def test_connected_user_sees_connections_tier_content(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        # Set test_user_2's bio visibility to connections-only
        settings = ProfileSettings(
            user_id=test_user_2.id,
            visibility_bio="connections",
        )
        db_session.add(settings)

        # Create connection
        user_a_id = min(test_user.id, test_user_2.id)
        user_b_id = max(test_user.id, test_user_2.id)
        conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
        db_session.add(conn)
        await db_session.commit()

        result = await profile_query_service.get_profile_by_username(
            db_session, test_user_2.username, viewer_user_id=test_user.id
        )
        assert result is not None
        assert result.visibility_context.show_bio is True

    async def test_non_connected_user_cannot_see_connections_tier(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(
            user_id=test_user_2.id,
            visibility_bio="connections",
        )
        db_session.add(settings)
        await db_session.commit()

        result = await profile_query_service.get_profile_by_username(
            db_session, test_user_2.username, viewer_user_id=test_user.id
        )
        assert result is not None
        assert result.visibility_context.show_bio is False
