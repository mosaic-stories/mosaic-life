"""Tests for legacy access request service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
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
        result = await service.approve_request(db_session, req.id, test_user.id)
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
            await service.approve_request(db_session, req.id, test_user_2.id)
        assert exc_info.value.status_code == 403


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
        await service.decline_request(db_session, req.id, test_user.id)

        # Can submit new request after decline
        new_req = await service.submit_request(
            db_session, test_user_2.id, test_legacy.id, "advocate"
        )
        assert new_req.status == "pending"


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
