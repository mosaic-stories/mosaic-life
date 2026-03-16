"""Tests for connection request service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services import connection as connection_service
from app.services import connection_request as service


@pytest.mark.asyncio
class TestCreateRequest:
    async def test_create_request(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        result = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend", "Hi!"
        )
        assert result.status == "pending"
        assert result.relationship_type == "friend"
        assert result.message == "Hi!"

    async def test_self_request_rejected(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await service.create_request(
                db_session, test_user.id, test_user.id, "friend"
            )
        assert exc_info.value.status_code == 400

    async def test_duplicate_pending_rejected(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        from fastapi import HTTPException

        await service.create_request(db_session, test_user.id, test_user_2.id, "friend")
        with pytest.raises(HTTPException) as exc_info:
            await service.create_request(
                db_session, test_user.id, test_user_2.id, "friend"
            )
        assert exc_info.value.status_code == 409


@pytest.mark.asyncio
class TestAcceptRequest:
    async def test_accept_creates_connection(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        conn = await service.accept_request(db_session, req.id, test_user_2.id)
        assert conn.user_id == test_user.id
        assert conn.display_name == test_user.name

    async def test_wrong_user_cannot_accept(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        from fastapi import HTTPException

        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        with pytest.raises(HTTPException) as exc_info:
            await service.accept_request(db_session, req.id, test_user.id)
        assert exc_info.value.status_code == 403

    async def test_accept_reactivates_removed_connection(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        first_req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        first_conn = await service.accept_request(
            db_session, first_req.id, test_user_2.id
        )
        await connection_service.remove_connection(
            db_session, first_conn.id, test_user.id
        )

        second_req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "colleague"
        )
        second_conn = await service.accept_request(
            db_session, second_req.id, test_user_2.id
        )

        assert second_conn.id == first_conn.id

        detail = await connection_service.get_relationship(
            db_session, second_conn.id, test_user.id
        )
        assert detail.relationship_type == "colleague"


@pytest.mark.asyncio
class TestDeclineRequest:
    async def test_decline_sets_cooldown(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        await service.decline_request(db_session, req.id, test_user_2.id)

        # Now trying to send again should be blocked by cooldown
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await service.create_request(
                db_session, test_user.id, test_user_2.id, "friend"
            )
        assert exc_info.value.status_code == 429


@pytest.mark.asyncio
class TestCancelRequest:
    async def test_cancel_own_request(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        await service.cancel_request(db_session, req.id, test_user.id)

        # Can send a new request after cancelling
        new_req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        assert new_req.status == "pending"


@pytest.mark.asyncio
class TestListRequests:
    async def test_list_incoming(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        await service.create_request(db_session, test_user.id, test_user_2.id, "friend")
        incoming = await service.list_incoming(db_session, test_user_2.id)
        assert len(incoming) == 1
        assert incoming[0].from_user_id == test_user.id

    async def test_list_outgoing(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        await service.create_request(db_session, test_user.id, test_user_2.id, "friend")
        outgoing = await service.list_outgoing(db_session, test_user.id)
        assert len(outgoing) == 1
        assert outgoing[0].to_user_id == test_user_2.id
