"""Local graph adapter using TinkerPop Gremlin Server (for local dev)."""

from __future__ import annotations

import logging
from typing import Any

from opentelemetry import trace

import time

import httpx

from ..observability.metrics import NEPTUNE_QUERY_LATENCY
from .graph_adapter import GraphAdapter, _prefix_label

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.graph_adapter")


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

    def _bind(self, bindings: dict[str, object], prefix: str, value: object) -> str:
        key = f"{prefix}_{len(bindings)}"
        bindings[key] = value
        return key

    def _property_steps(
        self, properties: dict[str, object] | None, bindings: dict[str, object]
    ) -> str:
        if not properties:
            return ""

        steps: list[str] = []
        for key, value in properties.items():
            value_binding = self._bind(bindings, key, value)
            steps.append(f".property('{key}', {value_binding})")
        return "".join(steps)

    async def _execute_gremlin(
        self,
        gremlin: str,
        bindings: dict[str, object] | None = None,
    ) -> list[dict[str, Any]]:
        """Execute a Gremlin query via the REST API."""
        with tracer.start_as_current_span("graph_adapter.query") as span:
            span.set_attribute("query_type", "gremlin")
            started = time.perf_counter()
            payload: dict[str, object] = {"gremlin": gremlin}
            if bindings:
                payload["bindings"] = bindings
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self._base_url}/gremlin",
                    json=payload,
                )
                response.raise_for_status()
                data: dict[str, Any] = response.json()
                result: list[dict[str, Any]] = data.get("result", {}).get("data", [])
                span.set_attribute("result_count", len(result))
                NEPTUNE_QUERY_LATENCY.labels(query_type="gremlin").observe(
                    time.perf_counter() - started
                )
                return result

    async def upsert_node(
        self, label: str, node_id: str, properties: dict[str, object]
    ) -> None:
        prefixed = self._label(label)
        bindings: dict[str, object] = {}
        node_id_binding = self._bind(bindings, "node_id", node_id)
        # Gremlin upsert: try to get existing, fold to add if not found
        props = self._property_steps(properties, bindings)
        gremlin = (
            f"g.V().has('{prefixed}', 'id', {node_id_binding})"
            f".fold().coalesce("
            f"  unfold(),"
            f"  addV('{prefixed}').property('id', {node_id_binding})"
            f"){props}"
        )
        await self._execute_gremlin(gremlin, bindings)

    async def delete_node(self, label: str, node_id: str) -> None:
        prefixed = self._label(label)
        bindings: dict[str, object] = {}
        node_id_binding = self._bind(bindings, "node_id", node_id)
        gremlin = f"g.V().has('{prefixed}', 'id', {node_id_binding}).drop()"
        await self._execute_gremlin(gremlin, bindings)

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
        bindings: dict[str, object] = {}
        from_id_binding = self._bind(bindings, "from_id", from_id)
        to_id_binding = self._bind(bindings, "to_id", to_id)
        props = self._property_steps(properties, bindings)
        gremlin = (
            f"g.V().has('{fl}', 'id', {from_id_binding})"
            f".addE('{rt}')"
            f".to(g.V().has('{tl}', 'id', {to_id_binding}))"
            f"{props}"
        )
        await self._execute_gremlin(gremlin, bindings)

    async def upsert_relationship(
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
        bindings: dict[str, object] = {}
        from_id_binding = self._bind(bindings, "from_id", from_id)
        to_id_binding = self._bind(bindings, "to_id", to_id)
        props = self._property_steps(properties, bindings)
        gremlin = (
            f"g.V().has('{fl}', 'id', {from_id_binding})"
            f".as('a')"
            f".V().has('{tl}', 'id', {to_id_binding})"
            f".as('b')"
            f".coalesce("
            f"select('a').outE('{rt}').where(inV().has('{tl}', 'id', {to_id_binding})),"
            f"select('a').addE('{rt}').to(select('b'))"
            f")"
            f"{props}"
        )
        await self._execute_gremlin(gremlin, bindings)

    async def replace_relationship(
        self,
        from_label: str,
        from_id: str,
        rel_types_to_replace: list[str],
        to_label: str,
        to_id: str,
        new_rel_type: str | None = None,
        properties: dict[str, object] | None = None,
    ) -> None:
        fl = self._label(from_label)
        tl = self._label(to_label)
        bindings: dict[str, object] = {}
        from_id_binding = self._bind(bindings, "from_id", from_id)
        to_id_binding = self._bind(bindings, "to_id", to_id)
        edge_filter = ", ".join(
            f"'{self._rel_type(rel_type)}'" for rel_type in rel_types_to_replace
        )
        gremlin = (
            f"g.V().has('{fl}', 'id', {from_id_binding})"
            f".as('a')"
            f".outE({edge_filter})"
            f".where(inV().has('{tl}', 'id', {to_id_binding}))"
            f".drop()"
        )
        if new_rel_type:
            rt = self._rel_type(new_rel_type)
            props = self._property_steps(properties, bindings)
            gremlin += (
                f".V().has('{fl}', 'id', {from_id_binding})"
                f".addE('{rt}')"
                f".to(g.V().has('{tl}', 'id', {to_id_binding}))"
                f"{props}"
            )
        await self._execute_gremlin(gremlin, bindings)

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
        bindings: dict[str, object] = {}
        from_id_binding = self._bind(bindings, "from_id", from_id)
        to_id_binding = self._bind(bindings, "to_id", to_id)
        gremlin = (
            f"g.V().has('{fl}', 'id', {from_id_binding})"
            f".outE('{rt}')"
            f".where(inV().has('{tl}', 'id', {to_id_binding}))"
            f".drop()"
        )
        await self._execute_gremlin(gremlin, bindings)

    async def clear_story_entity_relationships(self, story_id: str) -> None:
        story_label = self._label("Story")
        bindings: dict[str, object] = {}
        story_id_binding = self._bind(bindings, "story_id", story_id)
        relationship_types = [
            self._rel_type("TOOK_PLACE_AT"),
            self._rel_type("REFERENCES"),
            self._rel_type("WRITTEN_ABOUT"),
            self._rel_type("MENTIONS"),
            self._rel_type("AUTHORED_BY"),
        ]
        edge_filter = ", ".join(f"'{rel_type}'" for rel_type in relationship_types)
        gremlin = f"g.V().has('{story_label}', 'id', {story_id_binding}).outE({edge_filter}).drop()"
        await self._execute_gremlin(gremlin, bindings)

    async def get_connections(
        self,
        label: str,
        node_id: str,
        rel_types: list[str] | None = None,
        depth: int = 1,
    ) -> list[dict[str, object]]:
        prefixed = self._label(label)
        bindings: dict[str, object] = {}
        node_id_binding = self._bind(bindings, "node_id", node_id)
        if rel_types:
            edge_filter = ", ".join(f"'{self._rel_type(r)}'" for r in rel_types)
            edge_clause = f".bothE({edge_filter})"
        else:
            edge_clause = ".bothE()"

        # For depth > 1, repeat traversal
        if depth > 1:
            repeat_clause = f".repeat(bothE().otherV()).times({depth}).dedup()"
            gremlin = (
                f"g.V().has('{prefixed}', 'id', {node_id_binding})"
                f"{repeat_clause}"
                f".valueMap(true).toList()"
            )
        else:
            gremlin = (
                f"g.V().has('{prefixed}', 'id', {node_id_binding})"
                f"{edge_clause}.otherV()"
                f".valueMap(true).toList()"
            )
        return await self._execute_gremlin(gremlin, bindings)

    async def find_path(
        self,
        from_id: str,
        to_id: str,
        max_depth: int = 6,
    ) -> list[dict[str, object]]:
        bindings: dict[str, object] = {}
        from_id_binding = self._bind(bindings, "from_id", from_id)
        to_id_binding = self._bind(bindings, "to_id", to_id)
        gremlin = (
            f"g.V().has('id', {from_id_binding})"
            f".repeat(bothE().otherV().simplePath())"
            f".until(has('id', {to_id_binding}).or().loops().is({max_depth}))"
            f".has('id', {to_id_binding})"
            f".path().limit(1).toList()"
        )
        return await self._execute_gremlin(gremlin, bindings)

    async def get_related_stories(
        self,
        story_id: str,
        limit: int = 10,
    ) -> list[dict[str, object]]:
        prefixed = self._label("Story")
        bindings: dict[str, object] = {}
        story_id_binding = self._bind(bindings, "story_id", story_id)
        gremlin = (
            f"g.V().has('{prefixed}', 'id', {story_id_binding})"
            f".bothE().otherV().bothE().otherV()"
            f".hasLabel('{prefixed}').dedup()"
            f".limit({limit}).valueMap(true).toList()"
        )
        return await self._execute_gremlin(gremlin, bindings)

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
