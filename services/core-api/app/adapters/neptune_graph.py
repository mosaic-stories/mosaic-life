"""AWS Neptune graph adapter using openCypher over HTTPS."""

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
        with tracer.start_as_current_span("graph_adapter.query") as span:
            span.set_attribute("query_type", "cypher")
            started = time.perf_counter()
            headers: dict[str, str] = {
                "Content-Type": "application/x-www-form-urlencoded"
            }

            if self.iam_auth:
                # SigV4 signing for IAM auth
                headers = await self._sign_request(headers)

            body = f"query={cypher}"
            if params:
                import json

                body += f"&parameters={json.dumps(params)}"

            async with httpx.AsyncClient(timeout=10.0, verify=True) as client:
                response = await client.post(
                    f"{self._base_url}/openCypher",
                    content=body,
                    headers=headers,
                )
                response.raise_for_status()
                data: dict[str, Any] = response.json()
                results: list[dict[str, Any]] = data.get("results", [])
                span.set_attribute("result_count", len(results))
                NEPTUNE_QUERY_LATENCY.labels(query_type="cypher").observe(
                    time.perf_counter() - started
                )
                return results

    async def _sign_request(self, headers: dict[str, str]) -> dict[str, str]:
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
            f"MERGE (n:`{prefixed}` {{id: $node_id}}) SET {set_clause}"
            if set_clause
            else f"MERGE (n:`{prefixed}` {{id: $node_id}})"
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
        return await self._execute_cypher(cypher, {"from_id": from_id, "to_id": to_id})

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
