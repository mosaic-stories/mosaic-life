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
