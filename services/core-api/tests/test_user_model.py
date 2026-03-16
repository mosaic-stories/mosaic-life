"""Tests for User model username field."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
class TestUserUsername:
    async def test_user_has_username_field(self, db_session: AsyncSession) -> None:
        user = User(
            email="username@example.com",
            google_id="google_uname_1",
            name="Jane Doe",
            username="jane-doe-a1b2",
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        assert user.username == "jane-doe-a1b2"

    async def test_username_must_be_unique(self, db_session: AsyncSession) -> None:
        user1 = User(
            email="u1@example.com",
            google_id="g1",
            name="User One",
            username="unique-name-x1y2",
        )
        user2 = User(
            email="u2@example.com",
            google_id="g2",
            name="User Two",
            username="unique-name-x1y2",
        )
        db_session.add(user1)
        await db_session.commit()
        db_session.add(user2)
        with pytest.raises(Exception):  # IntegrityError
            await db_session.commit()
