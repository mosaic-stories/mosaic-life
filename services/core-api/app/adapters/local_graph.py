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
        props = "".join(f".property('{k}', '{v}')" for k, v in properties.items())
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
            props = "".join(f".property('{k}', '{v}')" for k, v in properties.items())
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
        if depth > 1:
            repeat_clause = f".repeat(bothE().otherV()).times({depth}).dedup()"
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
