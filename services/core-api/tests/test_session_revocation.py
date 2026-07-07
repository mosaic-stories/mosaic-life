"""Regression tests for session revocation enforcement (GH #94).

Logout and "revoke this device" must actually invalidate the signed session
cookie immediately, rather than only marking the DB row while the
cryptographically-signed cookie keeps authenticating until its natural
max-age expiry.
"""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import create_session_cookie
from app.auth.models import SessionData
from app.auth.session_tokens import hash_session_token
from app.config import get_settings
from app.models.user import User
from app.models.user_session import UserSession


async def _issue_session(
    db_session: AsyncSession, user: User, device_info: str = "pytest"
) -> tuple[str, str, UserSession]:
    """Create a signed session cookie plus its backing UserSession row, mirroring login."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    session_data = SessionData(
        user_id=user.id,
        provider=user.provider,
        provider_id=user.provider_id,
        email=user.email,
        name=user.name,
        username=user.username,
        avatar_url=user.avatar_url,
        created_at=now,
        expires_at=now + timedelta(hours=24),
    )
    cookie_name, cookie_value = create_session_cookie(settings, session_data)
    session_row = UserSession(
        user_id=user.id,
        session_token=hash_session_token(cookie_value),
        device_info=device_info,
        last_active_at=now,
    )
    db_session.add(session_row)
    await db_session.commit()
    await db_session.refresh(session_row)
    return cookie_name, cookie_value, session_row


def _cookie_header(cookie_name: str, cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"{cookie_name}={cookie_value}"}


@pytest_asyncio.fixture
async def issued_session(db_session: AsyncSession, test_user: User):
    return await _issue_session(db_session, test_user)


@pytest.mark.asyncio
async def test_active_session_cookie_authenticates(
    client: AsyncClient, issued_session
) -> None:
    cookie_name, cookie_value, _ = issued_session

    response = await client.get(
        "/api/me", headers=_cookie_header(cookie_name, cookie_value)
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_revoked_session_cookie_is_rejected(
    client: AsyncClient, db_session: AsyncSession, issued_session
) -> None:
    cookie_name, cookie_value, session_row = issued_session
    session_row.revoked_at = datetime.now(timezone.utc)
    await db_session.commit()

    response = await client.get(
        "/api/me", headers=_cookie_header(cookie_name, cookie_value)
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_the_session_row(
    client: AsyncClient, db_session: AsyncSession, issued_session
) -> None:
    cookie_name, cookie_value, session_row = issued_session

    logout_response = await client.post(
        "/api/auth/logout", headers=_cookie_header(cookie_name, cookie_value)
    )
    assert logout_response.status_code == 200

    await db_session.refresh(session_row)
    assert session_row.revoked_at is not None


@pytest.mark.asyncio
async def test_replaying_cookie_after_logout_is_rejected(
    client: AsyncClient, issued_session
) -> None:
    cookie_name, cookie_value, _ = issued_session
    headers = _cookie_header(cookie_name, cookie_value)

    await client.post("/api/auth/logout", headers=headers)
    replay_response = await client.get("/api/me", headers=headers)

    assert replay_response.status_code == 401


@pytest.mark.asyncio
async def test_logout_without_session_still_succeeds(client: AsyncClient) -> None:
    response = await client.post("/api/auth/logout")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_revoking_another_session_rejects_its_cookie(
    client: AsyncClient, db_session: AsyncSession, test_user: User
) -> None:
    """The "sign out this device" UI action must kill that device's cookie."""
    current_cookie_name, current_cookie_value, _ = await _issue_session(
        db_session, test_user, device_info="current device"
    )
    other_cookie_name, other_cookie_value, other_session = await _issue_session(
        db_session, test_user, device_info="other device"
    )

    revoke_response = await client.delete(
        f"/api/users/me/sessions/{other_session.id}",
        headers=_cookie_header(current_cookie_name, current_cookie_value),
    )
    assert revoke_response.status_code == 200

    replay_response = await client.get(
        "/api/me", headers=_cookie_header(other_cookie_name, other_cookie_value)
    )
    assert replay_response.status_code == 401


@pytest.mark.asyncio
async def test_last_active_at_is_throttled_within_window(
    client: AsyncClient, db_session: AsyncSession, issued_session
) -> None:
    """last_active_at only refreshes once per throttle window, not on every request."""
    cookie_name, cookie_value, session_row = issued_session
    original_last_active = session_row.last_active_at

    response = await client.get(
        "/api/me", headers=_cookie_header(cookie_name, cookie_value)
    )
    assert response.status_code == 200

    await db_session.refresh(session_row)
    assert session_row.last_active_at == original_last_active


@pytest.mark.asyncio
async def test_cookie_without_tracked_session_row_still_authenticates(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Cookies issued before session tracking existed have no UserSession row.

    They must keep authenticating (there is nothing to have revoked) rather
    than being rejected outright.
    """
    response = await client.get("/api/me", headers=auth_headers)

    assert response.status_code == 200
