"""Tests for connection API routes."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import Connection
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


@pytest.mark.asyncio
class TestConnectionRequestRoutes:
    async def test_create_request(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/connections/requests",
            json={
                "to_user_id": str(test_user_2.id),
                "relationship_type": "friend",
                "message": "Let's connect!",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"

    async def test_list_incoming(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        auth_headers: dict[str, str],
    ) -> None:
        # Create request from test_user to test_user_2
        await client.post(
            "/api/connections/requests",
            json={"to_user_id": str(test_user_2.id), "relationship_type": "friend"},
            headers=auth_headers,
        )

        # List incoming for test_user_2
        user2_headers = create_auth_headers_for_user(test_user_2)
        response = await client.get(
            "/api/connections/requests/incoming",
            headers=user2_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    async def test_accept_request(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        auth_headers: dict[str, str],
    ) -> None:
        create_resp = await client.post(
            "/api/connections/requests",
            json={"to_user_id": str(test_user_2.id), "relationship_type": "friend"},
            headers=auth_headers,
        )
        request_id = create_resp.json()["id"]

        user2_headers = create_auth_headers_for_user(test_user_2)
        accept_resp = await client.patch(
            f"/api/connections/requests/{request_id}/accept",
            headers=user2_headers,
        )
        assert accept_resp.status_code == 200
        data = accept_resp.json()
        assert "connected_at" in data


@pytest.mark.asyncio
class TestConnectionRoutes:
    async def test_list_connections(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
    ) -> None:
        user_a_id = min(test_user.id, test_user_2.id)
        user_b_id = max(test_user.id, test_user_2.id)
        conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
        db_session.add(conn)
        await db_session.commit()

        response = await client.get("/api/connections/list", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    async def test_remove_connection(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
    ) -> None:
        user_a_id = min(test_user.id, test_user_2.id)
        user_b_id = max(test_user.id, test_user_2.id)
        conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
        db_session.add(conn)
        await db_session.commit()
        await db_session.refresh(conn)

        response = await client.delete(
            f"/api/connections/{conn.id}", headers=auth_headers
        )
        assert response.status_code == 200
