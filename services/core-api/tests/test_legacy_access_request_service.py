"""Tests for legacy access request service."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from app.services import legacy_access_request as service


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
