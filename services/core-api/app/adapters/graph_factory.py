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
