import logging
import sys

try:
    from pythonjsonlogger.json import JsonFormatter  # type: ignore
except ImportError:
    from pythonjsonlogger import jsonlogger  # type: ignore

    JsonFormatter = jsonlogger.JsonFormatter  # type: ignore[misc,attr-defined]


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
