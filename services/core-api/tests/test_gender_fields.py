"""Tests for gender fields on legacy and user profile."""

import pytest
from httpx import AsyncClient

from app.models.legacy import Legacy
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


@pytest.mark.asyncio
async def test_update_legacy_gender(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT /api/legacies/{id} updates gender field."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.put(
        f"/api/legacies/{test_legacy.id}",
        json={"gender": "female"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["gender"] == "female"


@pytest.mark.asyncio
async def test_clear_legacy_gender(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT /api/legacies/{id} clears gender when null is provided explicitly."""
    headers = create_auth_headers_for_user(test_user)

    set_response = await client.put(
        f"/api/legacies/{test_legacy.id}",
        json={"gender": "female"},
        headers=headers,
    )
    assert set_response.status_code == 200
    assert set_response.json()["gender"] == "female"

    clear_response = await client.put(
        f"/api/legacies/{test_legacy.id}",
        json={"gender": None},
        headers=headers,
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["gender"] is None


@pytest.mark.asyncio
async def test_update_legacy_gender_invalid(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT /api/legacies/{id} rejects invalid gender."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.put(
        f"/api/legacies/{test_legacy.id}",
        json={"gender": "invalid"},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_legacy_response_includes_gender(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """GET /api/legacies/{id} includes gender in response."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.get(
        f"/api/legacies/{test_legacy.id}",
        headers=headers,
    )
    assert response.status_code == 200
    assert "gender" in response.json()


@pytest.mark.asyncio
async def test_update_user_profile_gender(client: AsyncClient, test_user: User) -> None:
    """PATCH /api/users/me/profile updates gender field."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.patch(
        "/api/users/me/profile",
        json={"gender": "male"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["gender"] == "male"


@pytest.mark.asyncio
async def test_clear_user_profile_gender(client: AsyncClient, test_user: User) -> None:
    """PATCH /api/users/me/profile clears gender when null is provided explicitly."""
    headers = create_auth_headers_for_user(test_user)

    set_response = await client.patch(
        "/api/users/me/profile",
        json={"gender": "male"},
        headers=headers,
    )
    assert set_response.status_code == 200
    assert set_response.json()["gender"] == "male"

    clear_response = await client.patch(
        "/api/users/me/profile",
        json={"gender": None},
        headers=headers,
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["gender"] is None


@pytest.mark.asyncio
async def test_user_profile_response_includes_gender(
    client: AsyncClient, test_user: User
) -> None:
    """GET /api/users/me/profile includes gender."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.get("/api/users/me/profile", headers=headers)
    assert response.status_code == 200
    assert "gender" in response.json()
