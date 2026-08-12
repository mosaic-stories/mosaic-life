from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock

from app.auth import router as auth_router
from app.auth.models import OIDCUser
from app.config import Settings
from app.models.user_session import UserSession


def _keycloak_settings() -> Settings:
    return Settings(
        auth_provider="keycloak",
        keycloak_client_id="keycloak-client",
        keycloak_client_secret="keycloak-secret",
        keycloak_discovery_url="https://keycloak.test/realms/mosaic/.well-known/openid-configuration",
        app_url="http://app.test",
        api_url="http://api.test",
        session_secret_key="test-session-secret",
        session_cookie_secure=False,
        session_cookie_domain=None,
    )


def _params(location: str) -> dict[str, list[str]]:
    return parse_qs(urlparse(location).query)


def _clears_oauth_cookies(response) -> bool:
    set_cookie = "\n".join(response.headers.get_list("set-cookie"))
    return (
        "mosaic_oauth_state=" in set_cookie
        and "mosaic_pkce=" in set_cookie
        and "HttpOnly" in set_cookie
        and "SameSite=lax" in set_cookie
    )


def _keycloak_client() -> SimpleNamespace:
    return SimpleNamespace(
        get_authorization_endpoint=AsyncMock(
            return_value="https://keycloak.test/protocol/openid-connect/auth"
        ),
        exchange_code_for_tokens=AsyncMock(return_value={"access_token": "access"}),
        get_user_info=AsyncMock(
            return_value=OIDCUser(
                sub="keycloak-user",
                email="keycloak@example.com",
                name="Keycloak User",
                picture="https://example.com/avatar.jpg",
            )
        ),
    )


async def _start_keycloak_login(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, kc: SimpleNamespace
) -> str:
    monkeypatch.setattr(auth_router, "get_keycloak_client", lambda settings: kc)
    response = await client.get("/api/auth/keycloak")
    assert response.status_code in {302, 307}
    params = _params(response.headers["location"])
    return params["state"][0]


@pytest.mark.asyncio
async def test_login_keycloak_sets_state_pkce_cookies_and_authorize_pkce(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()

    state = await _start_keycloak_login(client, monkeypatch, kc)
    response = await client.get("/api/auth/keycloak")
    params = _params(response.headers["location"])

    assert state
    assert params["code_challenge"][0]
    assert params["code_challenge_method"] == ["S256"]
    assert "mosaic_oauth_state" in response.cookies
    assert "mosaic_pkce" in response.cookies


@pytest.mark.asyncio
async def test_callback_keycloak_succeeds_and_clears_cookies(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    state = await _start_keycloak_login(client, monkeypatch, kc)

    response = await client.get(
        f"/api/auth/keycloak/callback?code=good-code&state={state}"
    )

    assert response.status_code in {302, 307}
    assert response.headers["location"] == "http://app.test/app"
    assert _clears_oauth_cookies(response)
    assert kc.exchange_code_for_tokens.await_args.kwargs["code_verifier"] is not None


@pytest.mark.asyncio
async def test_callback_keycloak_rejects_missing_state_cookie(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    state = auth_router._create_signed_state(_keycloak_settings().session_secret_key)

    response = await client.get(
        f"/api/auth/keycloak/callback?code=good-code&state={state}"
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_callback_keycloak_rejects_mismatched_state_cookie(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    await _start_keycloak_login(client, monkeypatch, kc)
    other_state = auth_router._create_signed_state(
        _keycloak_settings().session_secret_key
    )

    response = await client.get(
        f"/api/auth/keycloak/callback?code=good-code&state={other_state}"
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_callback_keycloak_rejects_missing_pkce_cookie(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    state = await _start_keycloak_login(client, monkeypatch, kc)
    client.cookies.delete("mosaic_pkce")

    response = await client.get(
        f"/api/auth/keycloak/callback?code=good-code&state={state}"
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Missing PKCE verifier — login session expired"


@pytest.mark.asyncio
async def test_callback_keycloak_rejects_invalid_pkce_cookie(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    state = await _start_keycloak_login(client, monkeypatch, kc)
    client.cookies.set("mosaic_pkce", "tampered")

    response = await client.get(
        f"/api/auth/keycloak/callback?code=good-code&state={state}"
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid PKCE verifier"


@pytest.mark.asyncio
async def test_callback_keycloak_provider_error_clears_cookies(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    await _start_keycloak_login(client, monkeypatch, kc)

    response = await client.get("/api/auth/keycloak/callback?error=access_denied")

    assert response.status_code in {302, 307}
    assert response.headers["location"] == "http://app.test/?error=access_denied"
    assert _clears_oauth_cookies(response)


@pytest.mark.asyncio
async def test_callback_keycloak_replay_is_rejected_after_success(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    state = await _start_keycloak_login(client, monkeypatch, kc)

    first = await client.get(f"/api/auth/keycloak/callback?code=code-1&state={state}")
    second = await client.get(f"/api/auth/keycloak/callback?code=code-2&state={state}")
    count = await db_session.scalar(select(func.count()).select_from(UserSession))

    assert first.status_code in {302, 307}
    assert second.status_code == 400
    assert count == 1


@pytest.mark.asyncio
async def test_callback_keycloak_unexpected_error_redirects_and_clears_cookies(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_router, "get_settings", _keycloak_settings)
    kc = _keycloak_client()
    state = await _start_keycloak_login(client, monkeypatch, kc)

    async def fail_find_or_create_user(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(auth_router, "_find_or_create_user", fail_find_or_create_user)

    response = await client.get(
        f"/api/auth/keycloak/callback?code=good-code&state={state}"
    )

    assert response.status_code in {302, 307}
    assert (
        response.headers["location"] == "http://app.test/?error=authentication_failed"
    )
    assert _clears_oauth_cookies(response)
