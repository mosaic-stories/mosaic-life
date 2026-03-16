"""Tests for LegacyAccessRequest model."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy_access_request import LegacyAccessRequest
from app.models.legacy import Legacy
from app.models.user import User


@pytest.mark.asyncio
class TestLegacyAccessRequest:
    async def test_create_access_request(
        self, db_session: AsyncSession, test_user_2: User, test_legacy: Legacy
    ) -> None:
        req = LegacyAccessRequest(
            user_id=test_user_2.id,
            legacy_id=test_legacy.id,
            requested_role="advocate",
            message="I knew them well",
        )
        db_session.add(req)
        await db_session.commit()
        await db_session.refresh(req)

        assert req.status == "pending"
        assert req.requested_role == "advocate"
        assert req.message == "I knew them well"
        assert req.resolved_by is None
        assert req.resolved_at is None

    async def test_access_request_defaults(
        self, db_session: AsyncSession, test_user_2: User, test_legacy: Legacy
    ) -> None:
        req = LegacyAccessRequest(
            user_id=test_user_2.id,
            legacy_id=test_legacy.id,
            requested_role="admirer",
        )
        db_session.add(req)
        await db_session.commit()
        await db_session.refresh(req)

        assert req.status == "pending"
        assert req.message is None
        assert req.assigned_role is None
