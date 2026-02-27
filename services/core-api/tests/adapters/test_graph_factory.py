"""Tests for GraphAdapter factory function."""

from __future__ import annotations

from app.adapters.graph_factory import create_graph_adapter
from app.adapters.local_graph import LocalGraphAdapter
from app.adapters.neptune_graph import NeptuneGraphAdapter
from app.config import get_settings


class TestCreateGraphAdapter:
    """Test the factory function for creating graph adapters."""

    def test_creates_local_adapter_when_no_neptune_host(self) -> None:
        get_settings.cache_clear()
        settings = get_settings()
        settings.neptune_host = None
        settings.graph_augmentation_enabled = True
        adapter = create_graph_adapter(settings)
        assert isinstance(adapter, LocalGraphAdapter)
        get_settings.cache_clear()

    def test_creates_neptune_adapter_when_host_set(self) -> None:
        get_settings.cache_clear()
        settings = get_settings()
        settings.neptune_host = "neptune.example.com"
        settings.neptune_iam_auth = True
        settings.neptune_env_prefix = "prod"
        settings.graph_augmentation_enabled = True
        adapter = create_graph_adapter(settings)
        assert isinstance(adapter, NeptuneGraphAdapter)
        get_settings.cache_clear()

    def test_returns_none_when_graph_disabled(self) -> None:
        get_settings.cache_clear()
        settings = get_settings()
        settings.graph_augmentation_enabled = False
        adapter = create_graph_adapter(settings)
        assert adapter is None
        get_settings.cache_clear()
