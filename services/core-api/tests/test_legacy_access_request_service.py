"""Tests for legacy access request service."""

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import Connection
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from app.services import legacy_access_request as service


async def _connect(db_session: AsyncSession, user_a: User, user_b: User) -> None:
    """Create an active connection between two users."""
    a_id = min(user_a.id, user_b.id)
    b_id = max(user_a.id, user_b.id)
    db_session.add(Connection(user_a_id=a_id, user_b_id=b_id))
    await db_session.commit()


@pytest.mark.asyncio
class TestSubmitRequest:
    async def test_submit_request(
        self, db_session: AsyncSession, test_user_2: User, test_legacy: Legacy
    ) -> None:
        result = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate", "I knew them"
        )
        assert result.status == "pending"
        assert result.requested_role == "advocate"

    async def test_already_member_rejected(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await service.submit_request(
                db_session, test_user.id, test_legacy.id, "advocate"
            )
        assert exc_info.value.status_code == 409

    async def test_duplicate_pending_rejected(
        self, db_session: AsyncSession, test_user_2: User, test_legacy: Legacy
    ) -> None:
        from fastapi import HTTPException

        await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        with pytest.raises(HTTPException) as exc_info:
            await service.submit_request(
                db_session, test_user_2.id, test_legacy.id, "advocate"
            )
        assert exc_info.value.status_code == 409

    async def test_duplicate_pending_integrity_error_returns_conflict(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        monkeypatch,
    ) -> None:
        from fastapi import HTTPException

        original_commit = db_session.commit
        calls = 0

        async def fake_commit() -> None:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise IntegrityError(
                    statement="INSERT INTO legacy_access_requests ...",
                    params={},
                    orig=Exception(
                        'duplicate key value violates unique index "uq_legacy_access_requests_pending_pair"'
                    ),
                )
            await original_commit()

        monkeypatch.setattr(db_session, "commit", fake_commit)

        with pytest.raises(HTTPException) as exc_info:
            await service.submit_request(
                db_session, test_user_2.id, test_legacy.id, "advocate"
            )
        assert exc_info.value.status_code == 409


@pytest.mark.asyncio
class TestApproveRequest:
    async def test_approve_creates_member(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ) -> None:
        req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        result = await service.approve_request(
            db_session, test_legacy.id, req.id, test_user.id
        )
        assert result.status == "approved"
        assert result.assigned_role == "advocate"

    async def test_non_admin_cannot_approve(
        self, db_session: AsyncSession, test_user_2: User, test_legacy: Legacy
    ) -> None:
        from fastapi import HTTPException

        req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        with pytest.raises(HTTPException) as exc_info:
            await service.approve_request(
                db_session, test_legacy.id, req.id, test_user_2.id
            )
        assert exc_info.value.status_code == 403

    async def test_approve_rejects_mismatched_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_legacy_2: Legacy,
    ) -> None:
        from fastapi import HTTPException

        req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        with pytest.raises(HTTPException) as exc_info:
            await service.approve_request(
                db_session, test_legacy_2.id, req.id, test_user.id
            )
        assert exc_info.value.status_code == 404

    async def test_approve_rejects_existing_member(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ) -> None:
        from fastapi import HTTPException

        req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="admirer",
            )
        )
        await db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            await service.approve_request(
                db_session, test_legacy.id, req.id, test_user.id
            )
        assert exc_info.value.status_code == 409


@pytest.mark.asyncio
class TestDeclineRequest:
    async def test_decline_request(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ) -> None:
        req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        await service.decline_request(db_session, test_legacy.id, req.id, test_user.id)

        # Can submit new request after decline
        new_req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        assert new_req.status == "pending"

    async def test_decline_rejects_mismatched_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_legacy_2: Legacy,
    ) -> None:
        from fastapi import HTTPException

        req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        with pytest.raises(HTTPException) as exc_info:
            await service.decline_request(
                db_session, test_legacy_2.id, req.id, test_user.id
            )
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
class TestListPending:
    async def test_list_pending_includes_connected_members(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_user_3: User,
        test_legacy: Legacy,
    ) -> None:
        """Connected members reported for each request are computed correctly."""
        # test_user is the creator (and thus a member) of test_legacy.
        await _connect(db_session, test_user, test_user_2)
        await _connect(db_session, test_user, test_user_3)

        await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        await service.submit_request(
            db_session, test_user_3.id, test_legacy.id, "advocate"
        )

        pending = await service.list_pending(db_session, test_legacy.id, test_user.id)

        assert len(pending) == 2
        for req in pending:
            assert req.connected_members is not None
            assert len(req.connected_members) == 1
            assert req.connected_members[0].user_id == test_user.id

    async def test_list_pending_no_connected_members_when_unconnected(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ) -> None:
        await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )

        pending = await service.list_pending(db_session, test_legacy.id, test_user.id)

        assert len(pending) == 1
        assert pending[0].connected_members is None

    async def test_list_pending_batches_connected_member_lookups(
        self,
        db_session: AsyncSession,
        db_engine,
        test_user: User,
        test_user_2: User,
        test_user_3: User,
        test_user_4: User,
        test_legacy: Legacy,
    ) -> None:
        """Query count must not scale with the number of pending requests (no N+1)."""
        for other in (test_user_2, test_user_3, test_user_4):
            await _connect(db_session, test_user, other)
            await service.submit_request(
                db_session, other.id, test_legacy.id, "advocate"
            )

        query_count = 0

        def _count(*_args: object, **_kwargs: object) -> None:
            nonlocal query_count
            query_count += 1

        event.listen(db_engine.sync_engine, "before_cursor_execute", _count)
        try:
            pending = await service.list_pending(
                db_session, test_legacy.id, test_user.id
            )
        finally:
            event.remove(db_engine.sync_engine, "before_cursor_execute", _count)

        assert len(pending) == 3
        for req in pending:
            assert req.connected_members is not None
            assert len(req.connected_members) == 1

        # Old N+1 code issued 3 extra queries per pending request (9 for 3
        # requests). A fixed, batched implementation stays well under that
        # regardless of how many requests are pending.
        assert query_count <= 8


@pytest.mark.asyncio
class TestListOutgoing:
    async def test_list_outgoing(
        self, db_session: AsyncSession, test_user_2: User, test_legacy: Legacy
    ) -> None:
        await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        outgoing = await service.list_outgoing(db_session, test_user_2.id)
        assert len(outgoing) == 1
        assert outgoing[0].legacy_name == test_legacy.name
