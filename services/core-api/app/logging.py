import logging
import sys

try:
    from pythonjsonlogger.json import JsonFormatter  # type: ignore[import-untyped]
except ImportError:
    from pythonjsonlogger import jsonlogger  # type: ignore[import-untyped]

    JsonFormatter = jsonlogger.JsonFormatter  # type: ignore[attr-defined]


def configure_logging(level: str = "info") -> None:
    lvl = getattr(logging, level.upper(), logging.INFO)
    logger = logging.getLogger()
    logger.setLevel(lvl)
    handler = logging.StreamHandler(sys.stdout)
    fmt = JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    handler.setFormatter(fmt)
    logger.handlers = [handler]
