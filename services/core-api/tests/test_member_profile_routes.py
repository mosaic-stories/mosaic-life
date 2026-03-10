"""Tests for member profile API routes."""

import pytest
from httpx import AsyncClient

from app.models.legacy import Legacy
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


@pytest.mark.asyncio
async def test_get_profile_empty(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """GET /api/legacies/{id}/profile returns null when no profile set."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.get(
        f"/api/legacies/{test_legacy.id}/profile", headers=headers
    )
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_put_profile_creates(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT /api/legacies/{id}/profile creates a new profile."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={
            "relationship_type": "parent",
            "nickname": "Mom",
            "character_traits": ["kind", "warm"],
        },
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["relationship_type"] == "parent"
    assert data["nickname"] == "Mom"
    assert data["character_traits"] == ["kind", "warm"]


@pytest.mark.asyncio
async def test_put_profile_partial_update(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT /api/legacies/{id}/profile merges partial updates."""
    headers = create_auth_headers_for_user(test_user)
    # Create initial
    await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"relationship_type": "parent", "nickname": "Mom"},
        headers=headers,
    )
    # Partial update
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"nickname": "Mama"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["relationship_type"] == "parent"  # preserved
    assert data["nickname"] == "Mama"  # updated


@pytest.mark.asyncio
async def test_get_profile_after_update(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """GET /api/legacies/{id}/profile returns data after PUT."""
    headers = create_auth_headers_for_user(test_user)
    await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"relationship_type": "sibling", "nickname": "Bro"},
        headers=headers,
    )
    response = await client.get(
        f"/api/legacies/{test_legacy.id}/profile", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["relationship_type"] == "sibling"
    assert data["nickname"] == "Bro"


@pytest.mark.asyncio
async def test_profile_requires_auth(client: AsyncClient, test_legacy: Legacy) -> None:
    """Profile endpoints require authentication."""
    response = await client.get(f"/api/legacies/{test_legacy.id}/profile")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_profile_non_member_forbidden(
    client: AsyncClient, test_legacy: Legacy, test_user_2: User
) -> None:
    """Profile endpoints return 403 for non-members."""
    headers = create_auth_headers_for_user(test_user_2)
    response = await client.get(
        f"/api/legacies/{test_legacy.id}/profile", headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_put_profile_invalid_relationship_type(
    client: AsyncClient, test_legacy: Legacy, test_user: User
) -> None:
    """PUT rejects invalid relationship_type."""
    headers = create_auth_headers_for_user(test_user)
    response = await client.put(
        f"/api/legacies/{test_legacy.id}/profile",
        json={"relationship_type": "invalid_type"},
        headers=headers,
    )
    assert response.status_code == 422
