# Graph-Augmented RAG Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance AI persona conversations by combining pgvector embedding search with Neptune graph traversals for richer, more connected context.

**Architecture:** GraphContextService orchestrates parallel intent analysis + embedding search, then graph traversal, access filtering, ranking, and token-budgeted context formatting. Circuit breaker provides graceful fallback to embedding-only when Neptune is unavailable.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, gremlinpython, httpx, aioboto3/Bedrock, cachetools, tiktoken, openCypher (Neptune) / Gremlin (local TinkerPop)

**Design Doc:** [docs/plans/2026-02-26-graph-augmented-rag-design.md](2026-02-26-graph-augmented-rag-design.md)

---

## Phase 1: GraphAdapter Foundation  -- COMPLETED

> **Status:** All 8 tasks complete. 20 tests passing. `just validate-backend` passes (ruff + mypy).

### Task 1: Add Python Dependencies

**Files:**
- Modify: `services/core-api/pyproject.toml`

**Step 1: Add dependencies to pyproject.toml**

Add `gremlinpython`, `cachetools`, and `tiktoken` to the main dependencies list in `services/core-api/pyproject.toml:6-26`:

```toml
dependencies = [
  # ... existing deps ...
  "gremlinpython>=3.7.0",
  "cachetools>=5.3.0",
  "tiktoken>=0.7.0",
]
```

**Step 2: Install dependencies**

Run: `cd services/core-api && uv sync`
Expected: Dependencies install successfully.

**Step 3: Validate**

Run: `cd services/core-api && uv run python -c "import gremlin_python; import cachetools; import tiktoken; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
cd services/core-api && git add pyproject.toml uv.lock
git commit -m "chore: add gremlinpython, cachetools, tiktoken dependencies"
```

---

### Task 2: Fix Docker Compose Neptune Config Mount

**Files:**
- Modify: `infra/compose/docker-compose.yml:118-131`

**Step 1: Mount the Gremlin Server config file**

The `neptune-local` service currently doesn't mount the custom config at `infra/compose/neptune-local/gremlin-server.yaml`. Add the volume mount:

```yaml
  neptune-local:
    image: tinkerpop/gremlin-server:3.7.3
    container_name: mosaic-neptune-local
    ports:
      - "18182:8182"
    volumes:
      - neptune-data:/opt/gremlin-server/data
      - ./neptune-local/gremlin-server.yaml:/opt/gremlin-server/conf/gremlin-server.yaml:ro
    healthcheck:
      test: ["CMD-SHELL", "nc -z localhost 8182 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
```

**Step 2: Verify Neptune starts with custom config**

Run: `docker compose -f infra/compose/docker-compose.yml up -d neptune-local`
Run: `docker compose -f infra/compose/docker-compose.yml logs neptune-local | tail -5`
Expected: Gremlin Server started and listening on port 8182.

Run: `curl -s http://localhost:18182 | head -1`
Expected: HTTP response (Gremlin Server is running).

**Step 3: Commit**

```bash
git add infra/compose/docker-compose.yml
git commit -m "fix: mount TinkerPop config in Neptune local dev container"
```

---

### Task 3: Add Neptune Settings

**Files:**
- Modify: `services/core-api/app/config/settings.py:12-106`

**Step 1: Add Neptune settings fields**

Add after the `debug_sse_*` settings block (~line 96):

```python
    # Neptune / Graph Database
    neptune_host: str | None = os.getenv("NEPTUNE_HOST")
    neptune_port: int = int(os.getenv("NEPTUNE_PORT", "8182"))
    neptune_region: str = os.getenv("NEPTUNE_REGION", "us-east-1")
    neptune_iam_auth: bool = _as_bool(os.getenv("NEPTUNE_IAM_AUTH"), False)
    neptune_env_prefix: str = os.getenv("NEPTUNE_ENV_PREFIX", "local")
    graph_augmentation_enabled: bool = _as_bool(
        os.getenv("GRAPH_AUGMENTATION_ENABLED"), True
    )

    # Intent analysis model (lightweight, fast)
    intent_analysis_model_id: str = os.getenv(
        "INTENT_ANALYSIS_MODEL_ID",
        "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    )

    # Entity extraction model
    entity_extraction_model_id: str = os.getenv(
        "ENTITY_EXTRACTION_MODEL_ID",
        "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    )
```

**Step 2: Validate**

Run: `cd services/core-api && uv run mypy app/config/settings.py`
Expected: Success: no issues found.

**Step 3: Commit**

```bash
git add services/core-api/app/config/settings.py
git commit -m "feat: add Neptune and graph augmentation settings"
```

---

### Task 4: Implement GraphAdapter Abstract Base Class

**Files:**
- Create: `services/core-api/app/adapters/graph_adapter.py`
- Create: `services/core-api/tests/adapters/test_graph_adapter.py`

**Step 1: Write the test for the ABC interface**

Create `services/core-api/tests/adapters/test_graph_adapter.py`:

```python
"""Tests for GraphAdapter abstract base class and implementations."""

from __future__ import annotations

import pytest

from app.adapters.graph_adapter import GraphAdapter


class TestGraphAdapterABC:
    """Verify the ABC cannot be instantiated directly."""

    def test_cannot_instantiate_abc(self) -> None:
        with pytest.raises(TypeError, match="abstract"):
            GraphAdapter()  # type: ignore[abstract]

    def test_abc_defines_required_methods(self) -> None:
        """Verify all required abstract methods are declared."""
        abstract_methods = GraphAdapter.__abstractmethods__
        expected = {
            "upsert_node",
            "delete_node",
            "create_relationship",
            "delete_relationship",
            "get_connections",
            "find_path",
            "get_related_stories",
            "query",
            "health_check",
        }
        assert abstract_methods == expected


class TestLabelPrefixing:
    """Verify the label/relationship prefix helper methods."""

    def test_label_prefix(self) -> None:
        from app.adapters.graph_adapter import _prefix_label

        assert _prefix_label("prod", "Person") == "prod-Person"
        assert _prefix_label("staging", "Story") == "staging-Story"
        assert _prefix_label("local", "FAMILY_OF") == "local-FAMILY_OF"

    def test_strip_prefix(self) -> None:
        from app.adapters.graph_adapter import _strip_prefix

        assert _strip_prefix("prod", "prod-Person") == "Person"
        assert _strip_prefix("staging", "staging-Story") == "Story"
        assert _strip_prefix("local", "local-FAMILY_OF") == "FAMILY_OF"
        # No prefix present — return as-is
        assert _strip_prefix("prod", "NoPrefixLabel") == "NoPrefixLabel"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/adapters/test_graph_adapter.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.adapters.graph_adapter'`

**Step 3: Write the GraphAdapter ABC**

Create `services/core-api/app/adapters/graph_adapter.py`:

```python
"""Graph database adapter abstractions.

All label and relationship type parameters use UNPREFIXED logical names
(e.g., "Person", "AUTHORED"). Implementations handle environment prefix
injection transparently based on their configured env_prefix.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


def _prefix_label(env_prefix: str, label: str) -> str:
    """Add environment prefix to a label or relationship type."""
    return f"{env_prefix}-{label}"


def _strip_prefix(env_prefix: str, prefixed: str) -> str:
    """Remove environment prefix from a label or relationship type."""
    prefix = f"{env_prefix}-"
    if prefixed.startswith(prefix):
        return prefixed[len(prefix) :]
    return prefixed


class GraphAdapter(ABC):
    """Abstract graph database adapter.

    Callers always use unprefixed logical names (e.g., ``"Person"``,
    ``"AUTHORED"``). Implementations inject the environment prefix
    (``prod-Person``, ``staging-AUTHORED``) transparently.
    """

    @abstractmethod
    async def upsert_node(
        self, label: str, node_id: str, properties: dict[str, object]
    ) -> None:
        """Create or update a node."""
        ...

    @abstractmethod
    async def delete_node(self, label: str, node_id: str) -> None:
        """Delete a node and its incident edges."""
        ...

    @abstractmethod
    async def create_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_type: str,
        to_label: str,
        to_id: str,
        properties: dict[str, object] | None = None,
    ) -> None:
        """Create a directed relationship between two nodes."""
        ...

    @abstractmethod
    async def delete_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_type: str,
        to_label: str,
        to_id: str,
    ) -> None:
        """Delete a specific relationship between two nodes."""
        ...

    @abstractmethod
    async def get_connections(
        self,
        label: str,
        node_id: str,
        rel_types: list[str] | None = None,
        depth: int = 1,
    ) -> list[dict[str, object]]:
        """Find connected nodes up to *depth* hops."""
        ...

    @abstractmethod
    async def find_path(
        self,
        from_id: str,
        to_id: str,
        max_depth: int = 6,
    ) -> list[dict[str, object]]:
        """Find shortest path between two nodes."""
        ...

    @abstractmethod
    async def get_related_stories(
        self,
        story_id: str,
        limit: int = 10,
    ) -> list[dict[str, object]]:
        """Find stories related to a given story through graph connections."""
        ...

    @abstractmethod
    async def query(
        self, query_str: str, params: dict[str, object] | None = None
    ) -> list[dict[str, object]]:
        """Execute a raw query (openCypher or Gremlin depending on impl).

        This is the escape hatch that bypasses prefix enforcement.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the graph database is reachable."""
        ...
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/adapters/test_graph_adapter.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes (ruff + mypy).

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/graph_adapter.py services/core-api/tests/adapters/test_graph_adapter.py
git commit -m "feat: add GraphAdapter abstract base class with prefix helpers"
```

---

### Task 5: Implement LocalGraphAdapter (TinkerPop/Gremlin)

**Files:**
- Create: `services/core-api/app/adapters/local_graph.py`
- Create: `services/core-api/tests/adapters/test_local_graph.py`

**Step 1: Write tests for LocalGraphAdapter**

Create `services/core-api/tests/adapters/test_local_graph.py`:

```python
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
            mock_httpx.AsyncClient.return_value.__aexit__ = AsyncMock(return_value=False)
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
            mock_httpx.AsyncClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.get.side_effect = Exception("Connection refused")

            result = await adapter.health_check()
            assert result is False
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/adapters/test_local_graph.py -v`
Expected: FAIL — `ModuleNotFoundError`.

**Step 3: Implement LocalGraphAdapter**

Create `services/core-api/app/adapters/local_graph.py`:

```python
"""Local graph adapter using TinkerPop Gremlin Server (for local dev)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .graph_adapter import GraphAdapter, _prefix_label

logger = logging.getLogger(__name__)


class LocalGraphAdapter(GraphAdapter):
    """Graph adapter for local TinkerPop Gremlin Server.

    Uses the Gremlin Server REST API (HTTP POST to /gremlin) since
    TinkerPop's openCypher support is limited.
    """

    def __init__(self, host: str, port: int, env_prefix: str) -> None:
        self.host = host
        self.port = port
        self.env_prefix = env_prefix
        self._base_url = f"http://{host}:{port}"

    def _label(self, logical_label: str) -> str:
        return _prefix_label(self.env_prefix, logical_label)

    def _rel_type(self, logical_type: str) -> str:
        return _prefix_label(self.env_prefix, logical_type)

    async def _execute_gremlin(self, gremlin: str) -> list[dict[str, Any]]:
        """Execute a Gremlin query via the REST API."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{self._base_url}/gremlin",
                json={"gremlin": gremlin},
            )
            response.raise_for_status()
            data: dict[str, Any] = response.json()
            result: list[dict[str, Any]] = data.get("result", {}).get("data", [])
            return result

    async def upsert_node(
        self, label: str, node_id: str, properties: dict[str, object]
    ) -> None:
        prefixed = self._label(label)
        # Gremlin upsert: try to get existing, fold to add if not found
        props = "".join(
            f".property('{k}', '{v}')" for k, v in properties.items()
        )
        gremlin = (
            f"g.V().has('{prefixed}', 'id', '{node_id}')"
            f".fold().coalesce("
            f"  unfold(),"
            f"  addV('{prefixed}').property('id', '{node_id}')"
            f"){props}"
        )
        await self._execute_gremlin(gremlin)

    async def delete_node(self, label: str, node_id: str) -> None:
        prefixed = self._label(label)
        gremlin = f"g.V().has('{prefixed}', 'id', '{node_id}').drop()"
        await self._execute_gremlin(gremlin)

    async def create_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_type: str,
        to_label: str,
        to_id: str,
        properties: dict[str, object] | None = None,
    ) -> None:
        fl = self._label(from_label)
        tl = self._label(to_label)
        rt = self._rel_type(rel_type)
        props = ""
        if properties:
            props = "".join(
                f".property('{k}', '{v}')" for k, v in properties.items()
            )
        gremlin = (
            f"g.V().has('{fl}', 'id', '{from_id}')"
            f".addE('{rt}')"
            f".to(g.V().has('{tl}', 'id', '{to_id}'))"
            f"{props}"
        )
        await self._execute_gremlin(gremlin)

    async def delete_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_type: str,
        to_label: str,
        to_id: str,
    ) -> None:
        fl = self._label(from_label)
        tl = self._label(to_label)
        rt = self._rel_type(rel_type)
        gremlin = (
            f"g.V().has('{fl}', 'id', '{from_id}')"
            f".outE('{rt}')"
            f".where(inV().has('{tl}', 'id', '{to_id}'))"
            f".drop()"
        )
        await self._execute_gremlin(gremlin)

    async def get_connections(
        self,
        label: str,
        node_id: str,
        rel_types: list[str] | None = None,
        depth: int = 1,
    ) -> list[dict[str, object]]:
        prefixed = self._label(label)
        if rel_types:
            edge_filter = ", ".join(f"'{self._rel_type(r)}'" for r in rel_types)
            edge_clause = f".bothE({edge_filter})"
        else:
            edge_clause = ".bothE()"

        # For depth > 1, repeat traversal
        repeat_clause = ""
        if depth > 1:
            repeat_clause = (
                f".repeat(bothE().otherV()).times({depth}).dedup()"
            )
            gremlin = (
                f"g.V().has('{prefixed}', 'id', '{node_id}')"
                f"{repeat_clause}"
                f".valueMap(true).toList()"
            )
        else:
            gremlin = (
                f"g.V().has('{prefixed}', 'id', '{node_id}')"
                f"{edge_clause}.otherV()"
                f".valueMap(true).toList()"
            )
        return await self._execute_gremlin(gremlin)

    async def find_path(
        self,
        from_id: str,
        to_id: str,
        max_depth: int = 6,
    ) -> list[dict[str, object]]:
        gremlin = (
            f"g.V().has('id', '{from_id}')"
            f".repeat(bothE().otherV().simplePath())"
            f".until(has('id', '{to_id}').or().loops().is({max_depth}))"
            f".has('id', '{to_id}')"
            f".path().limit(1).toList()"
        )
        return await self._execute_gremlin(gremlin)

    async def get_related_stories(
        self,
        story_id: str,
        limit: int = 10,
    ) -> list[dict[str, object]]:
        prefixed = self._label("Story")
        gremlin = (
            f"g.V().has('{prefixed}', 'id', '{story_id}')"
            f".bothE().otherV().bothE().otherV()"
            f".hasLabel('{prefixed}').dedup()"
            f".limit({limit}).valueMap(true).toList()"
        )
        return await self._execute_gremlin(gremlin)

    async def query(
        self, query_str: str, params: dict[str, object] | None = None
    ) -> list[dict[str, object]]:
        """Execute raw Gremlin query. Params are ignored (embedded in query)."""
        return await self._execute_gremlin(query_str)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(self._base_url)
                return response.status_code == 200
        except Exception:
            return False
```

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/adapters/test_local_graph.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/local_graph.py services/core-api/tests/adapters/test_local_graph.py
git commit -m "feat: implement LocalGraphAdapter for TinkerPop Gremlin Server"
```

---

### Task 6: Implement NeptuneGraphAdapter

**Files:**
- Create: `services/core-api/app/adapters/neptune_graph.py`
- Create: `services/core-api/tests/adapters/test_neptune_graph.py`

**Step 1: Write tests for NeptuneGraphAdapter**

Create `services/core-api/tests/adapters/test_neptune_graph.py`:

```python
"""Tests for NeptuneGraphAdapter (AWS Neptune with openCypher)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

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
            host="h", port=8182, region="us-east-1",
            iam_auth=False, env_prefix="staging",
        )
        assert adapter._label("Person") == "staging-Person"
        assert adapter._rel_type("FAMILY_OF") == "staging-FAMILY_OF"


class TestNeptuneOpenCypherQueryBuild:
    """Test that openCypher queries are built with correct prefixes."""

    def test_upsert_node_cypher(self) -> None:
        adapter = NeptuneGraphAdapter(
            host="h", port=8182, region="us-east-1",
            iam_auth=False, env_prefix="prod",
        )
        cypher, params = adapter._build_upsert_node_cypher(
            "Person", "abc-123", {"name": "Jane", "age": 42}
        )
        assert "`prod-Person`" in cypher
        assert params["node_id"] == "abc-123"
        assert params["props"]["name"] == "Jane"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/adapters/test_neptune_graph.py -v`
Expected: FAIL — `ModuleNotFoundError`.

**Step 3: Implement NeptuneGraphAdapter**

Create `services/core-api/app/adapters/neptune_graph.py`:

```python
"""AWS Neptune graph adapter using openCypher over HTTPS."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .graph_adapter import GraphAdapter, _prefix_label

logger = logging.getLogger(__name__)


class NeptuneGraphAdapter(GraphAdapter):
    """Graph adapter for AWS Neptune using openCypher queries.

    Production uses IAM SigV4 signing; local/test use direct HTTPS.
    """

    def __init__(
        self,
        host: str,
        port: int,
        region: str,
        iam_auth: bool,
        env_prefix: str,
    ) -> None:
        self.host = host
        self.port = port
        self.region = region
        self.iam_auth = iam_auth
        self.env_prefix = env_prefix
        self._base_url = f"https://{host}:{port}"

    def _label(self, logical_label: str) -> str:
        return _prefix_label(self.env_prefix, logical_label)

    def _rel_type(self, logical_type: str) -> str:
        return _prefix_label(self.env_prefix, logical_type)

    async def _execute_cypher(
        self, cypher: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Execute an openCypher query against Neptune's HTTPS endpoint."""
        headers: dict[str, str] = {"Content-Type": "application/x-www-form-urlencoded"}

        if self.iam_auth:
            # SigV4 signing for IAM auth
            headers = await self._sign_request(headers)

        body = f"query={cypher}"
        if params:
            import json

            body += f"&parameters={json.dumps(params)}"

        async with httpx.AsyncClient(
            timeout=10.0, verify=True
        ) as client:
            response = await client.post(
                f"{self._base_url}/openCypher",
                content=body,
                headers=headers,
            )
            response.raise_for_status()
            data: dict[str, Any] = response.json()
            results: list[dict[str, Any]] = data.get("results", [])
            return results

    async def _sign_request(
        self, headers: dict[str, str]
    ) -> dict[str, str]:
        """Sign request with SigV4 for IAM authentication."""
        from botocore.auth import SigV4Auth  # type: ignore[import-untyped]
        from botocore.awsrequest import AWSRequest  # type: ignore[import-untyped]
        from botocore.session import Session  # type: ignore[import-untyped]

        session = Session()
        credentials = session.get_credentials().get_frozen_credentials()
        request = AWSRequest(
            method="POST",
            url=f"{self._base_url}/openCypher",
            headers=headers,
        )
        SigV4Auth(credentials, "neptune-db", self.region).add_auth(request)
        return dict(request.headers)

    def _build_upsert_node_cypher(
        self, label: str, node_id: str, properties: dict[str, object]
    ) -> tuple[str, dict[str, Any]]:
        """Build a MERGE cypher for upserting a node."""
        prefixed = self._label(label)
        set_clause = ", ".join(f"n.{k} = $props.{k}" for k in properties)
        cypher = (
            f"MERGE (n:`{prefixed}` {{id: $node_id}}) "
            f"SET {set_clause}" if set_clause else
            f"MERGE (n:`{prefixed}` {{id: $node_id}})"
        )
        return cypher, {"node_id": node_id, "props": properties}

    async def upsert_node(
        self, label: str, node_id: str, properties: dict[str, object]
    ) -> None:
        cypher, params = self._build_upsert_node_cypher(label, node_id, properties)
        await self._execute_cypher(cypher, params)

    async def delete_node(self, label: str, node_id: str) -> None:
        prefixed = self._label(label)
        cypher = f"MATCH (n:`{prefixed}` {{id: $node_id}}) DETACH DELETE n"
        await self._execute_cypher(cypher, {"node_id": node_id})

    async def create_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_type: str,
        to_label: str,
        to_id: str,
        properties: dict[str, object] | None = None,
    ) -> None:
        fl = self._label(from_label)
        tl = self._label(to_label)
        rt = self._rel_type(rel_type)
        props_clause = ""
        params: dict[str, Any] = {"from_id": from_id, "to_id": to_id}
        if properties:
            props_clause = " SET " + ", ".join(
                f"r.{k} = $props.{k}" for k in properties
            )
            params["props"] = properties
        cypher = (
            f"MATCH (a:`{fl}` {{id: $from_id}}), (b:`{tl}` {{id: $to_id}}) "
            f"CREATE (a)-[r:`{rt}`]->(b){props_clause}"
        )
        await self._execute_cypher(cypher, params)

    async def delete_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_type: str,
        to_label: str,
        to_id: str,
    ) -> None:
        fl = self._label(from_label)
        tl = self._label(to_label)
        rt = self._rel_type(rel_type)
        cypher = (
            f"MATCH (a:`{fl}` {{id: $from_id}})-[r:`{rt}`]->(b:`{tl}` {{id: $to_id}}) "
            f"DELETE r"
        )
        await self._execute_cypher(cypher, {"from_id": from_id, "to_id": to_id})

    async def get_connections(
        self,
        label: str,
        node_id: str,
        rel_types: list[str] | None = None,
        depth: int = 1,
    ) -> list[dict[str, object]]:
        prefixed = self._label(label)
        if rel_types:
            rel_filter = "|".join(f"`{self._rel_type(r)}`" for r in rel_types)
            rel_clause = f"[r:{rel_filter}*1..{depth}]"
        else:
            rel_clause = f"[*1..{depth}]"
        cypher = (
            f"MATCH (n:`{prefixed}` {{id: $node_id}})-{rel_clause}-(connected) "
            f"RETURN DISTINCT connected, labels(connected) AS labels"
        )
        return await self._execute_cypher(cypher, {"node_id": node_id})

    async def find_path(
        self,
        from_id: str,
        to_id: str,
        max_depth: int = 6,
    ) -> list[dict[str, object]]:
        cypher = (
            f"MATCH path = shortestPath((a {{id: $from_id}})-[*..{max_depth}]-(b {{id: $to_id}})) "
            f"RETURN path"
        )
        return await self._execute_cypher(
            cypher, {"from_id": from_id, "to_id": to_id}
        )

    async def get_related_stories(
        self,
        story_id: str,
        limit: int = 10,
    ) -> list[dict[str, object]]:
        prefixed = self._label("Story")
        cypher = (
            f"MATCH (s:`{prefixed}` {{id: $story_id}})-[*1..2]-(related:`{prefixed}`) "
            f"WHERE related.id <> $story_id "
            f"RETURN DISTINCT related LIMIT $limit"
        )
        return await self._execute_cypher(
            cypher, {"story_id": story_id, "limit": limit}
        )

    async def query(
        self, query_str: str, params: dict[str, object] | None = None
    ) -> list[dict[str, object]]:
        return await self._execute_cypher(query_str, params)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0, verify=True) as client:
                response = await client.get(f"{self._base_url}/status")
                return response.status_code == 200
        except Exception:
            return False
```

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/adapters/test_neptune_graph.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/neptune_graph.py services/core-api/tests/adapters/test_neptune_graph.py
git commit -m "feat: implement NeptuneGraphAdapter with openCypher over HTTPS"
```

---

### Task 7: GraphAdapter Factory and DI Registration

**Files:**
- Create: `services/core-api/app/adapters/graph_factory.py`
- Modify: `services/core-api/app/providers/registry.py:22-168`
- Create: `services/core-api/tests/adapters/test_graph_factory.py`

**Step 1: Write tests for factory**

Create `services/core-api/tests/adapters/test_graph_factory.py`:

```python
"""Tests for GraphAdapter factory function."""

from __future__ import annotations

import os
import pytest
from unittest.mock import patch

from app.adapters.graph_factory import create_graph_adapter
from app.adapters.local_graph import LocalGraphAdapter
from app.adapters.neptune_graph import NeptuneGraphAdapter


class TestCreateGraphAdapter:
    """Test the factory function for creating graph adapters."""

    def test_creates_local_adapter_when_no_neptune_host(self) -> None:
        with patch.dict(os.environ, {"NEPTUNE_ENV_PREFIX": "test"}, clear=False):
            from app.config import get_settings
            get_settings.cache_clear()
            settings = get_settings()
            settings.neptune_host = None
            adapter = create_graph_adapter(settings)
            assert isinstance(adapter, LocalGraphAdapter)
            get_settings.cache_clear()

    def test_creates_neptune_adapter_when_host_set(self) -> None:
        with patch.dict(os.environ, {
            "NEPTUNE_HOST": "neptune.example.com",
            "NEPTUNE_IAM_AUTH": "true",
            "NEPTUNE_ENV_PREFIX": "prod",
        }, clear=False):
            from app.config import get_settings
            get_settings.cache_clear()
            settings = get_settings()
            adapter = create_graph_adapter(settings)
            assert isinstance(adapter, NeptuneGraphAdapter)
            get_settings.cache_clear()

    def test_returns_none_when_graph_disabled(self) -> None:
        with patch.dict(os.environ, {
            "GRAPH_AUGMENTATION_ENABLED": "false",
        }, clear=False):
            from app.config import get_settings
            get_settings.cache_clear()
            settings = get_settings()
            adapter = create_graph_adapter(settings)
            assert adapter is None
            get_settings.cache_clear()
```

**Step 2: Implement factory**

Create `services/core-api/app/adapters/graph_factory.py`:

```python
"""Factory for creating GraphAdapter instances based on configuration."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config.settings import Settings
    from .graph_adapter import GraphAdapter

logger = logging.getLogger(__name__)


def create_graph_adapter(settings: Settings) -> GraphAdapter | None:
    """Create the appropriate GraphAdapter based on settings.

    Returns None if graph augmentation is disabled.
    """
    if not settings.graph_augmentation_enabled:
        logger.info("graph_adapter.disabled")
        return None

    if settings.neptune_host:
        from .neptune_graph import NeptuneGraphAdapter

        logger.info(
            "graph_adapter.neptune",
            extra={
                "host": settings.neptune_host,
                "port": settings.neptune_port,
                "env_prefix": settings.neptune_env_prefix,
            },
        )
        return NeptuneGraphAdapter(
            host=settings.neptune_host,
            port=settings.neptune_port,
            region=settings.neptune_region,
            iam_auth=settings.neptune_iam_auth,
            env_prefix=settings.neptune_env_prefix,
        )

    from .local_graph import LocalGraphAdapter

    logger.info(
        "graph_adapter.local",
        extra={"host": "localhost", "port": 18182},
    )
    return LocalGraphAdapter(
        host="localhost",
        port=18182,
        env_prefix=settings.neptune_env_prefix,
    )
```

**Step 3: Register in ProviderRegistry**

Add a `get_graph_adapter` method to `services/core-api/app/providers/registry.py`. Add after `get_storytelling_agent()` (after line 137):

```python
    def get_graph_adapter(self) -> GraphAdapter | None:
        """Return the configured graph adapter, or None if disabled."""
        from ..adapters.graph_factory import create_graph_adapter

        return create_graph_adapter(self._settings)
```

Add `GraphAdapter` to the `TYPE_CHECKING` imports at line 11:

```python
if TYPE_CHECKING:
    from ..adapters.ai import (
        AgentMemory,
        ContentGuardrail,
        EmbeddingProvider,
        LLMProvider,
        StorytellingAgent,
        VectorStore,
    )
    from ..adapters.graph_adapter import GraphAdapter
    from ..config.settings import Settings
```

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/adapters/test_graph_factory.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/graph_factory.py services/core-api/tests/adapters/test_graph_factory.py services/core-api/app/providers/registry.py
git commit -m "feat: add GraphAdapter factory and register in ProviderRegistry"
```

---

### Task 8: Circuit Breaker for Graph Operations

**Files:**
- Create: `services/core-api/app/services/circuit_breaker.py`
- Create: `services/core-api/tests/services/test_circuit_breaker.py`

**Step 1: Write tests**

Create `services/core-api/tests/services/test_circuit_breaker.py`:

```python
"""Tests for circuit breaker."""

from __future__ import annotations

import time
import pytest

from app.services.circuit_breaker import CircuitBreaker


class TestCircuitBreaker:
    """Test circuit breaker state transitions."""

    def test_starts_closed(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
        assert cb.state == "closed"
        assert cb.allow_request() is True

    def test_opens_after_threshold_failures(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "closed"
        cb.record_failure()
        assert cb.state == "open"
        assert cb.allow_request() is False

    def test_resets_on_success(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.state == "closed"
        assert cb._failure_count == 0

    def test_transitions_to_half_open(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "open"

        time.sleep(0.15)
        assert cb.allow_request() is True  # transitions to half_open
        assert cb.state == "half_open"

    def test_half_open_success_closes(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        cb.allow_request()  # half_open
        cb.record_success()
        assert cb.state == "closed"

    def test_half_open_failure_opens(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        cb.allow_request()  # half_open
        cb.record_failure()
        assert cb.state == "open"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_circuit_breaker.py -v`
Expected: FAIL — `ModuleNotFoundError`.

**Step 3: Implement CircuitBreaker**

Create `services/core-api/app/services/circuit_breaker.py`:

```python
"""Simple circuit breaker for external service calls."""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


class CircuitBreaker:
    """Three-state circuit breaker: closed → open → half_open → closed.

    - **closed**: normal operation.
    - **open**: all requests are rejected (returns False from allow_request).
    - **half_open**: one trial request is allowed.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
    ) -> None:
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._state = "closed"
        self._last_failure_time: float = 0.0

    @property
    def state(self) -> str:
        return self._state

    def allow_request(self) -> bool:
        """Return True if the request should proceed."""
        if self._state == "closed":
            return True
        if self._state == "open":
            if time.monotonic() - self._last_failure_time >= self._recovery_timeout:
                self._state = "half_open"
                logger.info("circuit_breaker.half_open")
                return True
            return False
        # half_open — allow one trial
        return True

    def record_success(self) -> None:
        """Record a successful call."""
        if self._state in ("half_open", "closed"):
            self._failure_count = 0
            self._state = "closed"

    def record_failure(self) -> None:
        """Record a failed call."""
        self._failure_count += 1
        self._last_failure_time = time.monotonic()

        if self._state == "half_open":
            self._state = "open"
            logger.warning("circuit_breaker.reopened")
        elif self._failure_count >= self._failure_threshold:
            self._state = "open"
            logger.warning(
                "circuit_breaker.opened",
                extra={"failures": self._failure_count},
            )
```

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/services/test_circuit_breaker.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 6: Commit**

```bash
git add services/core-api/app/services/circuit_breaker.py services/core-api/tests/services/test_circuit_breaker.py
git commit -m "feat: add circuit breaker for graph operations"
```

---

## Phase 2: Entity Extraction Pipeline  -- COMPLETED

> **Status:** All 3 tasks complete. Tests passing. `just validate-backend` passes (ruff + mypy).

### Task 9: EntityExtractionService

**Files:**
- Create: `services/core-api/app/services/entity_extraction.py`
- Create: `services/core-api/tests/services/test_entity_extraction.py`

**Step 1: Write tests**

Create `services/core-api/tests/services/test_entity_extraction.py`:

```python
"""Tests for EntityExtractionService."""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, patch

from app.services.entity_extraction import (
    EntityExtractionService,
    ExtractedEntities,
    ExtractedEntity,
)


class TestExtractedEntities:
    """Test the extraction data model."""

    def test_filter_by_confidence(self) -> None:
        entities = ExtractedEntities(
            people=[
                ExtractedEntity(name="Jim", context="uncle", confidence=0.9),
                ExtractedEntity(name="Someone", context="unknown", confidence=0.3),
            ],
            places=[],
            events=[],
            objects=[],
            time_references=[],
        )
        filtered = entities.filter_by_confidence(0.7)
        assert len(filtered.people) == 1
        assert filtered.people[0].name == "Jim"


class TestEntityExtractionService:
    """Test the extraction pipeline."""

    @pytest.mark.asyncio
    async def test_extract_entities_parses_llm_response(self) -> None:
        mock_provider = AsyncMock()
        llm_response = json.dumps({
            "people": [{"name": "Uncle Jim", "context": "brother", "confidence": 0.95}],
            "places": [{"name": "Chicago", "type": "city", "location": "IL", "confidence": 0.9}],
            "events": [],
            "objects": [],
            "time_references": [{"period": "1980s", "context": "childhood"}],
        })
        # Mock stream_generate to yield the JSON
        async def mock_stream() -> None:
            pass

        mock_chunks: list[str] = [llm_response]

        async def fake_stream(**kwargs: object) -> AsyncMock:
            async def gen():  # type: ignore[return]
                for c in mock_chunks:
                    yield c
            return gen()

        mock_provider.stream_generate = fake_stream

        service = EntityExtractionService(
            llm_provider=mock_provider,
            model_id="test-model",
        )
        result = await service.extract_entities("A story about Uncle Jim in Chicago in the 1980s.")

        assert len(result.people) == 1
        assert result.people[0].name == "Uncle Jim"
        assert len(result.places) == 1
        assert result.places[0].name == "Chicago"

    @pytest.mark.asyncio
    async def test_extract_entities_returns_empty_on_failure(self) -> None:
        mock_provider = AsyncMock()

        async def fail_stream(**kwargs: object) -> AsyncMock:
            async def gen():  # type: ignore[return]
                yield "not valid json"
            return gen()

        mock_provider.stream_generate = fail_stream

        service = EntityExtractionService(
            llm_provider=mock_provider,
            model_id="test-model",
        )
        result = await service.extract_entities("Some content")
        assert len(result.people) == 0
        assert len(result.places) == 0
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_entity_extraction.py -v`
Expected: FAIL — `ModuleNotFoundError`.

**Step 3: Implement EntityExtractionService**

Create `services/core-api/app/services/entity_extraction.py`:

```python
"""Service for extracting entities from story content via LLM."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from opentelemetry import trace

if TYPE_CHECKING:
    from ..adapters.ai import LLMProvider
    from ..adapters.graph_adapter import GraphAdapter

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.entity_extraction")

_EXTRACTION_PROMPT = """\
Extract structured entities from the following story content.
Return ONLY valid JSON with no markdown formatting.

For each entity, provide a confidence score (0.0-1.0) indicating how certain \
you are that this is a real, distinct entity worth tracking.

Output format:
{
  "people": [{"name": "...", "context": "relationship or role", "confidence": 0.0-1.0}],
  "places": [{"name": "...", "type": "city|residence|workplace|school|other", "location": "...", "confidence": 0.0-1.0}],
  "events": [{"name": "...", "type": "family_gathering|career|education|travel|other", "date": "...", "confidence": 0.0-1.0}],
  "objects": [{"name": "...", "type": "heirloom|photo|document|other", "confidence": 0.0-1.0}],
  "time_references": [{"period": "...", "context": "..."}]
}

Rules:
- Only extract entities that are specifically mentioned, not implied.
- For people, capture the relationship context (e.g., "mother's brother", "college friend").
- For places, include location details when available.
- Set confidence below 0.5 for vague or ambiguous mentions.
- Do not extract the story's main subject (they are already tracked).
"""


@dataclass
class ExtractedEntity:
    """A single extracted entity."""

    name: str
    context: str = ""
    confidence: float = 0.0
    type: str = ""
    location: str = ""
    date: str = ""
    period: str = ""


@dataclass
class ExtractedEntities:
    """All entities extracted from a story."""

    people: list[ExtractedEntity] = field(default_factory=list)
    places: list[ExtractedEntity] = field(default_factory=list)
    events: list[ExtractedEntity] = field(default_factory=list)
    objects: list[ExtractedEntity] = field(default_factory=list)
    time_references: list[ExtractedEntity] = field(default_factory=list)

    def filter_by_confidence(self, threshold: float = 0.7) -> ExtractedEntities:
        """Return a copy with only entities above the confidence threshold."""
        return ExtractedEntities(
            people=[e for e in self.people if e.confidence >= threshold],
            places=[e for e in self.places if e.confidence >= threshold],
            events=[e for e in self.events if e.confidence >= threshold],
            objects=[e for e in self.objects if e.confidence >= threshold],
            time_references=self.time_references,  # No confidence on time refs
        )


def _parse_entity_list(
    raw_list: list[dict[str, Any]], entity_type: str
) -> list[ExtractedEntity]:
    """Parse a list of raw entity dicts into ExtractedEntity objects."""
    entities: list[ExtractedEntity] = []
    for item in raw_list:
        entities.append(
            ExtractedEntity(
                name=item.get("name", ""),
                context=item.get("context", ""),
                confidence=float(item.get("confidence", 0.0)),
                type=item.get("type", ""),
                location=item.get("location", ""),
                date=item.get("date", ""),
                period=item.get("period", ""),
            )
        )
    return entities


class EntityExtractionService:
    """Extracts structured entities from story content using an LLM."""

    def __init__(self, llm_provider: LLMProvider, model_id: str) -> None:
        self._llm_provider = llm_provider
        self._model_id = model_id

    async def extract_entities(self, story_content: str) -> ExtractedEntities:
        """Extract entities from story content.

        Returns empty ExtractedEntities on failure (best-effort).
        """
        with tracer.start_as_current_span("entity_extraction.extract") as span:
            span.set_attribute("content_length", len(story_content))

            try:
                chunks: list[str] = []
                async for chunk in self._llm_provider.stream_generate(
                    messages=[{"role": "user", "content": story_content}],
                    system_prompt=_EXTRACTION_PROMPT,
                    model_id=self._model_id,
                    max_tokens=2048,
                ):
                    chunks.append(chunk)

                raw_text = "".join(chunks).strip()
                # Strip markdown code fences if present
                if raw_text.startswith("```"):
                    lines = raw_text.split("\n")
                    raw_text = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_text

                data: dict[str, Any] = json.loads(raw_text)

                result = ExtractedEntities(
                    people=_parse_entity_list(data.get("people", []), "person"),
                    places=_parse_entity_list(data.get("places", []), "place"),
                    events=_parse_entity_list(data.get("events", []), "event"),
                    objects=_parse_entity_list(data.get("objects", []), "object"),
                    time_references=_parse_entity_list(
                        data.get("time_references", []), "time"
                    ),
                )

                span.set_attribute(
                    "entity_count",
                    len(result.people)
                    + len(result.places)
                    + len(result.events)
                    + len(result.objects),
                )

                logger.info(
                    "entity_extraction.extracted",
                    extra={
                        "people": len(result.people),
                        "places": len(result.places),
                        "events": len(result.events),
                        "objects": len(result.objects),
                    },
                )
                return result

            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                logger.warning(
                    "entity_extraction.parse_failed",
                    extra={"error": str(exc)},
                )
                return ExtractedEntities()
            except Exception as exc:
                logger.warning(
                    "entity_extraction.failed",
                    extra={"error": str(exc)},
                )
                return ExtractedEntities()
```

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/services/test_entity_extraction.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 6: Commit**

```bash
git add services/core-api/app/services/entity_extraction.py services/core-api/tests/services/test_entity_extraction.py
git commit -m "feat: add EntityExtractionService for story entity extraction"
```

---

### Task 10: Integrate Entity Extraction into Ingestion Pipeline

**Files:**
- Modify: `services/core-api/app/services/ingestion.py:17-117`

**Step 1: Add entity extraction call after chunk indexing**

In `services/core-api/app/services/ingestion.py`, after the commit on line 106, add entity extraction as a best-effort follow-up:

```python
        # 6. Best-effort entity extraction for graph database
        try:
            from .entity_extraction import EntityExtractionService

            settings = get_settings()
            if settings.graph_augmentation_enabled:
                from ..providers.registry import get_provider_registry as _get_registry

                registry = _get_registry()
                graph_adapter = registry.get_graph_adapter()
                if graph_adapter:
                    llm_provider = registry.get_llm_provider()
                    extraction_service = EntityExtractionService(
                        llm_provider=llm_provider,
                        model_id=settings.entity_extraction_model_id,
                    )
                    entities = await extraction_service.extract_entities(content)
                    filtered = entities.filter_by_confidence(0.7)

                    # Sync extracted entities to graph
                    await _sync_entities_to_graph(
                        graph_adapter, story_id, legacy_id, filtered
                    )
        except Exception as exc:
            # Entity extraction is best-effort — never block ingestion
            logger.warning(
                "ingestion.entity_extraction_failed",
                extra={"story_id": str(story_id), "error": str(exc)},
            )
```

Also add the `_sync_entities_to_graph` helper function and the import for `get_settings`:

```python
from ..config import get_settings


async def _sync_entities_to_graph(
    graph_adapter: object,
    story_id: UUID,
    legacy_id: UUID,
    entities: object,
) -> None:
    """Sync extracted entities to the graph database."""
    from .entity_extraction import ExtractedEntities
    from ..adapters.graph_adapter import GraphAdapter

    if not isinstance(graph_adapter, GraphAdapter) or not isinstance(
        entities, ExtractedEntities
    ):
        return

    sid = str(story_id)

    for place in entities.places:
        place_id = f"place-{place.name.lower().replace(' ', '-')}-{legacy_id}"
        await graph_adapter.upsert_node(
            "Place", place_id,
            {"name": place.name, "type": place.type, "location": place.location},
        )
        await graph_adapter.create_relationship(
            "Story", sid, "TOOK_PLACE_AT", "Place", place_id,
        )

    for event in entities.events:
        event_id = f"event-{event.name.lower().replace(' ', '-')}-{legacy_id}"
        await graph_adapter.upsert_node(
            "Event", event_id,
            {"name": event.name, "type": event.type, "date": event.date},
        )
        await graph_adapter.create_relationship(
            "Story", sid, "REFERENCES", "Event", event_id,
        )

    for obj in entities.objects:
        obj_id = f"object-{obj.name.lower().replace(' ', '-')}-{legacy_id}"
        await graph_adapter.upsert_node(
            "Object", obj_id,
            {"name": obj.name, "type": obj.type, "description": obj.context},
        )
        await graph_adapter.create_relationship(
            "Story", sid, "REFERENCES", "Object", obj_id,
        )

    logger.info(
        "ingestion.entities_synced",
        extra={
            "story_id": str(story_id),
            "places": len(entities.places),
            "events": len(entities.events),
            "objects": len(entities.objects),
        },
    )
```

**Step 2: Run existing ingestion tests to verify no regression**

Run: `cd services/core-api && uv run pytest tests/services/test_ingestion.py -v`
Expected: All existing tests still pass.

**Step 3: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 4: Commit**

```bash
git add services/core-api/app/services/ingestion.py
git commit -m "feat: integrate entity extraction into story ingestion pipeline"
```

---

### Task 11: Entity Backfill Script + Kubernetes Job

**Files:**
- Create: `services/core-api/scripts/backfill_entities.py`
- Create: `infra/helm/mosaic-life/templates/entity-backfill-job.yaml`

**Step 1: Create the backfill script**

Follow the pattern from `services/core-api/scripts/backfill_embeddings.py`:

Create `services/core-api/scripts/backfill_entities.py`:

```python
#!/usr/bin/env python
"""Backfill entity extraction for existing stories.

Usage:
    cd services/core-api
    uv run python scripts/backfill_entities.py

Options:
    --dry-run    Show what would be processed without extracting
    --limit N    Only process N stories (for testing)
"""

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

sys.path.insert(0, ".")

from app.config import get_settings
from app.models.story import Story

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def backfill_entities(
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    """Extract entities from all existing stories and sync to graph."""
    settings = get_settings()

    if not settings.db_url:
        logger.error("DB_URL not configured")
        sys.exit(1)

    if not settings.graph_augmentation_enabled:
        logger.error("GRAPH_AUGMENTATION_ENABLED is false")
        sys.exit(1)

    db_url = settings.db_url
    if "postgresql+psycopg://" in db_url:
        db_url = db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif "postgresql+asyncpg://" not in db_url:
        logger.error(f"Unsupported DB_URL format: {db_url}")
        sys.exit(1)

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    # Get graph adapter and LLM provider
    from app.providers.registry import get_provider_registry

    registry = get_provider_registry()
    graph_adapter = registry.get_graph_adapter()
    if not graph_adapter:
        logger.error("Graph adapter not available")
        sys.exit(1)

    llm_provider = registry.get_llm_provider()

    from app.services.entity_extraction import EntityExtractionService

    extraction_service = EntityExtractionService(
        llm_provider=llm_provider,
        model_id=settings.entity_extraction_model_id,
    )

    async with async_session() as db:
        query = (
            select(Story)
            .options(selectinload(Story.legacy_associations))
            .order_by(Story.created_at)
        )
        if limit:
            query = query.limit(limit)

        result = await db.execute(query)
        stories = result.scalars().all()
        total = len(stories)

        logger.info(f"Found {total} stories to process")

        if dry_run:
            for story in stories:
                title = story.title[:50] + "..." if len(story.title) > 50 else story.title
                logger.info(f"[DRY RUN] Would extract entities from: {story.id} - {title}")
            return

        success = 0
        failed = 0

        for i, story in enumerate(stories, 1):
            try:
                title = story.title[:50] + "..." if len(story.title) > 50 else story.title
                logger.info(f"[{i}/{total}] Extracting: {story.id} - {title}")

                entities = await extraction_service.extract_entities(story.content)
                filtered = entities.filter_by_confidence(0.7)

                primary = next(
                    (a for a in story.legacy_associations if a.role == "primary"),
                    story.legacy_associations[0] if story.legacy_associations else None,
                )
                if not primary:
                    logger.warning(f"  No legacy association, skipping")
                    continue

                from app.services.ingestion import _sync_entities_to_graph

                await _sync_entities_to_graph(
                    graph_adapter, story.id, primary.legacy_id, filtered
                )

                entity_count = (
                    len(filtered.people) + len(filtered.places)
                    + len(filtered.events) + len(filtered.objects)
                )
                logger.info(f"  Extracted {entity_count} entities")
                success += 1

                # Rate limiting: 0.5s between stories to avoid Bedrock throttling
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"  Failed: {e}")
                failed += 1
                continue

        logger.info(f"Backfill complete: {success} succeeded, {failed} failed")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill entity extraction")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    asyncio.run(backfill_entities(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
```

**Step 2: Create Kubernetes Job manifest**

Create `infra/helm/mosaic-life/templates/entity-backfill-job.yaml`:

```yaml
{{- if .Values.entityBackfill.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: entity-backfill-{{ .Release.Revision }}
  labels:
    app.kubernetes.io/name: entity-backfill
    app.kubernetes.io/instance: {{ .Release.Name }}
  annotations:
    helm.sh/hook: post-install,post-upgrade
    helm.sh/hook-weight: "10"
    helm.sh/hook-delete-policy: before-hook-creation
spec:
  backoffLimit: 1
  template:
    spec:
      serviceAccountName: {{ .Values.coreApi.serviceAccountName | default "default" }}
      containers:
        - name: backfill
          image: "{{ .Values.coreApi.image.repository }}:{{ .Values.coreApi.image.tag }}"
          command: ["uv", "run", "python", "scripts/backfill_entities.py"]
          envFrom:
            - secretRef:
                name: core-api-secrets
            - secretRef:
                name: neptune-connection
                optional: true
          env:
            - name: GRAPH_AUGMENTATION_ENABLED
              value: "true"
      restartPolicy: Never
{{- end }}
```

**Step 3: Add default values**

Add to `infra/helm/mosaic-life/values.yaml` (at the end):

```yaml
entityBackfill:
  enabled: false
```

**Step 4: Commit**

```bash
git add services/core-api/scripts/backfill_entities.py infra/helm/mosaic-life/templates/entity-backfill-job.yaml infra/helm/mosaic-life/values.yaml
git commit -m "feat: add entity extraction backfill script and Kubernetes Job"
```

---

## Phase 3: Persona Expansion  -- COMPLETED

> **Status:** Task 12 complete. 26 tests passing. `just validate-backend` passes (ruff + mypy).

### Task 12: Add Colleague and Family Personas

**Files:**
- Modify: `services/core-api/app/config/personas.yaml`
- Create: `services/core-api/tests/config/test_new_personas.py`

**Step 1: Write test for new personas**

Create `services/core-api/tests/config/test_new_personas.py`:

```python
"""Tests for colleague and family persona configurations."""

from __future__ import annotations

import pytest

from app.config.personas import _reset_cache, get_persona, get_personas, load_personas


class TestNewPersonas:
    """Verify colleague and family personas load correctly."""

    def setup_method(self) -> None:
        _reset_cache()

    def test_four_personas_loaded(self) -> None:
        personas = load_personas()
        assert len(personas) == 4
        assert "biographer" in personas
        assert "friend" in personas
        assert "colleague" in personas
        assert "family" in personas

    def test_colleague_persona_config(self) -> None:
        persona = get_persona("colleague")
        assert persona is not None
        assert persona.name == "The Colleague"
        assert "{legacy_name}" in persona.system_prompt

    def test_family_persona_config(self) -> None:
        persona = get_persona("family")
        assert persona is not None
        assert persona.name == "The Family Member"
        assert "{legacy_name}" in persona.system_prompt

    def test_all_personas_have_traversal_config(self) -> None:
        """Verify traversal config exists in the YAML (loaded separately)."""
        import yaml
        from pathlib import Path

        config_path = Path(__file__).parent.parent.parent / "app" / "config" / "personas.yaml"
        with open(config_path) as f:
            config = yaml.safe_load(f)

        for persona_id in ["biographer", "friend", "colleague", "family"]:
            assert "traversal" in config["personas"][persona_id], (
                f"Persona {persona_id} missing traversal config"
            )

    def teardown_method(self) -> None:
        _reset_cache()
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/config/test_new_personas.py -v`
Expected: FAIL — only 2 personas loaded.

**Step 3: Add personas and traversal config to YAML**

Replace the content of `services/core-api/app/config/personas.yaml` with:

```yaml
# AI Persona Definitions
# Loaded at startup and cached in memory

base_rules: |
  CRITICAL SAFETY RULES (apply to all responses):
  - You are assisting with a memorial/legacy site. Be grief-aware and respectful.
  - Never claim certainty about medical, legal, or financial matters.
  - Never impersonate the deceased or claim to be them.
  - Always acknowledge uncertainty: use phrases like "I may be mistaken" or "Based on what you've shared..."
  - Never speculate about cause of death or controversial circumstances.
  - If asked about topics outside your role, gently redirect to your purpose.
  - Keep responses concise but warm. Aim for 2-4 paragraphs unless more detail is requested.

personas:
  biographer:
    name: "The Biographer"
    icon: "BookOpen"
    description: "Life Story Curator - helps organize memories into meaningful narratives"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens: 1024
    system_prompt: |
      You are The Biographer, a compassionate life story curator helping preserve memories of {legacy_name}.

      Your role:
      - Help users organize memories into themes and timelines
      - Ask clarifying questions to draw out rich details
      - Suggest connections between stories and life chapters
      - Help identify gaps in the narrative that could be filled

      When a user shares new information about {legacy_name}:
      - Acknowledge what they've shared with genuine interest
      - Ask follow-up questions to draw out rich details about THIS specific topic
      - Only connect to existing stories if the connection is strong and natural
      - Do not bring up unrelated stories just because you have them available

      Tone: Warm, curious, encouraging. Like a skilled interviewer writing a biography.
    traversal:
      max_hops: 2
      relationship_weights:
        FAMILY_OF: 1.0
        KNEW: 0.8
        WORKED_WITH: 0.7
        FRIENDS_WITH: 0.8
      max_graph_results: 20
      include_cross_legacy: true
      temporal_range: "full"

  friend:
    name: "The Friend"
    icon: "Heart"
    description: "Empathetic Listener - provides emotional support during the memorial process"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens: 1024
    system_prompt: |
      You are The Friend, a compassionate listener supporting someone preserving memories of {legacy_name}.

      Your role:
      - Acknowledge and validate emotions around grief and remembrance
      - Offer gentle prompts when someone seems stuck
      - Reflect feelings back to help users process
      - Celebrate joyful memories as much as honoring difficult ones

      When a user shares new information about {legacy_name}:
      - Acknowledge what they've shared with genuine interest
      - Ask follow-up questions to draw out rich details about THIS specific topic
      - Only connect to existing stories if the connection is strong and natural
      - Do not bring up unrelated stories just because you have them available

      Tone: Warm, gentle, patient. Like a trusted friend who listens without judgment.
    traversal:
      max_hops: 1
      relationship_weights:
        FAMILY_OF: 0.5
        KNEW: 1.0
        WORKED_WITH: 0.4
        FRIENDS_WITH: 1.0
      max_graph_results: 15
      include_cross_legacy: true
      temporal_range: "recent"

  colleague:
    name: "The Colleague"
    icon: "Briefcase"
    description: "Professional Companion - explores career, achievements, and work relationships"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens: 1024
    system_prompt: |
      You are The Colleague, a thoughtful professional companion helping preserve the career and work legacy of {legacy_name}.

      Your role:
      - Help users recall professional milestones, projects, and achievements
      - Explore work relationships, mentorship, and professional impact
      - Draw out stories about career transitions, challenges overcome, and lessons learned
      - Help capture the professional persona and work ethic of {legacy_name}

      When a user shares information about {legacy_name}:
      - Acknowledge their contribution with genuine interest
      - Ask about the professional context — what was the company, team, or project?
      - Explore how work relationships developed and what made them significant
      - Focus on the impact {legacy_name} had on colleagues and their field

      Tone: Respectful, professional yet warm. Like a thoughtful colleague writing a tribute.
    traversal:
      max_hops: 1
      relationship_weights:
        FAMILY_OF: 0.2
        KNEW: 0.6
        WORKED_WITH: 1.0
        FRIENDS_WITH: 0.5
      max_graph_results: 15
      include_cross_legacy: false
      temporal_range: "career"

  family:
    name: "The Family Member"
    icon: "Users"
    description: "Family Historian - preserves family bonds, traditions, and generational connections"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens: 1024
    system_prompt: |
      You are The Family Member, a compassionate family historian helping preserve the family story of {legacy_name}.

      Your role:
      - Help users explore family relationships, traditions, and generational connections
      - Draw out stories about family gatherings, holidays, and shared rituals
      - Explore the roles {legacy_name} played within the family — parent, sibling, grandparent
      - Help capture the warmth, humor, and love that defined family life

      When a user shares information about {legacy_name}:
      - Acknowledge the family bond with genuine warmth
      - Ask about other family members who were present or affected
      - Explore family traditions, inside jokes, and recurring moments
      - Help connect family stories across generations

      Tone: Warm, familial, nostalgic. Like a beloved family member gathering stories at a reunion.
    traversal:
      max_hops: 2
      relationship_weights:
        FAMILY_OF: 1.0
        KNEW: 0.3
        WORKED_WITH: 0.2
        FRIENDS_WITH: 0.4
      max_graph_results: 20
      include_cross_legacy: true
      temporal_range: "full"
```

**Step 4: Update PersonaConfig to include traversal**

In `services/core-api/app/config/personas.py`, update the `PersonaConfig` dataclass and `load_personas()` to load traversal config:

At line 26-36, update:

```python
@dataclass
class TraversalConfig:
    """Graph traversal configuration for a persona."""

    max_hops: int = 1
    relationship_weights: dict[str, float] = field(default_factory=dict)
    max_graph_results: int = 15
    include_cross_legacy: bool = True
    temporal_range: str = "full"


@dataclass
class PersonaConfig:
    """Configuration for an AI persona."""

    id: str
    name: str
    icon: str
    description: str
    model_id: str
    system_prompt: str
    max_tokens: int = field(default=1024)
    traversal: TraversalConfig = field(default_factory=TraversalConfig)
```

Update `load_personas()` at line 67-76:

```python
    for persona_id, data in personas_config.items():
        traversal_data = data.get("traversal", {})
        traversal = TraversalConfig(
            max_hops=traversal_data.get("max_hops", 1),
            relationship_weights=traversal_data.get("relationship_weights", {}),
            max_graph_results=traversal_data.get("max_graph_results", 15),
            include_cross_legacy=traversal_data.get("include_cross_legacy", True),
            temporal_range=traversal_data.get("temporal_range", "full"),
        )
        _personas[persona_id] = PersonaConfig(
            id=persona_id,
            name=data["name"],
            icon=data["icon"],
            description=data["description"],
            model_id=data["model_id"],
            system_prompt=data["system_prompt"],
            max_tokens=data.get("max_tokens", 1024),
            traversal=traversal,
        )
```

**Step 5: Run tests**

Run: `cd services/core-api && uv run pytest tests/config/ -v`
Expected: All tests PASS (including existing persona tests).

**Step 6: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 7: Commit**

```bash
git add services/core-api/app/config/personas.yaml services/core-api/app/config/personas.py services/core-api/tests/config/test_new_personas.py
git commit -m "feat: add colleague and family personas with traversal configs"
```

---

## Phase 4: GraphContextService Core  -- COMPLETED

> **Status:** All 4 tasks complete. 103 tests passing. `just validate-backend` passes (ruff + mypy).

### Task 13: IntentAnalyzer

**Files:**
- Create: `services/core-api/app/services/intent_analyzer.py`
- Create: `services/core-api/tests/services/test_intent_analyzer.py`

This task implements the LLM-based query intent classifier. Follow the same pattern as EntityExtractionService: LLM call → JSON parse → typed result → fallback on failure.

**Key interface:**

```python
class IntentAnalyzer:
    async def analyze(
        self, query: str, legacy_subject_name: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> QueryIntent
```

**QueryIntent dataclass:** `intent` (enum string), `entities` dict, `confidence` float.

**Intent types:** `relational`, `temporal`, `spatial`, `entity_focused`, `general`, `cross_legacy`.

**Fallback:** On failure or confidence < 0.5, return `general` intent with empty entities.

See design doc Section 5 for the full LLM prompt and details.

---

### Task 14: GraphTraversalService

**Files:**
- Create: `services/core-api/app/services/graph_traversal.py`
- Create: `services/core-api/tests/services/test_graph_traversal.py`

Maps `(QueryIntent, TraversalConfig)` to parameterized graph queries. See design doc Section 6 for the full openCypher query templates.

**Key interface:**

```python
class GraphTraversalService:
    async def traverse(
        self, graph_adapter: GraphAdapter, intent: QueryIntent,
        person_id: str, legacy_id: str, traversal_config: TraversalConfig,
    ) -> list[GraphResult]
```

**GraphResult dataclass:** `story_id`, `source_legacy_id`, `relevance_score`, `source_type` (relationship name), `hop_distance`.

---

### Task 15: GraphAccessFilter

**Files:**
- Create inside: `services/core-api/app/services/graph_context.py`
- Create: `services/core-api/tests/services/test_graph_access_filter.py`

Reuses existing `resolve_visibility_filter()` and `get_linked_legacy_filters()` from `services/core-api/app/services/retrieval.py`.

**Key interface:**

```python
class GraphAccessFilter:
    async def filter_story_ids(
        self, story_ids_with_sources: list[tuple[UUID, UUID, float]],
        user_id: UUID, primary_legacy_id: UUID, db: AsyncSession,
    ) -> list[tuple[UUID, float]]
```

See design doc Section 7 for filtering rules.

---

### Task 16: GraphContextService Orchestrator

**Files:**
- Create: `services/core-api/app/services/graph_context.py` (extends from Task 15)
- Create: `services/core-api/tests/services/test_graph_context.py`

The main orchestrator. See design doc Section 4 for the full class structure and processing pipeline.

**Key interface:**

```python
class GraphContextService:
    async def assemble_context(
        self, query: str, legacy_id: UUID, user_id: UUID,
        persona_type: str, db: AsyncSession,
        conversation_history: list[dict[str, str]] | None = None,
        linked_story_id: UUID | None = None,
        token_budget: int = 4000,
    ) -> AssembledContext
```

**Processing pipeline:**
1. `asyncio.gather(intent_analyzer.analyze(), retrieval_service.retrieve_context())` — parallel
2. `graph_traversal_service.traverse()` — sequential, depends on intent
3. `graph_access_filter.filter_story_ids()` — filter graph results
4. Merge + rank + deduplicate
5. Token budget + format

**Circuit breaker wraps** steps 2-3. If Neptune is down, return embedding-only results.

See design doc Sections 4, 8, and 10 for details on ranking, token budgeting, and context formatting.

---

## Phase 5: Integration  -- COMPLETED

> **Status:** Task 17 complete. 764 tests passing (760 passed, 2 skipped, 1 warning). `just validate-backend` passes (ruff + mypy).

### Task 17: Refactor prepare_turn() to Use GraphContextService

**Files:**
- Modify: `services/core-api/app/adapters/storytelling.py:176-283`
- Modify: `services/core-api/app/providers/registry.py`
- Create: `services/core-api/tests/adapters/test_storytelling_graph.py`

Modify `DefaultStorytellingAgent.prepare_turn()` to:
1. Check if `GraphContextService` is available (graph augmentation enabled)
2. If yes, call `graph_context_service.assemble_context()` instead of `self.vector_store.retrieve_context()` directly
3. Use the returned `formatted_context` as `story_context`
4. If no, fall back to existing behavior (embedding-only via `self.vector_store`)

The `DefaultStorytellingAgent.__init__()` gets an optional `graph_context_service` parameter. The `ProviderRegistry.get_storytelling_agent()` wires it up.

See design doc Section 4 for the integration point details. Reference `services/core-api/app/adapters/storytelling.py:194-211` for the current retrieval code to replace.

---

## Phase 6: Story Evolution Enhancement  -- COMPLETED

> **Status:** All 3 tasks complete. 770 tests passing (770 passed, 2 skipped, 1 warning). `just validate-backend` passes (ruff + mypy).

### Task 18: Graph-Enriched Opening Message

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:164-263`

Modify `generate_opening_message()` to call `GraphContextService` with the story's content as query before building the system prompt. Inject discovered connections into the opening instruction so the persona can suggest graph-discovered exploration directions.

See design doc Section 9.1 for details. Reference `services/core-api/app/services/story_evolution.py:218-224` for where to inject graph context into `build_system_prompt()`.

---

### Task 19: Graph Suggestion Directive for Elicitation

**Files:**
- Create: `services/core-api/app/config/graph_suggestions.txt`
- Modify: `services/core-api/app/config/personas.py:160-165`

Create the graph suggestion directive text file and conditionally append it during elicitation mode when graph augmentation is enabled.

See design doc Section 9.2 for the directive content.

---

### Task 20: Pre-Summarization Graph Enrichment

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:287-363`

Add a graph traversal step before summarization that discovers connections from entities mentioned during elicitation. Append these as an "Additional Context from Connected Stories" section to the summarization input.

See design doc Section 9.3 for details.

---

## Phase 7: Observability + Debug  -- COMPLETED

> **Status:** All 4 tasks complete. 770 tests passing (770 passed, 2 skipped, 1 warning). `just validate-backend` passes (ruff + mypy).

### Task 21: Add OTel Spans and Structured Logging

**Files:**
- Modify: All new service files from Phases 1-6

Add OpenTelemetry spans to all new service methods per the design doc Section 11. Add structured logging with the standard fields (`component`, `event`, plus domain-specific extras).

Reference `services/core-api/app/services/retrieval.py` for the existing span/logging patterns.

---

### Task 22: Add Prometheus Metrics

**Files:**
- Modify: `services/core-api/app/observability/metrics.py`

Add the metrics from design doc Section 11:
- `graph_context_latency_seconds` (Histogram, labels: `phase`)
- `graph_context_results_total` (Counter, labels: `source`)
- `graph_context_circuit_state` (Gauge, labels: `state`)
- `entity_extraction_entities_total` (Counter, labels: `type`)
- `neptune_query_latency_seconds` (Histogram, labels: `query_type`)

---

### Task 23: Add Debug Mode Endpoint

**Files:**
- Modify: `services/core-api/app/routes/conversation.py` (or the AI chat route)

Add `debug: bool = False` query parameter to persona chat endpoints. When `True`, include `AssembledContext.metadata` in the response.

See design doc Section 11 for the debug response format.

---

### Task 24: Final Validation and Performance Profiling

**Step 1:** Run full test suite: `cd services/core-api && uv run pytest -v`

**Step 2:** Run validation: `just validate-backend`

**Step 3:** Start local stack and test end-to-end:
```bash
docker compose -f infra/compose/docker-compose.yml up -d
# Test Neptune connectivity
curl http://localhost:18182
# Test entity extraction on a story
# Test graph-augmented chat
```

**Step 4:** Profile latency of the graph-augmented pipeline vs embedding-only to verify the latency budget is met.

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| 1: Foundation | 1-8 | GraphAdapter ABC + Local + Neptune + Factory + Circuit Breaker |
| 2: Entity Extraction | 9-11 | EntityExtractionService + Ingestion integration + Backfill |
| 3: Personas | 12 | Colleague + Family personas with traversal configs |
| 4: GraphContextService | 13-16 | IntentAnalyzer + Traversal + AccessFilter + Orchestrator |
| 5: Integration | 17 | prepare_turn() refactor to use GraphContextService |
| 6: Story Evolution | 18-20 | Graph-enriched opening + suggestions + pre-summarization |
| 7: Observability | 21-24 | OTel spans + Prometheus + Debug mode + Final validation |
