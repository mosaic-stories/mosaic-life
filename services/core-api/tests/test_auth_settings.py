import importlib

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import GoogleUser
from app.auth.router import _find_or_create_user
from app.models.profile_settings import ProfileSettings
from app.models.user import User


def test_session_cookie_name_defaults_to_prod_value(monkeypatch):
    monkeypatch.delenv("SESSION_COOKIE_NAME", raising=False)

    from app.config import settings as settings_module

    importlib.reload(settings_module)
    settings_module.get_settings.cache_clear()

    try:
        settings = settings_module.get_settings()
        assert settings.session_cookie_name == "mosaic_session"
    finally:
        settings_module.get_settings.cache_clear()
        importlib.reload(settings_module)


def test_session_cookie_name_can_be_overridden(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_NAME", "mosaic_session_stage")

    from app.config import settings as settings_module

    importlib.reload(settings_module)
    settings_module.get_settings.cache_clear()

    try:
        settings = settings_module.get_settings()
        assert settings.session_cookie_name == "mosaic_session_stage"
    finally:
        monkeypatch.delenv("SESSION_COOKIE_NAME", raising=False)
        settings_module.get_settings.cache_clear()
        importlib.reload(settings_module)


@pytest.mark.asyncio
async def test_find_or_create_user_creates_profile_settings(
    db_session: AsyncSession,
) -> None:
    google_user = GoogleUser(
        id="google-new-user",
        email="new-user@example.com",
        name="New User",
        picture="https://example.com/new-user.jpg",
    )

    user = await _find_or_create_user(db_session, google_user)

    settings = await db_session.execute(
        select(ProfileSettings).where(ProfileSettings.user_id == user.id)
    )
    assert settings.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_find_or_create_user_retries_username_collision(
    db_session: AsyncSession, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    google_user = GoogleUser(
        id="google-collision-user",
        email="collision@example.com",
        name="Collision User",
        picture="https://example.com/collision.jpg",
    )
    candidates = iter([test_user.username, "collision-user-7777"])

    async def fake_allocate_username(db, display_name):
        return next(candidates)

    monkeypatch.setattr(
        "app.auth.router.allocate_username",
        fake_allocate_username,
    )

    user = await _find_or_create_user(db_session, google_user)

    assert user.username == "collision-user-7777"


@pytest.mark.asyncio
async def test_find_or_create_user_reraises_non_username_integrity_errors(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    google_user = GoogleUser(
        id="google-email-collision",
        email="collision@example.com",
        name="Collision User",
        picture="https://example.com/collision.jpg",
    )

    async def fake_flush() -> None:
        raise IntegrityError(
            statement="INSERT INTO users ...",
            params={},
            orig=Exception(
                'duplicate key value violates unique constraint "users_email_key"'
            ),
        )

    monkeypatch.setattr(db_session, "flush", fake_flush)

    with pytest.raises(IntegrityError):
        await _find_or_create_user(db_session, google_user)


@pytest.mark.asyncio
async def test_me_response_includes_username(
    client,
    test_user: User,
    auth_headers: dict[str, str],
) -> None:
    response = await client.get("/api/me", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["username"] == test_user.username
