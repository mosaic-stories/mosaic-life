"""Tests for connection management service."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import Connection
from app.models.user import User
from app.services import connection as connection_service


@pytest_asyncio.fixture
async def connected_users(
    db_session: AsyncSession, test_user: User, test_user_2: User
) -> Connection:
    """Create a connection between test_user and test_user_2."""
    user_a_id = min(test_user.id, test_user_2.id)
    user_b_id = max(test_user.id, test_user_2.id)
    conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
    db_session.add(conn)
    await db_session.commit()
    await db_session.refresh(conn)
    return conn


@pytest.mark.asyncio
class TestListConnections:
    async def test_list_connections(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        result = await connection_service.list_connections(db_session, test_user.id)
        assert len(result) == 1
        assert result[0].user_id == test_user_2.id

    async def test_list_from_other_side(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        """Connection is visible from both sides."""
        result = await connection_service.list_connections(db_session, test_user_2.id)
        assert len(result) == 1
        assert result[0].user_id == test_user.id

    async def test_list_empty_when_no_connections(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        result = await connection_service.list_connections(db_session, test_user.id)
        assert len(result) == 0


@pytest.mark.asyncio
class TestRemoveConnection:
    async def test_remove_connection(
        self,
        db_session: AsyncSession,
        test_user: User,
        connected_users: Connection,
    ) -> None:
        await connection_service.remove_connection(
            db_session, connected_users.id, test_user.id
        )
        result = await connection_service.list_connections(db_session, test_user.id)
        assert len(result) == 0

    async def test_remove_nonexistent_connection_raises(
        self,
        db_session: AsyncSession,
        test_user: User,
    ) -> None:
        from uuid import uuid4

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await connection_service.remove_connection(
                db_session, uuid4(), test_user.id
            )
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
class TestConnectionRelationship:
    async def test_get_relationship_no_data(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        """Getting relationship with no data returns None fields."""
        detail = await connection_service.get_relationship(
            db_session, connected_users.id, test_user.id
        )
        assert detail.user_id == test_user_2.id
        assert detail.relationship_type is None
        assert detail.who_they_are_to_me is None

    async def test_update_and_get_relationship(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        result = await connection_service.update_relationship(
            db_session,
            connected_users.id,
            test_user.id,
            relationship_type="friend",
            who_they_are_to_me="My best friend",
            fields_set={"relationship_type", "who_they_are_to_me"},
        )
        assert result.relationship_type == "friend"
        assert result.who_they_are_to_me == "My best friend"

        detail = await connection_service.get_relationship(
            db_session, connected_users.id, test_user.id
        )
        assert detail.relationship_type == "friend"

    async def test_partial_update_preserves_existing(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        """Updating one field does not clear others."""
        await connection_service.update_relationship(
            db_session,
            connected_users.id,
            test_user.id,
            relationship_type="friend",
            who_they_are_to_me="Buddy",
            fields_set={"relationship_type", "who_they_are_to_me"},
        )

        result = await connection_service.update_relationship(
            db_session,
            connected_users.id,
            test_user.id,
            who_i_am_to_them="Pal",
            fields_set={"who_i_am_to_them"},
        )
        assert result.relationship_type == "friend"
        assert result.who_they_are_to_me == "Buddy"
        assert result.who_i_am_to_them == "Pal"


@pytest.mark.asyncio
class TestIsConnected:
    async def test_is_connected(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        assert await connection_service.is_connected(
            db_session, test_user.id, test_user_2.id
        )

    async def test_is_connected_reversed_order(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        connected_users: Connection,
    ) -> None:
        """Order of arguments should not matter."""
        assert await connection_service.is_connected(
            db_session, test_user_2.id, test_user.id
        )

    async def test_not_connected(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        assert not await connection_service.is_connected(
            db_session, test_user.id, test_user_2.id
        )
