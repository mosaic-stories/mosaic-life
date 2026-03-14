"""Tests for NeptuneGraphAdapter (AWS Neptune with openCypher)."""

from __future__ import annotations

import asyncio

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

    def test_execute_cypher_signs_the_same_body_it_sends(self, monkeypatch) -> None:
        adapter = NeptuneGraphAdapter(
            host="h",
            port=8182,
            region="us-east-1",
            iam_auth=True,
            env_prefix="prod",
        )

        captured: dict[str, str] = {}

        async def fake_sign_request(
            headers: dict[str, str], body: str
        ) -> dict[str, str]:
            captured["signed_body"] = body
            return {**headers, "Authorization": "signed"}

        class DummyResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict[str, list[dict[str, int]]]:
                return {"results": [{"n": 1}]}

        class DummyAsyncClient:
            def __init__(self, *args, **kwargs) -> None:
                return None

            async def __aenter__(self) -> "DummyAsyncClient":
                return self

            async def __aexit__(self, exc_type, exc, tb) -> None:
                return None

            async def post(
                self, url: str, content: str, headers: dict[str, str]
            ) -> DummyResponse:
                captured["sent_body"] = content
                captured["authorization"] = headers["Authorization"]
                return DummyResponse()

        monkeypatch.setattr(adapter, "_sign_request", fake_sign_request)
        monkeypatch.setattr(
            "app.adapters.neptune_graph.httpx.AsyncClient", DummyAsyncClient
        )

        result = asyncio.run(
            adapter._execute_cypher("RETURN $value AS n", {"value": 1})
        )

        assert result == [{"n": 1}]
        assert captured["signed_body"] == captured["sent_body"]
        assert captured["authorization"] == "signed"

    def test_sign_request_includes_body_in_aws_request(self, monkeypatch) -> None:
        adapter = NeptuneGraphAdapter(
            host="h",
            port=8182,
            region="us-east-1",
            iam_auth=True,
            env_prefix="prod",
        )

        captured: dict[str, object] = {}

        class FakeCredentials:
            def get_frozen_credentials(self) -> object:
                return object()

        class FakeSession:
            def get_credentials(self) -> FakeCredentials:
                return FakeCredentials()

        class FakeAWSRequest:
            def __init__(
                self, *, method: str, url: str, data: str, headers: dict[str, str]
            ) -> None:
                captured["method"] = method
                captured["url"] = url
                captured["data"] = data
                self.headers = dict(headers)

        class FakeSigV4Auth:
            def __init__(self, credentials: object, service: str, region: str) -> None:
                captured["credentials"] = credentials
                captured["service"] = service
                captured["region"] = region

            def add_auth(self, request: FakeAWSRequest) -> None:
                request.headers["Authorization"] = "signed"

        monkeypatch.setattr("botocore.session.Session", FakeSession)
        monkeypatch.setattr("botocore.awsrequest.AWSRequest", FakeAWSRequest)
        monkeypatch.setattr("botocore.auth.SigV4Auth", FakeSigV4Auth)

        headers = asyncio.run(
            adapter._sign_request(
                {"Content-Type": "application/x-www-form-urlencoded"},
                "query=RETURN 1 AS n",
            )
        )

        assert captured["method"] == "POST"
        assert captured["url"] == "https://h:8182/openCypher"
        assert captured["data"] == "query=RETURN 1 AS n"
        assert captured["service"] == "neptune-db"
        assert captured["region"] == "us-east-1"
        assert headers["Authorization"] == "signed"
