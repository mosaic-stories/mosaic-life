"""Tests for Person API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person


@pytest.mark.asyncio
class TestMatchCandidates:
    async def test_match_candidates_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/persons/match-candidates?name=John")
        assert response.status_code == 401

    async def test_match_candidates_requires_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get(
            "/api/persons/match-candidates",
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_match_candidates_returns_results(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
    ):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        response = await client.get(
            "/api/persons/match-candidates?name=John+Smith",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "candidates" in data
        assert isinstance(data["candidates"], list)

    async def test_match_candidates_empty_for_no_match(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        response = await client.get(
            "/api/persons/match-candidates?name=ZzzNoMatchXxx",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["candidates"] == []
