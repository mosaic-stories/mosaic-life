"""Tests for connection notification integration."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services import connection_request as service

# Patch target: the actual function on the notification module,
# since connection_request does `from . import notification as notification_service`
_NOTIF_PATCH = "app.services.notification.create_notification"


@pytest.mark.asyncio
class TestConnectionNotifications:
    async def test_create_request_sends_notification(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        with patch(_NOTIF_PATCH, new_callable=AsyncMock) as mock_create:
            await service.create_request(
                db_session, test_user.id, test_user_2.id, "friend", "Hi!"
            )
            mock_create.assert_awaited_once()
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["user_id"] == test_user_2.id
            assert call_kwargs["notification_type"] == "connection_request_received"
            assert (
                call_kwargs["link"]
                == f"/connections?tab=requests&filter=all&focus=incoming&request={call_kwargs['resource_id']}"
            )

    async def test_accept_request_sends_notification(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        with patch(_NOTIF_PATCH, new_callable=AsyncMock) as mock_create:
            await service.accept_request(db_session, req.id, test_user_2.id)
            mock_create.assert_awaited_once()
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["user_id"] == test_user.id
            assert call_kwargs["notification_type"] == "connection_request_accepted"
            assert (
                call_kwargs["link"]
                == f"/connections?tab=my-connections&filter=all&connection={call_kwargs['resource_id']}"
            )

    async def test_decline_request_sends_notification(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        with patch(_NOTIF_PATCH, new_callable=AsyncMock) as mock_create:
            await service.decline_request(db_session, req.id, test_user_2.id)
            mock_create.assert_awaited_once()
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["user_id"] == test_user.id
            assert call_kwargs["notification_type"] == "connection_request_declined"
            assert (
                call_kwargs["link"]
                == "/connections?tab=requests&filter=all&focus=outgoing"
            )

    async def test_notification_failure_does_not_block_create(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        with patch(
            _NOTIF_PATCH,
            new_callable=AsyncMock,
            side_effect=Exception("fail"),
        ):
            result = await service.create_request(
                db_session, test_user.id, test_user_2.id, "friend"
            )
            assert result.status == "pending"

    async def test_notification_failure_does_not_block_accept(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        req = await service.create_request(
            db_session, test_user.id, test_user_2.id, "friend"
        )
        with patch(
            _NOTIF_PATCH,
            new_callable=AsyncMock,
            side_effect=Exception("fail"),
        ):
            result = await service.accept_request(db_session, req.id, test_user_2.id)
            assert result.user_id == test_user.id
