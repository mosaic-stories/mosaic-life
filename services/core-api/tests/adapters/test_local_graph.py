"""Tests for LocalGraphAdapter (TinkerPop Gremlin Server)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.adapters.local_graph import LocalGraphAdapter


class TestLocalGraphAdapterInit:
    """Test adapter initialization."""

    def test_default_config(self) -> None:
        adapter = LocalGraphAdapter(host="localhost", port=8182, env_prefix="test")
        assert adapter.host == "localhost"
        assert adapter.port == 8182
        assert adapter.env_prefix == "test"

    def test_label_prefixing(self) -> None:
        adapter = LocalGraphAdapter(host="localhost", port=8182, env_prefix="test")
        assert adapter._label("Person") == "test-Person"
        assert adapter._rel_type("FAMILY_OF") == "test-FAMILY_OF"


class TestLocalGraphAdapterHealthCheck:
    """Test health check."""

    @pytest.mark.asyncio
    async def test_health_check_success(self) -> None:
        adapter = LocalGraphAdapter(host="localhost", port=8182, env_prefix="test")
        with patch("app.adapters.local_graph.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_httpx.AsyncClient.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_httpx.AsyncClient.return_value.__aexit__ = AsyncMock(
                return_value=False
            )
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client.get.return_value = mock_response

            result = await adapter.health_check()
            assert result is True

    @pytest.mark.asyncio
    async def test_health_check_failure(self) -> None:
        adapter = LocalGraphAdapter(host="localhost", port=8182, env_prefix="test")
        with patch("app.adapters.local_graph.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_httpx.AsyncClient.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_httpx.AsyncClient.return_value.__aexit__ = AsyncMock(
                return_value=False
            )
            mock_client.get.side_effect = Exception("Connection refused")

            result = await adapter.health_check()
            assert result is False


class TestLocalGraphAdapterRelationships:
    """Test relationship query building."""

    @pytest.mark.asyncio
    async def test_upsert_relationship_uses_coalesce(self) -> None:
        adapter = LocalGraphAdapter(host="localhost", port=8182, env_prefix="test")
        adapter._execute_gremlin = AsyncMock()  # type: ignore[method-assign]

        await adapter.upsert_relationship(
            "Person",
            "from-1",
            "FAMILY_OF",
            "Person",
            "to-1",
            {"source": "declared"},
        )

        gremlin = adapter._execute_gremlin.await_args.args[0]
        assert ".coalesce(" in gremlin
        assert "test-FAMILY_OF" in gremlin
        assert ".property('source', 'declared')" in gremlin

    @pytest.mark.asyncio
    async def test_replace_relationship_drops_old_edges_before_create(self) -> None:
        adapter = LocalGraphAdapter(host="localhost", port=8182, env_prefix="test")
        adapter._execute_gremlin = AsyncMock()  # type: ignore[method-assign]

        await adapter.replace_relationship(
            "Person",
            "from-1",
            ["FAMILY_OF", "FRIENDS_WITH"],
            "Person",
            "to-1",
            new_rel_type="WORKED_WITH",
            properties={"source": "declared"},
        )

        gremlin = adapter._execute_gremlin.await_args.args[0]
        assert ".outE('test-FAMILY_OF', 'test-FRIENDS_WITH')" in gremlin
        assert ".drop().V().has('test-Person', 'id', 'from-1')" in gremlin
        assert "addE('test-WORKED_WITH')" in gremlin
