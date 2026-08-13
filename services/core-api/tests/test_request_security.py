"""Tests for request-layer security hardening (GH #104, findings 12f/12g).

12f: SessionMiddleware._is_public_path used prefix matching, so any future
path sharing a prefix with a public path (e.g. "/docs-internal/...") was
unintentionally public too. Fixed by switching to exact match over a
frozenset, and by env-gating "/docs"/"/openapi.json" so they're only public
in dev. "/metrics" stays public everywhere (Prometheus scrapes it
unauthenticated in-cluster in every environment).

12g: There was no CSRF defense-in-depth beyond the session cookie's
SameSite=Lax attribute. Fixed by requiring the Origin (falling back to
Referer) header to match settings.app_url for unsafe methods on
authenticated requests.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.types import Receive, Scope, Send

from app.auth.middleware import SessionMiddleware
from app.config import Settings, get_settings
from app.database import get_db
from app.main import register_protected_docs
from tests.conftest import create_auth_headers_for_user


async def _noop_app(
    scope: Scope, receive: Receive, send: Send
) -> None:  # pragma: no cover
    raise AssertionError("app should not be invoked by these unit tests")


def _settings(env: str) -> Settings:
    """Build a standalone Settings instance for a given env.

    Non-dev environments require a real session secret + internal API token
    (see Settings._require_real_secrets_outside_dev), so supply values that
    satisfy that validator without touching the process-wide get_settings()
    cache used by the shared `app`/`client` fixture.
    """
    kwargs: dict[str, str] = {"env": env}
    if env != "dev":
        kwargs["session_secret_key"] = "unit-test-secret-key-not-the-insecure-default"
        kwargs["internal_api_token"] = "unit-test-internal-token"
    return Settings(**kwargs)


def _middleware(env: str) -> SessionMiddleware:
    return SessionMiddleware(app=_noop_app, settings=_settings(env))


# ---------------------------------------------------------------------------
# 12f: exact-match public paths
# ---------------------------------------------------------------------------


def test_path_sharing_prefix_with_public_path_requires_auth() -> None:
    """A path like "/docs-evil" must not be treated as public just because
    "/docs" is — this is the exact prefix-matching bug from finding 12f."""
    middleware = _middleware("dev")

    assert middleware._is_public_path("/docs") is True
    assert middleware._is_public_path("/docs-evil") is False
    assert middleware._is_public_path("/docs-internal/secret") is False


def test_other_public_paths_are_exact_match_only() -> None:
    middleware = _middleware("dev")

    assert middleware._is_public_path("/healthz") is True
    assert middleware._is_public_path("/healthz-internal") is False
    assert middleware._is_public_path("/api/auth/providers") is True
    assert middleware._is_public_path("/api/auth/providers-extra") is False


def test_docs_and_openapi_are_public_in_dev() -> None:
    middleware = _middleware("dev")

    assert middleware._is_public_path("/docs") is True
    assert middleware._is_public_path("/openapi.json") is True


@pytest.mark.parametrize("env", ["production", "staging", "prod"])
def test_docs_and_openapi_require_auth_outside_dev(env: str) -> None:
    middleware = _middleware(env)

    assert middleware._is_public_path("/docs") is False
    assert middleware._is_public_path("/openapi.json") is False


@pytest.mark.parametrize("env", ["dev", "production", "staging"])
def test_metrics_is_always_public(env: str) -> None:
    """Prometheus scrapes /metrics unauthenticated in-cluster in every
    environment (see the Helm chart's prometheus.io/scrape annotation) —
    it must never require a session, regardless of env."""
    middleware = _middleware(env)

    assert middleware._is_public_path("/metrics") is True


# ---------------------------------------------------------------------------
# 12f: /docs and /openapi.json actually reject unauthenticated requests
# outside dev (not just excluded from the public-path allowlist).
#
# SessionMiddleware only *records* whether a request is authenticated on
# request.state — it never rejects a request itself. Excluding a path from
# public_paths only makes SessionMiddleware run its normal cookie-validation
# logic against it; that alone does nothing unless something downstream
# actually calls require_auth(). FastAPI's built-in /docs and /openapi.json
# routes never do, so the tests above (which only check _is_public_path)
# would pass even if unauthenticated requests could still reach the real
# docs UI. These tests exercise app.main.register_protected_docs directly,
# the actual enforcement point, over real HTTP requests.
# ---------------------------------------------------------------------------


def _protected_docs_app(settings: Settings) -> FastAPI:
    # docs_url/openapi_url=None mirrors app.main's construction outside dev —
    # otherwise FastAPI's own unprotected defaults would shadow the
    # protected replacement routes registered below.
    test_app = FastAPI(docs_url=None, openapi_url=None, redoc_url=None)
    test_app.add_middleware(SessionMiddleware, settings=settings)
    register_protected_docs(test_app)
    return test_app


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
async def test_docs_and_openapi_reject_unauthenticated_requests_outside_dev(
    path: str,
) -> None:
    test_app = _protected_docs_app(_settings("production"))

    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as ac:
        response = await ac.get(path)

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
async def test_docs_and_openapi_serve_authenticated_requests_outside_dev(
    path: str, db_session, test_user
) -> None:
    # create_auth_headers_for_user signs the cookie with the real, cached
    # get_settings() (env=dev in tests) — reuse its secret key here (only
    # flipping env) so the signature validates; a fully independent
    # production Settings() would sign/verify with different keys.
    settings = get_settings().model_copy(update={"env": "production"})
    test_app = _protected_docs_app(settings)

    async def override_get_db():
        yield db_session

    test_app.dependency_overrides[get_db] = override_get_db
    headers = create_auth_headers_for_user(test_user)

    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as ac:
        response = await ac.get(path, headers=headers)

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# 12g: Origin/Referer CSRF allowlist check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mismatched_origin_on_mutating_request_is_rejected(
    client, auth_headers: dict[str, str]
) -> None:
    headers = {**auth_headers, "Origin": "http://evil.example.com"}

    response = await client.post("/api/auth/logout", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_mismatched_referer_fallback_is_rejected(
    client, auth_headers: dict[str, str]
) -> None:
    """Referer is used when Origin is absent."""
    headers = {**auth_headers, "Referer": "http://evil.example.com/some/page"}

    response = await client.post("/api/auth/logout", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_matching_origin_on_mutating_request_succeeds(
    client, auth_headers: dict[str, str]
) -> None:
    settings = get_settings()
    headers = {**auth_headers, "Origin": settings.app_url}

    response = await client.post("/api/auth/logout", headers=headers)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_missing_origin_and_referer_still_succeeds(
    client, auth_headers: dict[str, str]
) -> None:
    """Neither header present is a documented residual gap, not a rejection —
    existing authenticated mutating requests (e.g. non-browser clients, or
    browsers that omit both headers) must keep working unchanged."""
    response = await client.post("/api/auth/logout", headers=auth_headers)

    assert response.status_code == 200
