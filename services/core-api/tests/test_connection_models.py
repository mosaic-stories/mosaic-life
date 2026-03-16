"""Tests for Connection and ConnectionRequest models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import Connection, ConnectionRequest
from app.models.user import User


@pytest.mark.asyncio
class TestConnection:
    async def test_create_connection(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        # Ensure user_a_id < user_b_id (UUID ordering)
        user_a_id = min(test_user.id, test_user_2.id)
        user_b_id = max(test_user.id, test_user_2.id)

        conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
        db_session.add(conn)
        await db_session.commit()
        await db_session.refresh(conn)

        assert conn.user_a_id == user_a_id
        assert conn.user_b_id == user_b_id
        assert conn.removed_at is None

    async def test_connection_soft_delete(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        from datetime import datetime, timezone

        user_a_id = min(test_user.id, test_user_2.id)
        user_b_id = max(test_user.id, test_user_2.id)

        conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
        db_session.add(conn)
        await db_session.commit()

        conn.removed_at = datetime.now(timezone.utc)
        await db_session.commit()
        await db_session.refresh(conn)
        assert conn.removed_at is not None


@pytest.mark.asyncio
class TestConnectionRequest:
    async def test_create_request(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = ConnectionRequest(
            from_user_id=test_user.id,
            to_user_id=test_user_2.id,
            relationship_type="friend",
            message="Let's connect!",
        )
        db_session.add(req)
        await db_session.commit()
        await db_session.refresh(req)

        assert req.status == "pending"
        assert req.relationship_type == "friend"
        assert req.message == "Let's connect!"
        assert req.resolved_at is None
