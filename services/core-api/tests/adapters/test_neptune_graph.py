"""Tests for NeptuneGraphAdapter (AWS Neptune with openCypher)."""

from __future__ import annotations


from app.adapters.neptune_graph import NeptuneGraphAdapter


class TestNeptuneGraphAdapterInit:
    """Test adapter initialization."""

    def test_default_config(self) -> None:
        adapter = NeptuneGraphAdapter(
            host="neptune-cluster.example.com",
            port=8182,
            region="us-east-1",
            iam_auth=True,
            env_prefix="prod",
        )
        assert adapter.host == "neptune-cluster.example.com"
        assert adapter.port == 8182
        assert adapter.iam_auth is True
        assert adapter.env_prefix == "prod"

    def test_label_prefixing(self) -> None:
        adapter = NeptuneGraphAdapter(
            host="h",
            port=8182,
            region="us-east-1",
            iam_auth=False,
            env_prefix="staging",
        )
        assert adapter._label("Person") == "staging-Person"
        assert adapter._rel_type("FAMILY_OF") == "staging-FAMILY_OF"


class TestNeptuneOpenCypherQueryBuild:
    """Test that openCypher queries are built with correct prefixes."""

    def test_upsert_node_cypher(self) -> None:
        adapter = NeptuneGraphAdapter(
            host="h",
            port=8182,
            region="us-east-1",
            iam_auth=False,
            env_prefix="prod",
        )
        cypher, params = adapter._build_upsert_node_cypher(
            "Person", "abc-123", {"name": "Jane", "age": 42}
        )
        assert "`prod-Person`" in cypher
        assert params["node_id"] == "abc-123"
        assert params["props"]["name"] == "Jane"
