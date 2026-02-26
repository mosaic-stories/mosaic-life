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
